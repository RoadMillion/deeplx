import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from 'redis';
const usageKeyPrefix = 'apiUsageV1';
const totalUsageKeyPrefix = 'totalUsageV1';
const wordUsageKeyPrefix = 'wordUsage';
const busyKeyPrefix = 'busyUsage:';
const invalidTempKeyPrefix = 'INVALID:';
const apiPrefix = 'api:';

const FIEXD_WAIT_MS = Math.floor(Math.random() * (300 - 200 + 1)) + 200;
const API_ENDPOINTS = process.env.API_ENDPOINTS.split(',');
const redis = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    }
});
redis.connect()
const MAX_RETRIES = 3;

export default async (req: VercelRequest, res: VercelResponse) => {
  await delay(FIEXD_WAIT_MS);
  const requestData = req.body;
  await redis.sendCommand(['incrby', wordUsageKeyPrefix, String(requestData.text.length)]);
  await redis.incr(totalUsageKeyPrefix);
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    let currentIndex = await getNextAvailableEndpointIndex();
    if (currentIndex === -1) {
      await delay(100 * Math.pow(2, retry));
    } else {
      try {
        const selectedAPI = API_ENDPOINTS[currentIndex];
        const response = await fetch(selectedAPI, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        });
        const responseData = await response.json();
        if (response.ok) {
          // Request successful, release the token
          await unlock(`${apiPrefix}${currentIndex}`)
          if (responseData.code !== 200) {
              await redis.incr(busyKeyPrefix);
              await markInvalid(`${invalidTempKeyPrefix}${currentIndex}`);
              if (retry === 3) {
                  const realRes = await callRealApi(requestData);
                  console.log(`selectedAPI:${selectedAPI} no avaiable now, code: ${responseData.code}! we use real api: ${JSON.stringify(realRes)} finanlly!`);
                  return res.json(realRes);    
              }
              continue;
          }
          return res.json(responseData);
        }
      } catch (error) {
        console.error(error);
      }
    }
    if(currentIndex !== -1) {
      unlock(`${apiPrefix}${currentIndex}`);
    }
  }

  return res.status(500).json({ error: 'Internal Server Error' });
};


async function getNextAvailableEndpointIndex() {
  const indices = Array.from({ length: API_ENDPOINTS.length }, (_, i) => i);
  shuffleArray(indices); // Randomize the order of indices
  
  for (const index of indices) {
    if (await exist(`${invalidTempKeyPrefix}${index}`)) {
        continue;
    }
    if (await tryAcquireToken(index)) {
      return index;
    }
  }
  return -1; // No available endpoints
}

// Utility function to shuffle an array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
}


async function tryAcquireToken(index) {
  const redisKey = `${apiPrefix}${index}`;
  const lockResult = await lock(redisKey);
  return lockResult;
}
const REAL_API_URL = 'https://api-free.deepl.com/v2/translate';

async function callRealApi(reqDataRaw) {
    const reqData = JSON.parse(JSON.stringify(reqDataRaw));
    const authKeys = process.env.DEEPL_KEY.split(',');
    const key = authKeys[getRandomInt(authKeys.length)];
    const authKey = `DeepL-Auth-Key ${key}`;
    reqData.text = [reqData.text];
    if ('auto' === reqData['source_lang']) {
        delete reqData['source_lang'];
    }
    const req = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
              'Authorization': authKey
          },
          body: JSON.stringify(reqData),
        };
    const response = await fetch(REAL_API_URL, req);
    const resJson = await response.json();
    await redis.incr(usageKeyPrefix);
    return {
        'id': Math.floor(Math.random() * 100000 + 100000) * 1000,
        'code': 200,
        'data': resJson.translations[0].text
    }
}
function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

async function lock(key) {
    const r = await redis.sendCommand(['SET', key, '1', 'NX', 'EX', '10']);
    return r === 'OK';
}

async function unlock(key) {
    return await redis.del(key);
}

async function markInvalid(key) {
   await redis.sendCommand(['SET', key, '1', 'EX', '20']);
}

async function exist(key) {
    const r = await redis.exists(key);
    return r > 0;
}


function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
