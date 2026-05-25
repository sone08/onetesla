# ─── Stage 1: Build tesla-http-proxy (Go) ────────────────────────────────────
FROM golang:1.23-alpine AS proxy-builder
RUN apk add --no-cache git
RUN git clone --depth 1 https://github.com/teslamotors/vehicle-command.git /vc
WORKDIR /vc
RUN go build -o /tesla-http-proxy ./cmd/tesla-http-proxy

# ─── Stage 2: Build frontend (Node/Vite) ─────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy built proxy binary
COPY --from=proxy-builder /tesla-http-proxy /usr/local/bin/tesla-http-proxy

# Copy built frontend dist
COPY --from=frontend-builder /app/dist ./dist

# Copy backend
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend

# Generate self-signed TLS cert for the proxy (required by tesla-http-proxy)
RUN mkdir -p /app/proxy-config && \
    openssl req -x509 -nodes -newkey ec \
        -pkeyopt ec_paramgen_curve:secp384r1 \
        -pkeyopt ec_param_enc:named_curve \
        -subj '/CN=localhost' \
        -keyout /app/proxy-config/tls-key.pem \
        -out /app/proxy-config/tls-cert.pem \
        -sha256 -days 3650 \
        -addext "extendedKeyUsage = serverAuth" \
        -addext "keyUsage = digitalSignature, keyCertSign, keyAgreement"

EXPOSE 3000

# start.sh: launches proxy then Node server
COPY docker-start.sh /app/docker-start.sh
RUN chmod +x /app/docker-start.sh

CMD ["/app/docker-start.sh"]
