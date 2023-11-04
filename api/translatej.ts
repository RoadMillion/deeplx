import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const redisKeyPrefix = 'tokenBucket:';
const API_ENDPOINTS = [
  'https://3ct3dpprtd.us.aircode.run/translate',
  'https://kn4ktu55mg.us.aircode.run/translate',
  'https://5wuu6ykrr4.us.aircode.run/translate',
  'https://lily.ai-chat.tech/api/translate',
  'https://gpt.ai-chat.tech/api/translate'
];

const MAX_RETRIES = 5;

export default async (req: VercelRequest, res: VercelResponse) => {
  const requestData = req.body;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    const currentIndex = await getNextAvailableEndpointIndex();
    console.log('currentIndex: ' + currentIndex);
    if (currentIndex === -1) {
      console.log('waiting');
      await delay(100 * Math.pow(2, retry));
    } else {
      try {
        const selectedAPI = API_ENDPOINTS[currentIndex];
        console.log('api: ' + selectedAPI);
        const response = await fetch(selectedAPI, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        });

        if (response.ok) {
          // Request successful, release the token
          await releaseToken(currentIndex);
          const responseData = await response.json();
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
  for (let i = 0; i < API_ENDPOINTS.length; i++) {
    if (await tryAcquireToken(i)) {
      return i;
    }
  }
  return -1; // No available endpoints
}

async function tryAcquireToken(index) {
  const redisKey = `${redisKeyPrefix}${index}`;
  const result = await redis.decr(redisKey); // Use Redis DECR to atomically decrement the token count
  if (result === 0) {
    // No tokens available, reset the count and return false
    // await redis.incr(redisKey);
    return false;
  }
  return true;
}

async function releaseToken(index) {
  const redisKey = `${redisKeyPrefix}${index}`;
  await redis.incr(redisKey); // Release the token by incrementing the count
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
