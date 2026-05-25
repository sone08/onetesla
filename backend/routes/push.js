/**
 * Push notification routes
 * - GET  /api/tesla/push-key       → returns VAPID public key
 * - POST /api/tesla/push-subscribe → saves subscription
 * - POST /api/tesla/push-test      → sends a test push
 *
 * Background: every 3 min, fetches incidents near the car and
 * sends a push if new police alerts appear.
 */
import express from 'express';
import webPush from 'web-push';
import axios from 'axios';

const router = express.Router();

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  NGROK_URL
} = process.env;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    `mailto:onetesla@example.com`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

// In-memory subscription store (persists as long as server runs)
const subscriptions = new Set();
let lastPoliceCount = 0;

// ── Routes ────────────────────────────────────────────────────────────────────
router.get('/push-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY ?? '' });
});

router.post('/push-subscribe', (req, res) => {
  const sub = req.body;
  if (sub?.endpoint) {
    subscriptions.add(JSON.stringify(sub));
    console.log(`🔔 Push subscription registered (total: ${subscriptions.size})`);
  }
  res.json({ ok: true });
});

router.post('/push-test', async (req, res) => {
  const payload = JSON.stringify({
    title: '🚔 OneTesla Test Alert',
    body: 'Push notifications are working!',
    icon: '/favicon.svg'
  });
  await sendToAll(payload);
  res.json({ ok: true, subs: subscriptions.size });
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function sendToAll(payload) {
  const dead = [];
  for (const raw of subscriptions) {
    try {
      await webPush.sendNotification(JSON.parse(raw), payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) dead.push(raw);
    }
  }
  dead.forEach(d => subscriptions.delete(d));
}

// ── Background police alert poller (every 3 minutes) ─────────────────────────
// Needs access to the getAccessToken + teslaApi helpers → imported lazily
let teslaRouterModule = null;

async function pollForAlerts() {
  if (subscriptions.size === 0) return;
  try {
    // Get car location
    const vRes = await axios.get('http://localhost:' + (process.env.PORT || 3000) + '/api/tesla/vehicles', {
      headers: { 'x-internal': '1' }
    }).catch(() => null);
    if (!vRes?.data?.response?.[0]?.id) return;
    const id = vRes.data.response[0].id;

    const locRes = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/tesla/vehicles/${id}/location`, {
      headers: { 'x-internal': '1' }
    }).catch(() => null);
    if (!locRes?.data?.lat) return;

    const { lat, lon } = locRes.data;
    const incRes = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/tesla/incidents?lat=${lat}&lon=${lon}&radius=10`, {
      headers: { 'x-internal': '1' }
    }).catch(() => null);

    const police = (incRes?.data ?? []).filter(i => i.type === 'POLICE');
    if (police.length > lastPoliceCount) {
      const newCount = police.length - lastPoliceCount;
      const payload = JSON.stringify({
        title: `🚔 ${newCount} new police report${newCount > 1 ? 's' : ''} nearby`,
        body: police.slice(0, 3).map(p => p.street ?? 'Nearby road').join(', '),
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'police-alert',
        renotify: true
      });
      await sendToAll(payload);
    }
    lastPoliceCount = police.length;
  } catch { /* silent */ }
}

// Start polling after 30s (let server boot first)
setTimeout(() => {
  setInterval(pollForAlerts, 3 * 60 * 1000);
}, 30000);

export default router;
