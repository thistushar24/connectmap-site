"""
Tracker client — handles communication with the BitTorrent tracker.
Sends announce requests and receives peer lists.
"""

import hashlib
import os
import struct
import urllib.parse
import urllib.request
import json
from bencode_parser import decode, encode


class TrackerClient:
    def __init__(self, tracker_url: str, info_hash: bytes, peer_id: bytes,
                 port: int = 6881):
        """
        tracker_url: URL of the tracker's announce endpoint
        info_hash: 20-byte SHA-1 hash of the info dictionary
        peer_id: 20-byte unique client identifier
        port: port the client is listening on
        """
        self.tracker_url = tracker_url
        self.info_hash = info_hash  # 20 bytes
        self.peer_id = peer_id      # 20 bytes
        self.port = port
        self.uploaded = 0
        self.downloaded = 0
        self.left = 0

    def announce(self, event: str = '', left: int = 0) -> dict:
        """
        Send an announce request to the tracker.
        event: 'started', 'completed', 'stopped', or '' (regular)
        left: bytes remaining to download

        Returns dict with 'interval', 'peers' list, 'complete', 'incomplete'
        """
        self.left = left

        params = {
            'info_hash': self.info_hash,
            'peer_id': self.peer_id,
            'port': self.port,
            'uploaded': self.uploaded,
            'downloaded': self.downloaded,
            'left': self.left,
            'compact': 1,
            'numwant': 50,
        }

        if event:
            params['event'] = event

        # Build URL with properly encoded binary params
        query_parts = []
        for key, value in params.items():
            if isinstance(value, bytes):
                query_parts.append(f"{key}={urllib.parse.quote(value, safe='')}")
            else:
                query_parts.append(f"{key}={value}")

        url = f"{self.tracker_url}?{'&'.join(query_parts)}"
        print(f"[Tracker] Announcing to: {self.tracker_url}")
        print(f"[Tracker] Event: {event or 'update'}, Left: {left}")

        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'BitTorrentClient/1.0')
            response = urllib.request.urlopen(req, timeout=15)
            raw = response.read()

            # Decode bencoded response
            data, _ = decode(raw)
            return self._parse_response(data)

        except Exception as e:
            print(f"[Tracker] Announce failed: {e}")
            return {'interval': 60, 'peers': [], 'complete': 0, 'incomplete': 0}

    def _parse_response(self, data: dict) -> dict:
        """Parse the tracker's bencoded response."""
        if isinstance(data.get('failure reason'), bytes):
            print(f"[Tracker] Failure: {data['failure reason'].decode()}")
            return {'interval': 60, 'peers': [], 'complete': 0, 'incomplete': 0}

        interval = data.get('interval', 60)
        complete = data.get('complete', 0)
        incomplete = data.get('incomplete', 0)

        # Parse peer list
        peers = []
        raw_peers = data.get('peers', b'')

        if isinstance(raw_peers, bytes):
            # Compact format: 6 bytes per peer (4 IP + 2 port)
            for i in range(0, len(raw_peers), 6):
                if i + 6 > len(raw_peers):
                    break
                ip = '.'.join(str(b) for b in raw_peers[i:i+4])
                port = struct.unpack('!H', raw_peers[i+4:i+6])[0]
                peers.append({'ip': ip, 'port': port})
        elif isinstance(raw_peers, list):
            # Dict format
            for p in raw_peers:
                ip = p.get('ip', p.get(b'ip', b'')).decode() if isinstance(
                    p.get('ip', p.get(b'ip', b'')), bytes) else str(p.get('ip', ''))
                port = p.get('port', p.get(b'port', 0))
                if ip and port:
                    peers.append({'ip': ip, 'port': port})

        print(f"[Tracker] Got {len(peers)} peers, {complete} seeders, {incomplete} leechers")
        return {
            'interval': interval,
            'peers': peers,
            'complete': complete,
            'incomplete': incomplete,
        }

    def announce_stopped(self):
        """Notify tracker that we're stopping."""
        return self.announce(event='stopped', left=self.left)

    def announce_completed(self):
        """Notify tracker that download is complete."""
        return self.announce(event='completed', left=0)


def generate_peer_id() -> bytes:
    """Generate a 20-byte peer ID. Format: -BT1000-<12 random bytes>"""
    prefix = b'-BT1000-'
    suffix = os.urandom(12)
    return prefix + suffix


if __name__ == '__main__':
    # Test with local tracker
    info_hash = hashlib.sha1(b'test_torrent_info').digest()
    peer_id = generate_peer_id()
    client = TrackerClient('http://localhost:6969/announce', info_hash, peer_id)
    result = client.announce(event='started', left=1000000)
    print(f"Tracker response: {result}")
