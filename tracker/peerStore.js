/**
 * In-memory peer store for the BitTorrent tracker
 * Maps info_hash → Map<peer_key, peer_data>
 * Peers expire after PEER_TTL seconds without re-announce
 */

const PEER_TTL = 120 * 1000; // 120 seconds in ms
const CLEANUP_INTERVAL = 30 * 1000; // Run cleanup every 30s

class PeerStore {
  constructor() {
    // Map<string (info_hash hex), Map<string (ip:port), PeerData>>
    this.swarms = new Map();

    // Periodic cleanup of expired peers
    this._cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  /**
   * Add or update a peer in a swarm
   */
  upsert(infoHashHex, peerData) {
    if (!this.swarms.has(infoHashHex)) {
      this.swarms.set(infoHashHex, new Map());
    }
    const swarm = this.swarms.get(infoHashHex);
    const peerKey = `${peerData.ip}:${peerData.port}`;

    swarm.set(peerKey, {
      ip: peerData.ip,
      port: peerData.port,
      peerId: peerData.peerId || '',
      uploaded: peerData.uploaded || 0,
      downloaded: peerData.downloaded || 0,
      left: peerData.left || 0,
      lastSeen: Date.now(),
    });
  }

  /**
   * Remove a peer from a swarm
   */
  remove(infoHashHex, ip, port) {
    const swarm = this.swarms.get(infoHashHex);
    if (!swarm) return;
    swarm.delete(`${ip}:${port}`);
    if (swarm.size === 0) this.swarms.delete(infoHashHex);
  }

  /**
   * Get peer list for a swarm, excluding the requesting peer
   * Returns at most `maxPeers` peers
   */
  getPeers(infoHashHex, excludeIp, excludePort, maxPeers = 50) {
    const swarm = this.swarms.get(infoHashHex);
    if (!swarm) return [];

    const excludeKey = `${excludeIp}:${excludePort}`;
    const peers = [];

    for (const [key, peer] of swarm) {
      if (key === excludeKey) continue;
      if (peers.length >= maxPeers) break;
      peers.push({ ip: peer.ip, port: peer.port });
    }

    return peers;
  }

  /**
   * Get seeder and leecher counts for a swarm
   */
  getStats(infoHashHex) {
    const swarm = this.swarms.get(infoHashHex);
    if (!swarm) return { seeders: 0, leechers: 0 };

    let seeders = 0;
    let leechers = 0;

    for (const peer of swarm.values()) {
      if (peer.left === 0) seeders++;
      else leechers++;
    }

    return { seeders, leechers };
  }

  /**
   * Remove expired peers from all swarms
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [infoHash, swarm] of this.swarms) {
      for (const [key, peer] of swarm) {
        if (now - peer.lastSeen > PEER_TTL) {
          swarm.delete(key);
          removed++;
        }
      }
      if (swarm.size === 0) this.swarms.delete(infoHash);
    }

    if (removed > 0) {
      console.log(`[Tracker] Cleaned up ${removed} expired peers`);
    }
  }

  /**
   * Get overall tracker statistics
   */
  globalStats() {
    let totalSwarms = this.swarms.size;
    let totalPeers = 0;
    for (const swarm of this.swarms.values()) {
      totalPeers += swarm.size;
    }
    return { totalSwarms, totalPeers };
  }

  destroy() {
    clearInterval(this._cleanupTimer);
  }
}

module.exports = PeerStore;
