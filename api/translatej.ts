import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from 'redis';
const maxRateLimit = 1;
const redisKeyPrefix = 'tokenBucket2:';
const usageKeyPrefix = 'apiUsage';

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
  console.log(1);
  const requestData = req.body;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    let currentIndex = await getNextAvailableEndpointIndex();
    // console.log('currentIndex: ' + currentIndex);
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
        console.log(2);

        if (response.ok) {
              console.log(3);
          // Request successful, release the token
          await releaseToken(currentIndex);
          const responseData = await response.json();
            console.log(3);
          if (responseData.code !== 200) {
              const realRes = await callRealApi(requestData);
              console.log('finanlly! use real api: ' + JSON.stringify(realRes));
              return res.json(realRes);
          }
          // console.log('api: ' + selectedAPI + ' res:'+ JSON.stringify(responseData));
          return res.json(responseData);
        }
      } catch (error) {
        console.error(error);
        // Request failed, retry or release the token based on your error handling logic
        await releaseToken(currentIndex);
      }
    }
  }

  return res.status(500).json({ error: 'Internal Server Error' });
};


async function getNextAvailableEndpointIndex() {
  const indices = Array.from({ length: API_ENDPOINTS.length }, (_, i) => i);
  shuffleArray(indices); // Randomize the order of indices
  
  for (const index of indices) {
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
  const redisKey = `${redisKeyPrefix}${index}`;
  const result = await redis.decr(redisKey);
  if (result < -1 * maxRateLimit) {
    // No tokens available, reset the count and return false
    await redis.incr(redisKey);
    return false;
  }
  return true;
}
const REAL_API_URL = 'https://api-free.deepl.com/v2/translate';

async function callRealApi(reqData) {
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
    console.log('using final api');
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


async function releaseToken(index) {
  const redisKey = `${redisKeyPrefix}${index}`;
  await redis.incr(redisKey); // Release the token by incrementing the count
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
