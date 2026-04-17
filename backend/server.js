require('dotenv').config({ path: require('path').join(__dirname, '.env') });
// Patch DNS to use Google's 8.8.8.8 — system DNS (IPv6-only) refuses SRV lookups
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');

const searchRoutes = require('./routes/search');
const torrentRoutes = require('./routes/torrent');
const uploadRoutes = require('./routes/upload');
const { setModels } = require('./utils/store');
const { Server } = require('socket.io');
const { handleAnnounce, handleScrape, handleStats, store: trackerStore } = require('../tracker/tracker');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌  MONGO_URI environment variable is not set.');
  console.error('    Create backend/.env with MONGO_URI=<your connection string>');
  process.exit(1);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/search', searchRoutes);
app.use('/api/torrent', torrentRoutes);
app.use('/api/upload', uploadRoutes);

// ── Internal Tracker Mounting ─────────────────────────────────────────────────
app.get('/announce', handleAnnounce);
app.get('/scrape', handleScrape);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    dbConnected: mongoose.connection.readyState === 1,
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const { TorrentStore, FileStore } = require('./utils/store');
    const [totalTorrents, totalFiles, totalSizeAgg, fileSizeAgg] = await Promise.all([
      TorrentStore.countDocuments(),
      FileStore.countDocuments(),
      TorrentStore.aggregate([{ $group: { _id: null, total: { $sum: '$totalSize' } } }]),
      FileStore.aggregate([{ $group: { _id: null, total: { $sum: '$size' } } }]),
    ]);

    let trackerStats = { totalSwarms: 0, totalPeers: 0 };
    try { 
      trackerStats = trackerStore.globalStats(); 
    } catch { /* tracker offline */ }

    res.json({
      totalTorrents,
      totalFiles,
      totalDataSize: (totalSizeAgg[0]?.total || 0) + (fileSizeAgg[0]?.total || 0),
      activePeers: trackerStats.totalPeers || 0,
      activeSwarms: trackerStats.totalSwarms || 0,
      dbConnected: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats: ' + err.message });
  }
});

// ── File listing ──────────────────────────────────────────────────────────────
app.get('/api/files', async (req, res) => {
  try {
    const { FileStore } = require('./utils/store');
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [results, total] = await Promise.all([
      FileStore.find({}, { skip, limit: parseInt(limit) }),
      FileStore.countDocuments(),
    ]);
    res.json({
      results: results.map((f) => ({ ...f, _type: 'file', name: f.originalName })),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)) || 1,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files: ' + err.message });
  }
});

// ── Delete general file ───────────────────────────────────────────────────────
app.delete('/api/files/:id', async (req, res) => {
  try {
    const { FileStore } = require('./utils/store');
    const fs = require('fs');
    const uploadsDir = path.join(__dirname, 'uploads');
    const fileRecord = await FileStore.findByIdAndDelete(req.params.id);
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadsDir, fileRecord.storedFilename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ status: 'deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

// ── Tracker proxy ─────────────────────────────────────────────────────────────
app.get('/api/tracker/stats', (req, res) => {
  try {
    handleStats(req, res);
  } catch {
    res.json({ totalSwarms: 0, totalPeers: 0, error: 'Tracker offline' });
  }
});

// ── Python client proxy ───────────────────────────────────────────────────────
// Forwards /api/client/* → http://localhost:5000/*
// Returns {offline:true} silently when status_server.py isn't running.
// This eliminates the 502 / ECONNREFUSED spam in Vite's terminal entirely.
const PYTHON_CLIENT_URL = process.env.PYTHON_CLIENT_URL || 'http://localhost:5000';

app.get('/api/client/status', async (req, res) => {
  try {
    const data = await fetchJSON(`${PYTHON_CLIENT_URL}/status`);
    res.json(data);
  } catch {
    res.json({ offline: true, downloads: [] });
  }
});

app.get('/api/client/status/:infoHash', async (req, res) => {
  try {
    const data = await fetchJSON(`${PYTHON_CLIENT_URL}/status/${req.params.infoHash}`);
    res.json(data);
  } catch {
    res.json({ offline: true });
  }
});

app.post('/api/client/download', express.json(), async (req, res) => {
  try {
    const result = await fetchPost(`${PYTHON_CLIENT_URL}/download`, req.body);
    res.json(result);
  } catch {
    res.json({ offline: true, error: 'Python client not running' });
  }
});

app.post('/api/client/stop/:infoHash', async (req, res) => {
  try {
    const result = await fetchPost(`${PYTHON_CLIENT_URL}/stop/${req.params.infoHash}`, {});
    res.json(result);
  } catch {
    res.json({ offline: true });
  }
});


// ── fetchJSON ─────────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function fetchPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const client = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = client.request(opts, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}


// ── Error middleware (multer + generic) ───────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 100MB.' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Signaling Server (Socket.io) ──────────────────────────────────────────────
const rooms = new Map();
io.on('connection', (socket) => {
    socket.on('join-room', (roomCode, mode) => {
        let room = rooms.get(roomCode);
        if (!room) {
            room = { host: socket.id, guests: [], mode: mode || 'files' };
            rooms.set(roomCode, room);
            socket.join(roomCode);
            socket.emit('room-created', roomCode, room.mode);
        } else {
            room.guests.push(socket.id);
            socket.join(roomCode);
            io.to(room.host).emit('guest-joined', socket.id);
            socket.emit('room-joined', roomCode, room.mode);
        }
    });

    socket.on('offer', (roomCode, sdp, targetId) => io.to(targetId).emit('offer', sdp, socket.id));
    socket.on('answer', (roomCode, sdp, targetId) => io.to(targetId).emit('answer', sdp, socket.id));
    socket.on('ice-candidate', (roomCode, candidate, targetId) => io.to(targetId).emit('ice-candidate', candidate, socket.id));

    socket.on('disconnect', () => {
        for (const [roomCode, room] of rooms.entries()) {
            if (room.host === socket.id) {
                socket.to(roomCode).emit('peer-disconnected');
                rooms.delete(roomCode);
            } else {
                const index = room.guests.indexOf(socket.id);
                if (index !== -1) {
                    room.guests.splice(index, 1);
                    if (room.host) io.to(room.host).emit('peer-disconnected', socket.id);
                }
            }
        }
    });
});

// ── Frontend Static Serving ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// ── Connect MongoDB, then start server ────────────────────────────────────────
mongoose.set('bufferCommands', false);

console.log('⏳  Connecting to MongoDB Atlas...');

mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    const Torrent = require('./models/Torrent');
    const File = require('./models/File');
    setModels(Torrent, File);
    console.log('✅  MongoDB Atlas connected');

    server.listen(PORT, () => {
      console.log(`🚀  Unified Server running on port ${PORT}`);
      console.log(`    API, Tracker, Signaling, and Frontend are all live on the same port.`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌  Port ${PORT} is already in use. Kill the existing process or set PORT=<other>.`);
      } else {
        console.error('Server error:', err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('❌  MongoDB connection failed:', err.message);
    console.error('    Check your MONGO_URI in backend/.env and ensure network access is allowed.');
    process.exit(1);
  });

module.exports = server;
