import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register service worker for push notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.warn)
}

// ─── Patch fetch to always send APP_SECRET header to our own API ──────────────
// The secret is injected at build time via Vite's define — never exposed in source
const _APP_SECRET = (typeof __APP_SECRET__ !== 'undefined') ? __APP_SECRET__ : '';
const _origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  if (_APP_SECRET && url.startsWith('/api/')) {
    const headers = new Headers((init as RequestInit).headers || {});
    headers.set('x-app-secret', _APP_SECRET);
    return _origFetch(input, { ...init, headers });
  }
  return _origFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

