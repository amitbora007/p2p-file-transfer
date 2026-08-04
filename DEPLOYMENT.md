# P2P File Transfer App - Deployment Guide

## Overview

The P2P File Transfer App is a Node.js + React application that enables direct peer-to-peer file transfers between devices on the same WiFi network using WebRTC. This guide covers deployment and hosting setup.

## Technology Stack

- **Backend**: Node.js, Express, Socket.IO, TypeScript
- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **P2P**: WebRTC (simple-peer), STUN servers for NAT traversal
- **QR Code**: QR code generation and scanning
- **Testing**: Vitest

## Prerequisites

- Node.js 18+ with pnpm
- Modern web browser with WebRTC support
- Network access between devices on the same WiFi

## Local Development

### Setup

```bash
cd /home/ubuntu/p2p-file-transfer
pnpm install
```

### Running the Development Server

```bash
pnpm run dev
```

The application will start on `http://localhost:3000`

### Building for Production

```bash
pnpm run build
```

This creates optimized production bundles in the `dist/` directory.

### Running Production Build

```bash
pnpm run start
```

## Deployment on Manus

The application is configured to deploy on Manus hosting with the following features:

### Environment Variables

The following environment variables are automatically injected:

- `BUILT_IN_FORGE_API_KEY` - API key for Forge service
- `BUILT_IN_FORGE_API_URL` - Forge API endpoint
- `JWT_SECRET` - JWT signing secret
- `OAUTH_SERVER_URL` - OAuth server endpoint
- `OWNER_NAME` - Application owner name
- `OWNER_OPEN_ID` - Owner OpenID
- `VITE_ANALYTICS_ENDPOINT` - Analytics endpoint
- `VITE_ANALYTICS_WEBSITE_ID` - Analytics website ID
- `VITE_APP_ID` - Application ID
- `VITE_APP_LOGO` - Application logo URL
- `VITE_APP_TITLE` - Application title
- `VITE_FRONTEND_FORGE_API_KEY` - Frontend Forge API key
- `VITE_FRONTEND_FORGE_API_URL` - Frontend Forge API URL
- `VITE_OAUTH_PORTAL_URL` - OAuth portal URL

### Database

The application uses Drizzle ORM with a configured database. To run migrations:

```bash
pnpm run db:push
```

### Deployment Steps

1. **Create Checkpoint**: Save the current state as a checkpoint via the Management UI
2. **Publish**: Click the Publish button in the Management UI
3. **Monitor**: Check the deployment status in the Dashboard

## Architecture

### Backend (Node.js + Express)

- **WebRTC Signaling Server**: Manages peer discovery and connection setup via Socket.IO
- **REST API**: Serves static files and handles API requests
- **Session Management**: Maintains peer connection sessions

### Frontend (React + Vite)

- **QR Code Generation**: Creates shareable QR codes for peer identification
- **QR Code Scanner**: Scans QR codes to discover peers
- **File Transfer UI**: Manages file selection and transfer progress
- **Real-time Status**: Shows connection and transfer status

### P2P Transfer

- **WebRTC Data Channels**: Direct peer-to-peer file transfer
- **STUN Servers**: Enables NAT traversal for devices behind firewalls
- **Chunked Transfer**: Files are transferred in 64KB chunks for reliability
- **Progress Tracking**: Real-time transfer speed and time remaining

## Performance Optimization

### Transfer Optimization

- **Chunk Size**: 64KB chunks balance speed and reliability
- **STUN Servers**: Multiple STUN servers for better connectivity
- **Connection Pooling**: Efficient peer connection management

### Build Optimization

- **Code Splitting**: Vite automatically splits code for optimal loading
- **Tree Shaking**: Unused code is removed during build
- **Minification**: Production builds are minified and optimized

## Security Considerations

### WebRTC Security

- **STUN Only**: Uses STUN servers (no TURN for simplicity)
- **Peer Verification**: QR codes contain peer IDs for verification
- **Local Network Only**: Designed for same-network transfers

### Application Security

- **CORS Configuration**: Socket.IO configured with appropriate CORS settings
- **Input Validation**: File names and sizes are validated
- **Error Handling**: Graceful error handling with user feedback

## Testing

### Unit Tests

```bash
pnpm test
```

Runs all unit tests for:
- WebRTC connection logic
- File transfer protocol
- QR code generation and scanning
- Error handling

### Integration Tests

Integration tests verify:
- End-to-end peer connection flow
- File transfer with chunking
- QR code scanning and connection
- Error scenarios

## Troubleshooting

### Connection Issues

1. **Ensure devices are on the same WiFi network**
2. **Check firewall settings** - WebRTC may require specific ports
3. **Verify STUN server connectivity** - Check browser console for errors
4. **Restart the application** - Clear browser cache and reload

### File Transfer Issues

1. **Check file size** - Large files may timeout
2. **Verify connection status** - Ensure peers are connected before transferring
3. **Check network stability** - Poor WiFi signal can cause transfer interruptions
4. **Review browser console** - Look for WebRTC errors

### Performance Issues

1. **Monitor network bandwidth** - Check for network congestion
2. **Check device resources** - Ensure sufficient CPU and memory
3. **Review transfer speed** - Compare with expected network speed
4. **Enable browser developer tools** - Monitor WebRTC stats

## Monitoring and Logging

### Development Logs

- **Browser Console**: Client-side logs and errors
- **Server Console**: Server-side logs and WebRTC events
- **Network Tab**: HTTP and WebSocket traffic

### Production Logs

- **Application Logs**: Check Manus dashboard for logs
- **Error Tracking**: Monitor error rates and patterns
- **Performance Metrics**: Track transfer speeds and connection success rates

## Future Enhancements

- [ ] Support for larger files with resumable transfers
- [ ] Encryption for transferred files
- [ ] Multiple simultaneous transfers
- [ ] Transfer history and statistics
- [ ] Mobile app support
- [ ] Cloud backup integration
- [ ] Advanced file filtering and organization

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review browser console for error messages
3. Check server logs for WebRTC signaling errors
4. Verify network connectivity between devices

## License

MIT
