import { VercelRequest, VercelResponse } from '@vercel/node';

const API_ENDPOINTS = [
  'https://3ct3dpprtd.us.aircode.run/translate',
  'https://kn4ktu55mg.us.aircode.run/translate',
  'https://5wuu6ykrr4.us.aircode.run/translate'
  'https://lily.ai-chat.tech/api/translate',
  'https://gpt.ai-chat.tech/api/translate'
];

export default async (req: VercelRequest, res: VercelResponse) => {
  const requestData = req.body;

  // if (!requestData || !requestData.text || !requestData.source_lang || !requestData.target_lang) {
  //   return res.status(400).json({ error: 'Invalid request data' });
  // }

  const selectedAPI = API_ENDPOINTS[Math.floor(Math.random() * API_ENDPOINTS.length)];

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


