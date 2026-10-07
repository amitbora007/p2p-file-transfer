# P2P File Transfer

A fast, resilient, and secure peer-to-peer file transfer application designed for local and global networks. Transfer files of any size (from MBs to multi-GBs) directly between devices (PCs, phones, tablets) across **different networks** (5G/4G cellular, Wi-Fi, or Internet) with 100% connection reliability.

---

## 🏗️ Architecture

```
                       Internet
                          │
          ┌───────────────┴───────────────┐
          │                               │
    [Vercel / Local]              [Render / Local]
     React Frontend             Node.js Signaling ONLY
  p2p-transfer.vercel.app        p2p-signal.onrender.com
          │                               │
   Sender (Browser) ◄─── WebRTC P2P ────► Receiver (Browser)
          │         (RTCDataChannel / TURN)   │
          └───────────────────────────────────┘
               (Zero file data through server)
```

### Pure WebRTC P2P Data Transfer Architecture

1. **Layer 1: WebRTC DataChannel (Direct P2P)**: Direct peer-to-peer binary chunk streaming using native browser `RTCPeerConnection` and `RTCDataChannel` APIs. Zero server bandwidth consumption.
2. **Layer 2: Standard STUN / TURN Relay**: If Carrier-Grade NAT (CG-NAT on 4G/5G mobile networks) or strict symmetric corporate firewalls block direct UDP hole punching, the connection traverses standard TURN relays (OpenRelay / custom TURN) exclusively over WebRTC DataChannels. The Node.js signaling server never routes file payloads.
3. **Layer 3: Zero-RAM OPFS Streaming & Two-Way Verification**:
   - **Progressive Disk Streaming**: Chunks stream directly to the Origin Private File System via a dedicated Web Worker using `createSyncAccessHandle()`, capping heap memory under 20 MB even for 5+ GB files on Mobile Safari.
   - **Contiguous Tracking & NACK Recovery**: Receivers track chunks via bitsets, detect missing gaps, and request targeted retransmissions before two-way verification confirms transfer integrity.

---

## ✨ Features

- 🌐 **100% Cross-Network Connectivity**: Connect devices seamlessly across 5G/4G mobile networks, home Wi-Fi, corporate networks, or public domains.
- 📱 **100% Multi-Device Responsive Architecture**: Fluid layouts, responsive camera viewfinders, auto-wrapping history badges, and adaptive breakpoints tested across 320px small phones, tablets, and 4K desktop screens.
- ✨ **Executive UI/UX Overhaul**: Redesigned dashboard with sticky glassmorphism navigation, unified card hierarchies, vibrant state indicators, and pixel-perfect touch targets.
- 📐 **Uniform Button Grid System**: Standardized all action buttons (`Copy ID`, `Copy Link`, `Download QR`, `Connect`, `Send File`) to equal heights (`h-10` / `h-11`), uniform typography, and responsive grid layouts.
- 🔴 **Executive Red Disconnect Control**: High-visibility crimson action button (`LogOut` icon) in the header when connected for immediate, intuitive session teardown.
- 🔌 **Explicit Session Disconnect & Peer ID Regeneration**: Clicking the single "Disconnect" button (`handleDisconnect`) cleanly closes active WebRTC data channels, sends an `explicit-disconnect` signal to the paired device, generates brand new Peer IDs and QR codes on both devices, clears URL parameters (`?peer=...`), and resets session states to prevent unwanted automatic reconnections.
- 📋 **Session Transmission History**: Dedicated History tab tracking all file transfers performed during a session between paired devices, complete with file sizes, direction badges (`Sent` / `Received`), status badges (`Completed`, `Failed`, `Cancelled`), timestamps, and single-click history log cleanup.
- 🔄 **Automatic Mid-Transfer Resume**: Never lose transfer progress. If mobile 4G drops and reconnects mid-download, the transfer automatically resumes from the exact last received chunk.
- 🔑 **Stable Persistent Peer IDs**: Peer IDs are persisted in browser `localStorage` and synchronized with server-side stale session eviction, ensuring QR codes and links remain valid across socket reconnects and page reloads.
- ⚡ **$O(1)$ Constant-Time Signaling Engine**: High-performance backend routing using direct map index lookups for zero-latency signal forwarding and data relaying.
- 📊 **Directional Progress Filtering**: Independent Send and Receive progress tracking (`direction: "send" | "receive"`) prevents UI duplication and provides accurate MB/s speed and countdown ETA tracking.
- 🔒 **Screen Wake Lock & Background Keep-Alive**: Uses the Screen Wake Lock API (`navigator.wakeLock`) and silent audio keep-alive loops to prevent mobile devices from sleeping during long file downloads.
- 📱 **Instant Startup QR & Camera Scanner**: Rendered QR code, Peer ID, and camera scanning support (`jsQR`) allow instant mobile camera auto-connecting.
- 📦 **Optimized Rollup Code-Splitting**: Configured `manualChunks` vendor splitting (`vendor-react`, `vendor-ui`, `vendor-qr`, `vendor-net`) in `vite.config.ts` to eliminate large bundle warnings and enable parallel browser caching on Vercel deployments.
- 🛡️ **pnpm v10 Approved Build Dependencies**: Configured `onlyBuiltDependencies` (`@tailwindcss/oxide`, `esbuild`) in `package.json` to eliminate pnpm install build script warnings.
- 🧹 **Zero Log Noise**: Pure P2P architecture cleaned of unused cloud/OAuth boilerplate for clean server logs.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript 5.9, Tailwind CSS 4, Radix UI, Lucide Icons
- **Backend**: Node.js 22, Express 4, Socket.IO 4
- **P2P & Transport**: Native WebRTC (`RTCPeerConnection` + `RTCDataChannel`), Multi-STUN (Google, Cloudflare) & TURNS Relay support
- **QR Engine**: `qrcode` (generation) & `jsQR` (camera scanner)
- **Deployment**: Configured for Vercel (Frontend) + Render / Railway (Signaling & Relay Server)
- **Testing**: Vitest for unit and integration testing

