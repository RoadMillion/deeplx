import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from 'redis';
const usageKeyPrefix = 'apiUsageV1';
const totalUsageKeyPrefix = 'totalUsageV1';
const invalidTempKeyPrefix = 'INVALID:'
const apiPrefix = 'api:';

const FIEXD_WAIT_MS = 300;
const API_ENDPOINTS = process.env.API_ENDPOINTS.split(',');
const redis = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    }
});
redis.connect()
const MAX_RETRIES = 5;

export default async (req: VercelRequest, res: VercelResponse) => {
  await delay(FIEXD_WAIT_MS);
  const requestData = req.body;
  console.log(1);
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
        await redis.incr(totalUsageKeyPrefix);
        const responseData = await response.json();
        if (response.ok) {
          // Request successful, release the token
          await unlock(`${apiPrefix}${currentIndex}`)
          if (responseData.code !== 200) {
              await markInvalid(`${invalidTempKeyPrefix}${currentIndex}`);
              if (retry === 3){
                  const realRes = await callRealApi(requestData);
                  console.log(`selectedAPI:${selectedAPI} no avaiable now, code: ${responseData.code}! we use real api: ${JSON.stringify(realRes)} finanlly!`);
                  return res.json(realRes);    
              }
          }
          return res.json(responseData);
        }
      } catch (error) {
        console.error(error);
        if(currentIndex !== -1) {
            unlock(`${apiPrefix}${currentIndex}`);
        }
      }
    }
  }

  return res.status(500).json({ error: 'Internal Server Error' });
};


async function getNextAvailableEndpointIndex() {
  const indices = Array.from({ length: API_ENDPOINTS.length }, (_, i) => i);
  shuffleArray(indices); // Randomize the order of indices
  
  for (const index of indices) {
      console.log(2);
    if (!(await isValidKey(`${invalidTempKeyPrefix}${index}`))) {
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
    console.log('try');
  const redisKey = `${apiPrefix}${index}`;
  const lockResult = await lock(index);
    console.log('lock result');
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
        'data': resJson.translations[0].text;
    }
}
function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

async function lock(key) {
    console.log('lock');
    const r = await redis.set(key, 1, {
      EX: 10,
      NX: true
    });
    console.log(`lock type: ${typeof r}, lock result: ${r}`);
    return r;
}

async function unlock(key) {
    console.log('un');
    return await redis.del(key);
}

async function markInvalid(key) {
    console.log('v');
   await redis.set(key, 1, {
      EX: 5
    });
}

async function isValidKey(key) {
    console.log('i');
    return await redis.exists(key);
}


function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
