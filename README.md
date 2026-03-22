# EDI 3 P2P File Sharing

A web-based P2P file sharing application using WebRTC DataChannels.

## Features
- Direct browser-to-browser file transfer
- WebRTC DataChannels (No middleman after signaling)
- 16KB file chunks
- SHA-256 chunk integrity checks
- Memory-only signaling server
- Terminal UI aesthetic

## Requirements
- Node.js installed

## Run Locally
1. `npm install`
2. `npm start`
3. Open a browser to `http://localhost:3000`

## Deployment

### Render.com
Use the included `render.yaml` to deploy directly as a Web Service.
Connect your repository and Render will automatically use `render.yaml`.

### Railway.app
Connect your repository to Railway and the included `railway.json` schema will automate the start and dependency management.

## Team EDI 3
- Tushar
- Sahil
- Siddhesh
- Prathmesh
- Vishal
