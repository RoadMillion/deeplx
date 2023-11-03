import fetch from 'node-fetch';

// 定义三个 API 的地址和速率限制
const apiEndpoints = [
  { url: 'https://3ct3dpprtd.us.aircode.run/translate', limit: 2 },  
  { url: 'https://kn4ktu55mg.us.aircode.run/translate', limit: 2 },
  { url: 'https://5wuu6ykrr4.us.aircode.run/translate', limit: 2 },
  { url: 'https://lily.ai-chat.tech/api/translate', limit: 2 }

];

// 记录上次请求的时间戳
const lastRequestTimestamps = new Array(apiEndpoints.length).fill(0);

// 函数以 JSON 格式的请求数据作为参数
export default async (req, res) => {
  const requestData = req.body;

  // 确保请求数据有效
  // if (!requestData || !requestData.text || !requestData.source_lang || !requestData.target_lang) {
  //   return res.status(400).json({ error: 'Invalid request data' });
  // }

  const now = Date.now();

  // 选择可用的 API
  const availableAPIs = apiEndpoints.filter((api, index) => {
    return (now - lastRequestTimestamps[index]) >= (1000 / api.limit);
  });

  if (availableAPIs.length === 0) {
    // 所有 API 都超过速率限制
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // 随机选择一个可用的 API
  const selectedAPI = availableAPIs[Math.floor(Math.random() * availableAPIs.length)];

  try {
    const response = await fetch(selectedAPI.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (response.ok) {
      lastRequestTimestamps[apiEndpoints.indexOf(selectedAPI)] = now;
      const responseData = await response.json();
      res.json(responseData);
    } else {
      return res.status(response.status).json({ error: 'API request failed' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
