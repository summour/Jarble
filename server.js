import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Gemini proxy route for server-side AI features
app.post('/api/gemini', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || req.headers['x-gemini-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: { message: 'No GEMINI_API_KEY configured' } });
  }

  const model = req.body?.model || 'gemini-2.0-flash';
  const apiVersion = req.body?.apiVersion || 'v1beta';

  try {
    const payload = req.body?.payload || {
      contents: req.body?.contents || [{ role: 'user', parts: [{ text: req.body?.prompt || '' }] }],
      generationConfig: req.body?.generationConfig || {}
    };

    const targetUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message || 'Gemini proxy error' } });
  }
});

// Serve static assets from project root
app.use(express.static(__dirname, {
  index: 'index.html',
  dotfiles: 'ignore'
}));

// Fallback to index.html for SPA client navigation (only for non-file route requests)
app.get('*', (req, res) => {
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Jarble server listening at http://0.0.0.0:${PORT}`);
});
