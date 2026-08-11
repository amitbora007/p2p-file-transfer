# P2P File Transfer

A fast, secure, and resilient peer-to-peer file transfer application designed for local and global networks. Transfer files of any size (from MBs to multi-GBs) directly between devices (PCs, phones, tablets) across **different networks** (5G, 4G cellular, Wi-Fi, or Internet) without a central storage server using native WebRTC technology.

## Architecture

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

- **Node.js + Socket.IO**: Purely acts as an ephemeral signaling server to relay WebRTC offer/answer SDPs and ICE candidates. File data never touches the backend server.
- **WebRTC DataChannel**: Direct device-to-device binary chunk streaming with backpressure flow control (`bufferedAmount`). Zero server bandwidth overhead.
- **STUN / TURN Servers**: STUN discovers public reflexive IP addresses across NATs/CGNAT (5G/4G cellular networks). Optional TURN relay fallback for strict symmetric firewalls.

## Features

- **Cross-Network Direct P2P Transfers**: Connect devices across **any network** (Jio 5G, Airtel Wi-Fi, 4G, or Internet) using native browser `RTCPeerConnection` and `RTCDataChannel` APIs—zero server file storage, 100% cross-browser compatible.
- **Large File Flow Control (`bufferedAmount`)**: Automatic backpressure management pauses chunk reading whenever data channel buffers reach 2 MB, resuming as soon as the network drains. Allows 2 GB, 10 GB, or larger files to stream continuously at maximum speed without freezing.
- **Pause / Resume / Cancel Controls**: Real-time controls on both Sender and Receiver devices to pause, resume, or abort ongoing transfers cleanly.
- **Screen Wake Lock & Mobile Background Keep-Alive**: Screen Wake Lock API (`navigator.wakeLock`) prevents screen dimming/sleep during active transfers, while a silent audio keep-alive loop prevents mobile WebRTC suspension when screens lock.
- **Instant Startup QR Display**: Your device's QR code, Peer ID, and Copy Link buttons are rendered prominently right on initial page load for fast connection setup.
- **Multiple Connection Methods**:
  - **Native Camera QR Scanning**: QR codes encode full web URLs (`http://192.168.x.x:3000/?peer=...`) so native mobile cameras (iOS/Android) scan and open the link automatically.
  - **Manual Peer ID Connection**: Type a 6-character Peer ID directly to connect without needing camera permissions.
  - **In-App Camera Scanner**: Scan QR codes within the web app with support for URLs, JSON payloads, and plain Peer IDs.
- **Connected Button Guards**: Send and Receive action controls are dynamically enabled only when devices are actively connected to a peer.
- **Real-time Progress & ETA Tracking**: Monitor speed (MB/s), accurate countdown time remaining (ETA), progress percentage, and total bytes transferred on both devices.
- **Responsive & Modern UI**: Built with React 19, Tailwind CSS 4, Lucide Icons, and Radix UI.
- **TypeScript**: Fully typed codebase for maximum safety and developer experience.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Radix UI, Lucide Icons
- **Backend**: Node.js 22, Express 4, Socket.IO 4
- **P2P Engine**: Native WebRTC (`RTCPeerConnection` + `RTCDataChannel`), Multi-STUN & TURN support
- **QR Code**: `qrcode` library for generation, `jsQR` for scanning
- **Testing**: Vitest for unit and integration tests

## Environment Variables (Optional)

| Variable | Description | Example |
| :--- | :--- | :--- |
| `VITE_PUBLIC_URL` | Public domain / tunnel URL for hosted deployments | `https://p2p.yourdomain.com` |
| `VITE_TURN_SERVER_URL` | TURN server URL for strict firewall relay | `turn:turn.yourdomain.com:3478` |
| `VITE_TURN_USERNAME` | TURN server username | `user` |
| `VITE_TURN_PASSWORD` | TURN server credential | `password` |

## Getting Started

### Prerequisites

- **Node.js**: 22.13.0 or higher
- **pnpm**: 10.4.1 or higher (or via `npx pnpm`)
- Any internet or local network connection

### Installation

1. Clone the repository:
```bash
git clone https://github.com/amitbora007/p2p-file-transfer.git
cd p2p-file-transfer
```

