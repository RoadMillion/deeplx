import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

const API_ENDPOINTS = [
  { url: 'https://3ct3dpprtd.us.aircode.run/translate', limit: 2 },  
  { url: 'https://kn4ktu55mg.us.aircode.run/translate', limit: 2 },
  { url: 'https://5wuu6ykrr4.us.aircode.run/translate', limit: 2 },
  { url: 'https://lily.ai-chat.tech/api/translate', limit: 2 }
];

const lastRequestTimestamps: number[] = new Array(API_ENDPOINTS.length).fill(0);

const RATE_LIMIT = 1000; // 每秒的速率限制，这里设置为 1000 毫秒

function selectAvailableAPI(): number | null {
  const now = Date.now();

  for (let i = 0; i < API_ENDPOINTS.length; i++) {
    if ((now - lastRequestTimestamps[i]) >= RATE_LIMIT) {
      return i;
    }
  }

  return null;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  const requestData = req.body;

  // if (!requestData || !requestData.text || !requestData.source_lang || !requestData.target_lang) {
  //   return res.status(400).json({ error: 'Invalid request data' });
  // }

  const selectedAPIIndex = selectAvailableAPI();

  if (selectedAPIIndex === null) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const selectedAPI = API_ENDPOINTS[selectedAPIIndex];
  const now = Date.now();

  try {
    const response = await fetch(selectedAPI.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (response.ok) {
      lastRequestTimestamps[selectedAPIIndex] = now;
      const responseData = await response.json();
      res.json(responseData);
    } else {
      return res.status(response.status).json({ error: 'API request failed' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

