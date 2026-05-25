import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import teslaRoutes from './routes/tesla.js';
import pushRoutes from './routes/push.js';

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// ─── Tesla required: serve public key for domain verification ─────────────────
app.get('/.well-known/appspecific/com.tesla.3p.public-key.pem', (req, res) => {
  try {
    // Try file first, fall back to env var (for cloud deploy where file isn't committed)
    let key;
    try {
      key = readFileSync(join(__dirname, 'public-key.pem'), 'utf8');
    } catch {
      key = process.env.TESLA_PUBLIC_KEY?.replace(/\\n/g, '\n') ?? null;
    }
    if (!key) return res.status(404).send('Public key not found');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.send(key);
  } catch {
    res.status(404).send('Public key not found');
  }
});

// Tesla API routes
app.use('/api/tesla', teslaRoutes);
app.use('/api/tesla', pushRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Serve built frontend ─────────────────────────────────────────────────────
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ OneTesla backend running on http://localhost:${PORT}`);
});