2. Install dependencies:
```bash
pnpm install
# or via npm / npx:
# npx pnpm install
# npm install
```

### Running Development Server

Start the development server with live watch:
```bash
pnpm dev
# or via npm / npx:
# npm run dev
# npx pnpm dev
```

On startup, the terminal logs local access URLs and local network IP addresses:
```text
[WebRTC] Signaling service initialized
Server running locally on: http://localhost:3000/
Network / Internet access (local network or public domain):
  -> http://192.168.3.94:3000/
```

Open the **Network / Internet access URL** (or your public domain) on your phone or secondary laptop.

## Command Reference

| Action | pnpm Command | npm Command | RTK Command |
| :--- | :--- | :--- | :--- |
| **Start Dev Server** | `pnpm dev` | `npm run dev` | `rtk pnpm dev` |
| **Type Check** | `pnpm check` | `npm run check` | `rtk pnpm check` |
| **Run Unit Tests** | `pnpm test` | `npm test` | `rtk pnpm test` |
| **Production Build** | `pnpm build` | `npm run build` | `rtk pnpm build` |
| **Start Production** | `pnpm start` | `npm start` | `rtk pnpm start` |

## How to Connect Devices

You can connect two devices using any of the following methods:

### Method 1: Scan QR Code with Mobile Camera
1. Open the app on Device A (`http://192.168.3.94:3000/`).
2. Open the camera app on Device B (e.g., phone on 5G/4G) and point it at Device A's QR code.
3. Tap the popup link (`http://192.168.3.94:3000/?peer=...`) to open the app and connect automatically.

### Method 2: Manual Peer ID Connection
1. Note Device A's 6-character **Peer ID** (e.g., `25CDB2D7AA66`).
2. On Device B, type `25CDB2D7AA66` into the **"Connect to Remote Device"** text box and click **Connect**.

### Method 3: In-App Camera Scanner
1. Display the QR code on Device A.
2. On Device B, click **Scan QR Code via Camera** to scan Device A's screen using the browser camera.

Once connected (`Status: Connected`), all Send and Receive action controls activate instantly.

## Project Structure

```
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # UI components (QRCodeGenerator, QRCodeScanner, FileTransferInterface, TransferProgressBar)
│   │   ├── hooks/            # Custom React hooks (useWebRTC)
│   │   ├── pages/            # Page components (Home.tsx)
│   │   ├── App.tsx           # Main app component
│   │   └── main.tsx          # Entry point
│   └── index.html
├── server/                    # Node.js backend
│   ├── routers.ts            # tRPC procedures
│   ├── db.ts                 # Database queries
│   ├── services/             # Business logic (WebRTC signaling via Socket.IO)
│   └── _core/                # Server setup and Vite integration
├── drizzle/                  # Database schema and migrations
├── shared/                   # Shared types and constants
└── package.json
```

## How It Works

### WebRTC Signaling
1. Devices register with the Socket.IO signaling server upon loading the page.
2. Peer IDs are exchanged via QR codes, direct URLs (`?peer=...`), or manual input.
3. WebRTC offer/answer SDP signals and ICE candidates are relayed through Socket.IO.
4. Once connected, WebRTC data channels establish a direct peer-to-peer connection.

### Ephemeral File Transfer & Flow Control
1. Files are split into 64KB binary chunks.
2. Chunks stream directly across WebRTC data channels using backpressure flow control (`bufferedAmount <= 2 MB`).
3. Progress percentage, speed (MB/s), and estimated time remaining update in real time on both devices.
4. Received chunks assemble into a Blob on the remote peer and trigger automatic browser download.

## Security & Privacy

- **No Server Storage**: Files stream directly device-to-device.
- **Encrypted Transfers**: WebRTC data channels are encrypted using DTLS/SRTP by default.
- **Ephemeral Signaling**: Peer signaling connections are ephemeral and reset on reload.

## Browser Support

- Chrome / Chromium 90+
- Safari 14.1+ (iOS & macOS)
- Firefox 88+
- Edge 90+

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Created by [amitbora007](https://github.com/amitbora007)
