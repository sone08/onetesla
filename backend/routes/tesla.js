import express from 'express';
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, '..', '.tokens.json');

const {
  TESLA_CLIENT_ID,
  TESLA_CLIENT_SECRET,
  TESLA_REDIRECT_URI,
  TESLA_AUTH_URL,
  TESLA_AUDIENCE,
  NGROK_URL
} = process.env;

// Persist tokens to disk so they survive backend restarts
function loadTokens() {
  // 1. Try disk (survives restarts, not redeploys)
  try {
    if (existsSync(TOKEN_FILE)) {
      const t = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
      if (t.refresh_token) return t;
    }
  } catch (_) {}
  // 2. Fall back to env vars — set TESLA_REFRESH_TOKEN in Render dashboard to survive redeploys
  if (process.env.TESLA_REFRESH_TOKEN) {
    return {
      access_token: process.env.TESLA_ACCESS_TOKEN || null,
      refresh_token: process.env.TESLA_REFRESH_TOKEN,
    };
  }
  return { access_token: null, refresh_token: null };
}
function saveTokens(t) {
  try { writeFileSync(TOKEN_FILE, JSON.stringify(t)); } catch (_) {}
  // Log refresh token on every save — makes it easy to copy to Render env vars
  if (t.refresh_token) {
    console.log('\n🔑 REFRESH TOKEN (copy to Render env var TESLA_REFRESH_TOKEN):');
    console.log(t.refresh_token);
    console.log('');
  }
}

let tokenStore = loadTokens();

// ─── STEP 1: Redirect user to Tesla login ─────────────────────────────────────
router.get('/auth', (req, res) => {
  const scope = 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds';
  const state = Math.random().toString(36).substring(2);
  const url = `${TESLA_AUTH_URL}/authorize?` +
    `client_id=${encodeURIComponent(TESLA_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(TESLA_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${state}` +
    `&locale=en-US` +
    `&prompt=login`;
  res.redirect(url);
});

// ─── STEP 2: Handle OAuth callback, exchange code for tokens ──────────────────
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      code,
      redirect_uri: TESLA_REDIRECT_URI,
      audience: TESLA_AUDIENCE
    });
    const response = await axios.post(`${TESLA_AUTH_URL}/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    tokenStore = response.data;
    saveTokens(tokenStore);
    res.redirect(NGROK_URL || 'http://localhost:3000');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Authentication failed', detail: err.response?.data });
  }
});

// ─── Helper: Get valid access token (auto-refresh if needed) ──────────────────
async function getAccessToken() {
  if (!tokenStore.refresh_token) throw new Error('Not authenticated');
  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      refresh_token: tokenStore.refresh_token
    });
    const response = await axios.post(`${TESLA_AUTH_URL}/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    tokenStore = { ...tokenStore, ...response.data };
    saveTokens(tokenStore);
    return tokenStore.access_token;
  } catch (err) {
    console.error('Token refresh failed:', err.response?.data || err.message);
    throw new Error('Token refresh failed');
  }
}

// ─── Helper: Tesla Fleet API request (auto-refreshes token on 401) ───────────
async function teslaApi(method, path, data = null) {
  const makeReq = async (token) => axios({
    method,
    url: `${TESLA_AUDIENCE}${path}`,
    headers: { Authorization: `Bearer ${token}` },
    data
  });

  // Try with current access token first
  let token = tokenStore.access_token;
  if (!token) token = await getAccessToken();

  try {
    const response = await makeReq(token);
    return response.data;
  } catch (err) {
    // On 401 — access token expired, force a refresh and retry once
    if (err.response?.status === 401) {
      try {
        token = await getAccessToken();
        const response = await makeReq(token);
        return response.data;
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

// ─── Check auth status ────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    authenticated: !!(tokenStore.access_token || tokenStore.refresh_token),
    has_refresh_token: !!tokenStore.refresh_token,
  });
});

// ─── GET: Show refresh token (for copying to Render env vars) ─────────────────
router.get('/token-info', (req, res) => {
  if (!tokenStore.refresh_token) {
    return res.json({ error: 'No token. Visit /api/tesla/auth to log in first.' });
  }
  res.json({
    refresh_token: tokenStore.refresh_token,
    instruction: 'Copy refresh_token → Render dashboard → Environment → TESLA_REFRESH_TOKEN'
  });
});