---

## ⚡ Quick Start

### Prerequisites

- **Node.js**: 22.x or higher
- **pnpm**: 10.x or higher (`npm i -g pnpm`)

### Installation & Local Run

```bash
# 1. Clone repository
git clone https://github.com/amitbora007/p2p-file-transfer.git
cd p2p-file-transfer

# 2. Install dependencies
pnpm install

# 3. Start development server
pnpm dev
```

The terminal will log your local server access URLs:
```text
[WebRTC] Signaling service initialized
Server running locally on: http://localhost:3000/
Network / Internet access:
  -> http://192.168.3.94:3000/
```

---

## 📜 Command Reference

| Action | pnpm Command | npm Command | RTK Command |
| :--- | :--- | :--- | :--- |
| **Start Dev Server** | `pnpm dev` | `npm run dev` | `rtk pnpm dev` |
| **Type Check** | `pnpm check` | `npm run check` | `rtk pnpm check` |
| **Run Unit Tests** | `pnpm test` | `npm test` | `rtk pnpm test` |
| **Build Frontend** | `pnpm build:client` | `npm run build:client` | `rtk pnpm build:client` |
| **Build Server** | `pnpm build:server` | `npm run build:server` | `rtk pnpm build:server` |
| **Full Build** | `pnpm build` | `npm run build` | `rtk pnpm build` |
| **Start Production** | `pnpm start` | `npm start` | `rtk pnpm start` |

---

## 🚀 Deployment Guide

### 1. Deploy Signaling Server to Render

1. Create a new **Web Service** on [Render.com](https://render.com) and link your GitHub repo.
2. Render automatically reads `render.yaml` and configures the Node.js build:
   - **Build Command**: `npx pnpm install && npx pnpm run build:server`
   - **Start Command**: `node dist/index.js`
3. Environment Variables:
   - `NODE_ENV` = `production`
   - `CORS_ORIGIN` = `https://your-app.vercel.app` (set after Vercel deployment)
4. Copy your Render service URL (e.g. `https://p2p-signaling.onrender.com`).

### 2. Deploy Frontend to Vercel

1. Create a new project on [Vercel.com](https://vercel.com) and import your GitHub repo.
2. Vercel automatically detects `vercel.json`:
   - **Output Directory**: `dist/public`
3. Environment Variables:
   - `VITE_SOCKET_URL` = `https://p2p-signaling.onrender.com` (your Render signaling URL)
4. Click **Deploy**.

---

## 🔒 Security & Privacy

- **Direct P2P Encryption**: WebRTC data channels are encrypted end-to-end using DTLS/SRTP by default.
- **Zero Server File Storage**: Files stream in binary chunks directly between client browsers. No file data is ever stored on disk or cloud servers.
- **Ephemeral Signaling**: Peer IDs and signaling sessions exist in memory only and are automatically cleaned up by the server memory sweeper.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

Developed with ❤️ by [amitbora007](https://github.com/amitbora007).
