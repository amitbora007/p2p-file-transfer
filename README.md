# P2P File Transfer

A fast, secure, and easy-to-use peer-to-peer file transfer application that works on local networks. Transfer files directly between devices without needing a central server using WebRTC technology.

## Features

- **Direct P2P Transfers**: Files are transferred directly between devices using WebRTC data channels—no server needed
- **QR Code Sharing**: Generate and scan QR codes to easily connect devices on the same WiFi network
- **Real-time Progress Tracking**: Monitor transfer speed, estimated time remaining, and file size in real-time
- **Professional UI**: Clean, intuitive interface built with React, Tailwind CSS, and Radix UI components
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Inline Help Cards**: Contextual tooltips guide users through each step
- **NAT Traversal**: STUN server configuration for reliable connections across different networks
- **TypeScript**: Fully typed codebase for better developer experience

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Radix UI
- **Backend**: Node.js, Express 4, Socket.IO
- **P2P**: WebRTC with simple-peer
- **QR Code**: qrcode library for generation, jsQR for scanning
- **Database**: MySQL with Drizzle ORM
- **Testing**: Vitest for unit and integration tests

## Getting Started

### Prerequisites

- Node.js 22.13.0 or higher
- pnpm 10.4.1 or higher
- A modern web browser with WebRTC support

### Installation

1. Clone the repository:
\`\`\`bash
git clone https://github.com/amitbora007/p2p-file-transfer.git
cd p2p-file-transfer
\`\`\`

2. Install dependencies:
\`\`\`bash
pnpm install
\`\`\`

3. Start the development server:
\`\`\`bash
pnpm dev
\`\`\`

The application will be available at \`http://localhost:3000\`

## Usage

### Sending Files

1. Open the app on your device
2. Enter a device name (e.g., "My Laptop")
3. Click "Send Files"
4. Share the generated QR code with the receiving device
5. Select files to transfer
6. Monitor progress in real-time

### Receiving Files

1. Open the app on your device
2. Enter a device name
3. Click "Receive Files"
4. Scan the QR code from the sending device
5. Files will automatically download when received

## Project Structure

\`\`\`
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # Custom React hooks (WebRTC logic)
│   │   ├── pages/            # Page components
│   │   ├── App.tsx           # Main app component
│   │   └── main.tsx          # Entry point
│   └── index.html
├── server/                    # Node.js backend
│   ├── routers.ts            # tRPC procedures
│   ├── db.ts                 # Database queries
│   ├── services/             # Business logic
│   │   └── webrtcSignaling.ts # WebRTC signaling service
│   └── _core/                # Framework internals
├── drizzle/                  # Database schema and migrations
├── shared/                   # Shared types and constants
└── package.json
\`\`\`

## Development

### Running Tests

\`\`\`bash
pnpm test
\`\`\`

### Type Checking

\`\`\`bash
pnpm check
\`\`\`

### Building for Production

\`\`\`bash
pnpm build
\`\`\`

### Starting Production Server

\`\`\`bash
pnpm start
\`\`\`

## How It Works

### WebRTC Signaling

1. Devices connect to a signaling server via Socket.IO
2. Peer IDs are exchanged and encoded in QR codes
3. When a QR code is scanned, the receiving device connects to the sender via WebRTC
4. STUN servers help establish connections across NAT boundaries

### File Transfer

1. Files are split into 64KB chunks
2. Chunks are sent through WebRTC data channels
3. Progress is tracked in real-time with speed and time calculations
4. Files are reconstructed on the receiving end and auto-downloaded

### Security

- Direct P2P transfers mean files never touch a central server
- WebRTC connections are encrypted by default
- No file storage on servers—transfers are ephemeral

## Performance

- **Transfer Speed**: Limited by WiFi bandwidth (typically 10-100 MB/s)
- **Chunk Size**: 64KB for optimal balance between speed and reliability
- **Progress Updates**: Real-time calculations with smooth animations
- **NAT Traversal**: STUN servers enable connections through most firewalls

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14.1+
- Edge 90+

## Limitations

- Devices must be on the same WiFi network (or have internet connectivity for STUN)
- File transfers are not encrypted end-to-end (WebRTC default encryption)
- No persistent transfer history (resets on page reload)
- Maximum file size limited by available RAM

## Future Enhancements

- [ ] File encryption with user-provided passwords
- [ ] Transfer history and statistics
- [ ] Drag-and-drop file upload
- [ ] Pause/resume transfers
- [ ] Multiple simultaneous transfers
- [ ] Custom TURN server support
- [ ] Mobile app (React Native)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions, please open an issue on GitHub.

## Author

Created by amitbora007

---

**Note**: This project is designed for local network file transfers. For transferring files over the internet, consider using a VPN or setting up a custom TURN server.
