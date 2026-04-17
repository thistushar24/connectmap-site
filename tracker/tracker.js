/**
 * BitTorrent Tracker Server
 * Implements HTTP tracker protocol (BEP 3)
 * Endpoints: /announce, /scrape, /stats
 */

const http = require('http');
const querystring = require('querystring');

// Base URL used by WHATWG URL parser (tracker is always local)
const TRACKER_BASE = 'http://localhost';
const PeerStore = require('./peerStore');

const PORT = process.env.TRACKER_PORT || 6969;
const ANNOUNCE_INTERVAL = 60; // seconds between re-announces

const store = new PeerStore();

/**
 * Simple bencode encoder (tracker only needs encoding, not decoding)
 */
function bencode(obj) {
  if (typeof obj === 'number' || typeof obj === 'bigint') {
    return `i${obj}e`;
  }
  if (typeof obj === 'string') {
    return `${Buffer.byteLength(obj)}:${obj}`;
  }
  if (Buffer.isBuffer(obj)) {
    return `${obj.length}:${obj.toString('binary')}`;
  }
  if (Array.isArray(obj)) {
    return 'l' + obj.map(bencode).join('') + 'e';
  }
  if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj).sort();
    let result = 'd';
    for (const key of keys) {
      result += bencode(key) + bencode(obj[key]);
    }
    return result + 'e';
  }
  return '';
}

/**
 * Parse info_hash from raw query string (it's URL-encoded binary)
 */
function parseInfoHash(rawQuery) {
  // info_hash is a 20-byte binary value that's URL-encoded
  const match = rawQuery.match(/info_hash=([^&]*)/);
  if (!match) return null;

  const encoded = match[1];
  // Decode URL encoding to get raw bytes, then convert to hex
  try {
    const decoded = querystring.unescape(encoded);
    const buf = Buffer.from(decoded, 'binary');
    return buf.toString('hex');
  } catch (e) {
    return encoded; // fallback: treat as already hex
  }
}

/**
 * Handle /announce requests
 */
function handleAnnounce(req, res) {
  const parsedUrl = new URL(req.url, TRACKER_BASE);
  const rawQuery = parsedUrl.search ? parsedUrl.search.slice(1) : '';
  const params = querystring.parse(rawQuery);

  const infoHashHex = parseInfoHash(rawQuery) || params.info_hash || '';
  const peerId = params.peer_id || '';
  const port = parseInt(params.port) || 6881;
  const uploaded = parseInt(params.uploaded) || 0;
  const downloaded = parseInt(params.downloaded) || 0;
  const left = parseInt(params.left) || 0;
  const event = params.event || '';
  const compact = params.compact === '1';

  // Get the peer's IP from the request
  const ip =
    params.ip ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress?.replace('::ffff:', '') ||
    '127.0.0.1';

  if (!infoHashHex || infoHashHex.length < 10) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(bencode({ 'failure reason': 'Missing or invalid info_hash' }));
    return;
  }

  console.log(
    `[Announce] ${event || 'update'} | hash=${infoHashHex.substring(0, 12)}... | ${ip}:${port} | left=${left}`
  );

  // Handle events
  if (event === 'stopped') {
    store.remove(infoHashHex, ip, port);
  } else {
    store.upsert(infoHashHex, {
      ip,
      port,
      peerId,
      uploaded,
      downloaded,
      left,
    });
  }

  // Get peer list
  const peers = store.getPeers(infoHashHex, ip, port);
  const stats = store.getStats(infoHashHex);

  // Build response
  let response;
  if (compact) {
    // Compact format: 6 bytes per peer (4 IP + 2 port)
    const buf = Buffer.alloc(peers.length * 6);
    peers.forEach((peer, i) => {
      const parts = peer.ip.split('.');
      buf[i * 6] = parseInt(parts[0]);
      buf[i * 6 + 1] = parseInt(parts[1]);
      buf[i * 6 + 2] = parseInt(parts[2]);
      buf[i * 6 + 3] = parseInt(parts[3]);
      buf.writeUInt16BE(peer.port, i * 6 + 4);
    });
    response = {
      interval: ANNOUNCE_INTERVAL,
      complete: stats.seeders,
      incomplete: stats.leechers,
      peers: buf,
    };
  } else {
    // Dict format
    response = {
      interval: ANNOUNCE_INTERVAL,
      complete: stats.seeders,
      incomplete: stats.leechers,
      peers: peers.map((p) => ({
        ip: p.ip,
        port: p.port,
        'peer id': '',
      })),
    };
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(bencode(response));
}

/**
 * Handle /scrape requests
 */
function handleScrape(req, res) {
  const parsedUrl = new URL(req.url, TRACKER_BASE);
  const rawQuery = parsedUrl.search ? parsedUrl.search.slice(1) : '';

  const infoHashHex = parseInfoHash(rawQuery);

  const files = {};

  if (infoHashHex) {
    const stats = store.getStats(infoHashHex);
    files[infoHashHex] = {
      complete: stats.seeders,
      incomplete: stats.leechers,
      downloaded: 0,
    };
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(bencode({ files }));
}

/**
 * Handle /stats (JSON overview)
 */
function handleStats(req, res) {
  const global = store.globalStats();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      tracker: 'BitTorrent Tracker',
      ...global,
      uptime: process.uptime(),
    })
  );
}

if (require.main === module) {
  // HTTP server
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, TRACKER_BASE).pathname;

    // CORS headers for browser access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (pathname === '/announce') {
      handleAnnounce(req, res);
    } else if (pathname === '/scrape') {
      handleScrape(req, res);
    } else if (pathname === '/stats') {
      handleStats(req, res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('BitTorrent Tracker running. Use /announce, /scrape, or /stats');
    }
  });

  server.listen(PORT, () => {
    console.log(`BitTorrent Tracker running on http://localhost:${PORT}`);
    console.log(`  Announce: http://localhost:${PORT}/announce`);
    console.log(`  Scrape:   http://localhost:${PORT}/scrape`);
    console.log(`  Stats:    http://localhost:${PORT}/stats`);
  });

  process.on('SIGINT', () => {
    store.destroy();
    process.exit(0);
  });
} else {
  // Export handlers for mounting in Express
  module.exports = {
    handleAnnounce,
    handleScrape,
    handleStats,
    store
  };
}