// ─── POST: Register app with Tesla Fleet API (one-time required step) ─────────
router.post('/register', async (req, res) => {
  try {
    // Step 1: Get a partner token (client_credentials — app level, not user level)
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: TESLA_CLIENT_ID,
      client_secret: TESLA_CLIENT_SECRET,
      scope: 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds',
      audience: TESLA_AUDIENCE
    });
    const tokenRes = await axios.post(`${TESLA_AUTH_URL}/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const partnerToken = tokenRes.data.access_token;

    // Step 2: Register the app domain with Tesla Fleet API
    const domain = new URL(NGROK_URL || TESLA_REDIRECT_URI).hostname;
    const regRes = await axios.post(
      `${TESLA_AUDIENCE}/api/1/partner_accounts`,
      { domain },
      { headers: { Authorization: `Bearer ${partnerToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ ok: true, data: regRes.data });
  } catch (err) {
    console.error('Register error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ─── GET: List all vehicles ───────────────────────────────────────────────────
router.get('/vehicles', async (req, res) => {
  try {
    const data = await teslaApi('GET', '/api/1/vehicles');
    res.json(data);
  } catch (err) {
    console.error('Vehicles error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

// ─── GET: Vehicle state — uses /vehicle_data (single call, handles sleep) ─────
router.get('/vehicles/:id/state', async (req, res) => {
  try {
    const data = await teslaApi(
      'GET',
      `/api/1/vehicles/${req.params.id}/vehicle_data?endpoints=charge_state%3Bclimate_state%3Bdrive_state%3Bvehicle_state`
    );
    const r = data.response;
    res.json({
      chargeState: { response: r?.charge_state },
      climateState: { response: r?.climate_state },
      driveState: { response: r?.drive_state },
      vehicle: { response: r?.vehicle_state ? { ...r.vehicle_state, vehicle_name: r?.vehicle_name, odometer: r?.vehicle_state?.odometer, locked: r?.vehicle_state?.locked } : null }
    });
  } catch (err) {
    const errData = err.response?.data;
    const status = err.response?.status;
    const msg = errData?.error || err.message || '';
    // Not authenticated — token missing or refresh failed
    if (msg.includes('Not authenticated') || msg.includes('Token refresh failed') || status === 401) {
      return res.json({ auth_required: true });
    }
    // 408 or any "offline/asleep" message = asleep
    if (status === 408 || msg.includes('offline') || msg.includes('asleep') || msg.includes('unavailable')) {
      return res.json({ asleep: true });
    }
    console.error('State error:', errData || err.message);
    res.status(500).json({ error: err.message, detail: errData });
  }
});

// ─── POST: Send vehicle command ───────────────────────────────────────────────
router.post('/vehicles/:id/command/:command', async (req, res) => {
  try {
    const data = await teslaApi(
      'POST',
      `/api/1/vehicles/${req.params.id}/command/${req.params.command}`,
      req.body
    );
    // Tesla returns result in data.response.result
    const result = data?.response;
    if (result?.result === false && result?.reason === 'unsigned_cmds_disabled') {
      return res.status(400).json({
        error: 'unsigned_cmds_disabled',
        message: 'Vehicle requires signed commands. Enable Fleet API signed commands in your Tesla developer account.',
        response: result
      });
    }
    res.json(data);
  } catch (err) {
    console.error('Command error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

// ─── POST: Wake vehicle ───────────────────────────────────────────────────────
router.post('/vehicles/:id/wake', async (req, res) => {
  try {
    const data = await teslaApi('POST', `/api/1/vehicles/${req.params.id}/wake_up`);
    res.json(data);
  } catch (err) {
    // 406 = car is offline (deeper than asleep) — tell frontend to keep retrying
    const status = err.response?.status;
    if (status === 406 || status === 408) {
      return res.json({ response: { state: 'offline' }, retryable: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── GET: Check if vehicle is online (lightweight, used for wake polling) ─────
router.get('/vehicles/:id/online', async (req, res) => {
  try {
    const data = await teslaApi('GET', `/api/1/vehicles/${req.params.id}`);
    const state = data?.response?.state;
    res.json({ online: state === 'online', state });
  } catch (err) {
    res.json({ online: false, state: 'unknown' });
  }
});

// ─── GET: Vehicle GPS location (from drive_state) ─────────────────────────────
router.get('/vehicles/:id/location', async (req, res) => {
  try {
    const data = await teslaApi('GET', `/api/1/vehicles/${req.params.id}/vehicle_data?endpoints=drive_state`);
    const ds = data?.response?.drive_state;
    if (ds?.latitude && ds?.longitude) {
      res.json({ lat: ds.latitude, lon: ds.longitude });
    } else {
      res.json({ lat: null, lon: null });
    }
  } catch (err) {
    res.json({ lat: null, lon: null });
  }
});

// ─── POST: Send navigation destination to Tesla ───────────────────────────────
router.post('/vehicles/:id/navigate', async (req, res) => {
  try {
    const { lat, lon, order } = req.body;
    const data = await teslaApi(
      'POST',
      `/api/1/vehicles/${req.params.id}/command/navigation_gps_request`,
      { lat: parseFloat(lat), lon: parseFloat(lon), order: order ?? 1 }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET: Real-time traffic incidents (Waze public data) ─────────────────────
router.get('/incidents', async (req, res) => {
  try {
    const { lat, lon, radius = 20 } = req.query;
    if (!lat || !lon) return res.json([]);

    const latF = parseFloat(lat);
    const lonF = parseFloat(lon);
    const delta = parseFloat(radius) / 111;

    // Try multiple Waze endpoints — they rotate which one works
    const urls = [
      `https://www.waze.com/live-map/api/georss?top=${latF + delta}&bottom=${latF - delta}&left=${lonF - delta}&right=${lonF + delta}&env=row&types=alerts,traffic`,
      `https://www.waze.com/row-rtserver/web/TGeoRSS?left=${lonF - delta}&right=${lonF + delta}&bottom=${latF - delta}&top=${latF + delta}&env=row&types=alerts,traffic`,
    ];

    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.waze.com/live-map',
      'Origin': 'https://www.waze.com',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    let alerts = [];
    let jams = [];
    for (const url of urls) {
      try {
        const response = await axios.get(url, { headers: browserHeaders, timeout: 8000 });
        alerts = response.data?.alerts ?? [];
        jams = response.data?.jams ?? [];
        if (alerts.length > 0 || jams.length > 0) break;
      } catch { continue; }
    }

    const typeMap = {
      'POLICE': 'POLICE', 'HAZARD': 'HAZARD', 'ACCIDENT': 'ACCIDENT',
      'JAM': 'JAM', 'ROAD_CLOSED': 'ROAD_CLOSED'
    };

    const incidents = [
      ...alerts.map(a => ({
        type: typeMap[a.type] ?? a.type ?? 'HAZARD',
        lat: a.location?.y ?? a.lat,
        lon: a.location?.x ?? a.lon,
        street: a.street,
        reportRating: a.reportRating,
        description: a.subtype ? a.subtype.replace(/_/g, ' ') : undefined
      })),
      ...jams.map(j => ({
        type: 'JAM',
        lat: j.line?.[0]?.y ?? j.segments?.[0]?.lat,
        lon: j.line?.[0]?.x ?? j.segments?.[0]?.lon,
        street: j.street,
      }))
    ].filter(i => i.lat && i.lon);

    res.json(incidents);
  } catch (err) {
    console.error('Incidents error:', err.message);
    res.json([]);
  }
});

// ─── GET: Geocode address via OpenStreetMap Nominatim (no API key needed) ─────
router.get('/geocode', async (req, res) => {
  try {
    const { q, lat, lon } = req.query;
    const params = { q, format: 'json', limit: 7, addressdetails: 1 };
    // Bias results to car's location (viewbox = ~100km around car)
    if (lat && lon) {
      const delta = 1.0 // ~100km
      params.viewbox = `${parseFloat(lon)-delta},${parseFloat(lat)+delta},${parseFloat(lon)+delta},${parseFloat(lat)-delta}`
      params.bounded = 0 // prefer but don't restrict to viewbox
    }
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params,
      headers: { 'User-Agent': 'OneTesla/1.0' }
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
