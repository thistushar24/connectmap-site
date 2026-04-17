#!/usr/bin/env bash
set -e

echo ""
echo "====================================================="
echo "  CONNECTMAP P2P - STARTING ALL SERVICES"
echo "====================================================="
echo ""
echo "  [P2P Workspace]  http://localhost:3001"
echo "  [Backend API]    http://localhost:4000"
echo "  [Frontend]       http://localhost:3000"
echo "  [Tracker]        http://localhost:6969"
echo ""
echo "====================================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install from https://nodejs.org"
    exit 1
fi

# Free up ports if already in use
for port in 3000 3001 4000 6969; do
    pid=$(lsof -ti:$port 2>/dev/null) && [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
done

sleep 1

# Launch all services
npm run dev
