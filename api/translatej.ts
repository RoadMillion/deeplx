import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from 'redis';
console.log(process.env);
const redis = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: 15748
    }
});
const maxRateLimit = 1;
const redisKeyPrefix = 'tokenBucket:';
const API_ENDPOINTS = process.env.API_ENDPOINTS.split(',');

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

async function releaseToken(index) {
  const redisKey = `${redisKeyPrefix}${index}`;
  await redis.incr(redisKey); // Release the token by incrementing the count
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
