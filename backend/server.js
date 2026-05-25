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

// ─── CORS: only allow requests from our own domain ────────────────────────────
const ALLOWED_ORIGINS = [
  'https://onetesla.onrender.com',
  'http://localhost:5173',   // local dev
  'http://localhost:3000',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no Origin header) and our domain
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// ─── Simple API key middleware (protects all /api/tesla/* routes) ─────────────
// Set APP_SECRET env var in Render. The frontend sends it as X-App-Secret header.
// The OAuth flow (/auth, /callback) is exempted so login still works.
const APP_SECRET = process.env.APP_SECRET;
const EXEMPT_PATHS = ['/api/tesla/auth', '/api/tesla/callback', '/api/tesla/status'];

app.use('/api/tesla', (req, res, next) => {
  if (!APP_SECRET) return next(); // not set = dev mode, skip check
  if (EXEMPT_PATHS.some(p => req.path === p)) return next();
  const secret = req.headers['x-app-secret'] || req.query._s;
  if (secret !== APP_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});


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
