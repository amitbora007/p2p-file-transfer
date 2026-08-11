# P2P File Transfer App - Deployment & Command Guide

## Overview

The P2P File Transfer App is a Node.js + React application that enables direct peer-to-peer file transfers between devices across **different networks** (5G, 4G cellular, Wi-Fi, or Internet) using native WebRTC technology without central file storage.

---

## Command Reference Matrix

| Task / Action | `pnpm` Command | `npm` Command | `yarn` Command | `rtk` Proxy |
| :--- | :--- | :--- | :--- | :--- |
| **Install Dependencies** | `pnpm install` | `npm install` | `yarn install` | `rtk pnpm install` |
| **Start Dev Server** | `pnpm dev` | `npm run dev` | `yarn dev` | `rtk pnpm dev` |
| **Run Type Check** | `pnpm check` | `npm run check` | `yarn check` | `rtk pnpm check` |
| **Run Unit Tests** | `pnpm test` | `npm test` | `yarn test` | `rtk pnpm test` |
| **Build Production** | `pnpm build` | `npm run build` | `yarn build` | `rtk pnpm build` |
| **Start Production** | `pnpm start` | `npm start` | `yarn start` | `rtk pnpm start` |
| **Push DB Migrations**| `pnpm db:push` | `npm run db:push` | `yarn db:push` | `rtk pnpm db:push` |

---

## Local Development Workflow

### 1. Installation
```bash
git clone https://github.com/amitbora007/p2p-file-transfer.git
cd p2p-file-transfer
pnpm install
```

### 2. Run Development Server
```bash
pnpm dev
```
The terminal will display your local address (`http://localhost:3000`) and network address (`http://192.168.3.94:3000`).

### 3. Type Checking & Testing
```bash
# Type check TypeScript files without emitting JS
pnpm check

# Run Vitest unit & integration test suite
pnpm test
```

---

## Production Deployment Commands

### Option A: Standard Node.js Server / Linux VPS (PM2)

```bash
# 1. Build client bundle and compile TypeScript server
pnpm build

# 2. Start production server (Express + Static Vite assets)
pnpm start

# (Optional) Run persistently in background using PM2:
npx pm2 start "pnpm start" --name "p2p-transfer"
npx pm2 save
```

### Option B: Docker Container Deployment

```bash
# Build Docker image
docker build -t p2p-file-transfer:latest .

# Run container on port 3000
docker run -d -p 3000:3000 --name p2p-transfer p2p-file-transfer:latest
```

---

## Environment Variables

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | HTTP & WebSocket server port | `3000` |
| `NODE_ENV` | Environment mode | `production` / `development` |
| `VITE_PUBLIC_URL` | Public domain or tunnel URL for cross-internet QR codes | `https://p2p.yourdomain.com` |
| `VITE_TURN_SERVER_URL` | Optional TURN server URL for strict firewall relay | `turn:turn.yourdomain.com:3478` |
| `VITE_TURN_USERNAME` | TURN server authentication username | `myuser` |
| `VITE_TURN_PASSWORD` | TURN server authentication password | `mypassword` |

---

## Architecture Summary

```
                 Internet
                    │
          ┌─────────┴─────────┐
          │                   │
      React A              React B
          │                   │
          └────── WebRTC ─────┘
               DataChannel
        (Direct P2P Binary Stream)
```

- **Node.js + Express + Socket.IO**: Purely acts as an ephemeral signaling server to exchange WebRTC offer/answer SDPs and ICE candidates.
- **Native WebRTC DataChannel**: Streams binary chunks directly device-to-device with backpressure flow control (`bufferedAmount <= 2 MB`). Zero server bandwidth cost for files.
- **STUN / TURN Servers**: STUN discovers public reflexive IP addresses across NATs/CGNAT. Optional TURN relay fallback handles strict symmetric firewalls.

---

## License

MIT License
