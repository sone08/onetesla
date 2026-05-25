#!/bin/sh
set -e

# Write private key from env var to file for the proxy
if [ -n "$TESLA_PRIVATE_KEY" ]; then
  echo "$TESLA_PRIVATE_KEY" | sed 's/\\n/\n/g' > /app/proxy-config/fleet-key.pem
elif [ -f /app/backend/private-key.pem ]; then
  cp /app/backend/private-key.pem /app/proxy-config/fleet-key.pem
fi

# Start tesla-http-proxy in background (port 4443, localhost only)
if [ -f /app/proxy-config/fleet-key.pem ]; then
  echo "🔑 Starting Tesla Vehicle Command Proxy on :4443..."
  tesla-http-proxy \
    -tls-key /app/proxy-config/tls-key.pem \
    -cert /app/proxy-config/tls-cert.pem \
    -key-file /app/proxy-config/fleet-key.pem \
    -host 127.0.0.1 \
    -port 4443 &
  PROXY_PID=$!
  echo "✅ Proxy started (PID $PROXY_PID)"
  # Give proxy 2s to start
  sleep 2
else
  echo "⚠️  No private key found — commands will use unsigned Fleet API (may fail)"
fi

# Start Node.js backend (serves frontend + API)
echo "🚀 Starting OneTesla backend on :${PORT:-3000}..."
exec node /app/backend/server.js
