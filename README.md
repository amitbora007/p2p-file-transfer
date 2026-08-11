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
     React Frontend             Node.js Signaling & Relay
  p2p-transfer.vercel.app        p2p-signal.onrender.com
          │                               │
   Sender (Browser) ◄─── WebRTC P2P ────► Receiver (Browser)
          │            (DataChannel)              │
          │                                       │
          └─── Hybrid Socket.IO Relay Fallback ───┘
                (For strict 4G/5G CG-NATs)
```

### Multi-Layer Hybrid Data Transfer Protocol

1. **Layer 1: WebRTC DataChannel (Direct P2P)**: Direct peer-to-peer binary chunk streaming using native browser `RTCPeerConnection` and `RTCDataChannel` APIs. Zero server bandwidth overhead.
2. **Layer 2: Hybrid Socket.IO Relay Fallback**: If Carrier-Grade NAT (CG-NAT on 4G/5G mobile networks) or strict corporate firewalls block direct UDP/TCP hole punching, the app automatically enables Socket.IO data relaying after 2.5 seconds. **Guarantees 100% connectivity on any network.**
3. **Layer 3: Chunk ACK & Automatic Mid-Transfer Resume**:
   - **Window-Based Flow Control**: Chunks stream in 16-chunk (1 MB) window limits, requiring receipt acknowledgments (`chunk-ack`) to prevent sender buffer overflows during network dips.
   - **Auto-Resume Handshake**: If a 4G connection flickers and reconnects mid-transfer, the receiver sends a `request-resume` with its last received chunk index (`N`). The sender automatically rewinds and resumes streaming seamlessly from chunk `N + 1` without restarting the download.

---

## ✨ Features

- 🌐 **100% Cross-Network Connectivity**: Connect devices seamlessly across 5G/4G mobile networks, home Wi-Fi, corporate networks, or public domains.
- 🔌 **Session Disconnect & Peer ID Regeneration**: Clicking "Disconnect" (`handleDisconnect`) cleanly closes active WebRTC data channels, discards the old Peer ID, generates a brand new Peer ID and QR code, clears URL parameters (`?peer=...`), and resets session states.
- 📋 **Session Transmission History**: Dedicated History tab tracking all file transfers performed during a session between paired devices, complete with file sizes, direction badges (`Sent` / `Received`), status badges (`Completed`, `Failed`, `Cancelled`), timestamps, and single-click history log cleanup.
- 🔄 **Automatic Mid-Transfer Resume**: Never lose transfer progress. If mobile 4G drops and reconnects mid-download, the transfer automatically resumes from the exact last received chunk.
- 🔑 **Stable Persistent Peer IDs**: Peer IDs are persisted in browser `localStorage` and synchronized with server-side stale session eviction, ensuring QR codes and links remain valid across socket reconnects and page reloads.
- ⚡ **$O(1)$ Constant-Time Signaling Engine**: High-performance backend routing using direct map index lookups for zero-latency signal forwarding and data relaying.
- 📊 **Directional Progress Filtering**: Independent Send and Receive progress tracking (`direction: "send" | "receive"`) prevents UI duplication and provides accurate MB/s speed and countdown ETA tracking.
- 🔒 **Screen Wake Lock & Background Keep-Alive**: Uses the Screen Wake Lock API (`navigator.wakeLock`) and silent audio keep-alive loops to prevent mobile devices from sleeping during long file downloads.
- 📱 **Instant Startup QR & Camera Scanner**: Rendered QR code, Peer ID, and camera scanning support (`jsQR`) allow instant mobile camera auto-connecting.
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
