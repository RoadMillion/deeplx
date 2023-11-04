import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const API_ENDPOINTS = process.env.API_ENDPOINTS.split(',');
const redisKey = 'currentApiIndex';

export default async (req: VercelRequest, res: VercelResponse) => {
  const requestData = req.body;

  const currentIndex = await redis.incrby(redisKey, 1);

  const selectedAPI = API_ENDPOINTS[currentIndex % API_ENDPOINTS.length];
  console.log('use: ' + selectedAPI);

  try {
    const response = await fetch(selectedAPI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (response.ok) {
      const responseData = await response.json();
      res.json(responseData);
    } else {
      return res.status(response.status).json({ error: 'API request failed' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
