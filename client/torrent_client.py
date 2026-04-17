"""
Main Torrent Client — orchestrates the full download pipeline:
1. Parse .torrent file → extract metadata
2. Contact tracker → get peer list
3. Connect to peers → handshake
4. Exchange bitfields → determine what peers have
5. Request pieces (rarest first) → download blocks
6. Verify pieces (SHA-1) → write to disk
7. Seed (upload to other peers)
"""

import hashlib
import os
import sys
import threading
import time

from bencode_parser import decode_with_info_range, encode, decode_file
from tracker_client import TrackerClient, generate_peer_id
from peer_protocol import PeerConnection, BLOCK_SIZE, INTERESTED, PIECE, HAVE, BITFIELD, UNCHOKE, CHOKE, REQUEST
from piece_manager import PieceManager
from file_handler import FileHandler


class TorrentClient:
    def __init__(self):
        self.peer_id = generate_peer_id()
        self.port = 6881
        self.downloads = {}  # info_hash_hex -> DownloadTask
        self._lock = threading.Lock()

    def add_torrent(self, torrent_path: str, save_path: str = './downloads') -> str:
        """Add a .torrent file and start downloading."""
        # Parse the torrent file
        with open(torrent_path, 'rb') as f:
            raw = f.read()

        data, info_raw = decode_with_info_range(raw)
        info = data.get('info', {})

        # Calculate info_hash
        info_hash = hashlib.sha1(info_raw).digest()
        info_hash_hex = info_hash.hex()

        # Extract metadata
        name = info.get('name', b'unknown')
        if isinstance(name, bytes):
            name = name.decode('utf-8', errors='replace')

        piece_length = info.get('piece length', 262144)
        pieces_raw = info.get('pieces', b'')
        piece_count = len(pieces_raw) // 20

        # Split pieces hash into list of 20-byte hashes
        piece_hashes = [pieces_raw[i:i+20] for i in range(0, len(pieces_raw), 20)]

        # Extract files
        files = []
        total_size = 0
        if 'files' in info:
            for f in info['files']:
                path_parts = f.get('path', [])
                path = '/'.join(
                    p.decode('utf-8', errors='replace') if isinstance(p, bytes) else p
                    for p in path_parts
                )
                size = f.get('length', 0)
                files.append({'path': os.path.join(name, path), 'size': size})
                total_size += size
        else:
            total_size = info.get('length', 0)
            files.append({'path': name, 'size': total_size})

        # Tracker URL
        announce = data.get('announce', b'')
        if isinstance(announce, bytes):
            announce = announce.decode('utf-8', errors='replace')
        if not announce:
            announce = 'http://localhost:6969/announce'

        print(f"\n{'='*60}")
        print(f"Torrent: {name}")
        print(f"Info Hash: {info_hash_hex}")
        print(f"Size: {total_size / (1024*1024):.2f} MB")
        print(f"Pieces: {piece_count} x {piece_length} bytes")
        print(f"Files: {len(files)}")
        print(f"Tracker: {announce}")
        print(f"{'='*60}\n")

        # Create download task
        task = DownloadTask(
            info_hash=info_hash,
            info_hash_hex=info_hash_hex,
            name=name,
            piece_count=piece_count,
            piece_length=piece_length,
            piece_hashes=piece_hashes,
            total_size=total_size,
            files=files,
            tracker_url=announce,
            save_path=save_path,
            peer_id=self.peer_id,
            port=self.port,
        )

        with self._lock:
            self.downloads[info_hash_hex] = task

        # Start download in background thread
        thread = threading.Thread(target=task.start, daemon=True)
        thread.start()

        return info_hash_hex

    def get_status(self, info_hash_hex: str) -> dict:
        """Get the current status of a download."""
        with self._lock:
            task = self.downloads.get(info_hash_hex)

        if not task:
            return None

        return task.get_status()

    def get_all_status(self) -> list:
        """Get status of all downloads."""
        with self._lock:
            return [task.get_status() for task in self.downloads.values()]


class DownloadTask:
    """Manages a single torrent download."""

    def __init__(self, info_hash, info_hash_hex, name, piece_count,
                 piece_length, piece_hashes, total_size, files,
                 tracker_url, save_path, peer_id, port):
        self.info_hash = info_hash
        self.info_hash_hex = info_hash_hex
        self.name = name
        self.tracker_url = tracker_url
        self.save_path = save_path
        self.peer_id = peer_id
        self.port = port

        self.piece_manager = PieceManager(
            piece_count, piece_length, total_size, piece_hashes
        )
        self.file_handler = FileHandler(save_path, files, piece_length, total_size)
        self.tracker = TrackerClient(tracker_url, info_hash, peer_id, port)

        self.peers = []  # List of PeerConnection
        self.state = 'initializing'
        self.download_rate = 0
        self.upload_rate = 0
        self.start_time = None
        self._stop = False

        # Check for existing pieces (resume support)
        existing = self.file_handler.verify_existing(piece_hashes, piece_count)
        for i, has in enumerate(existing):
            if has:
                self.piece_manager.have[i] = True
                self.piece_manager.completed_count += 1

    def start(self):
        """Main download loop."""
        self.start_time = time.time()
        self.state = 'started'

        # 1. Announce to tracker
        self.state = 'contacting tracker'
        result = self.tracker.announce(
            event='started',
            left=self.piece_manager.total_size - self.piece_manager.bytes_downloaded
        )

        peer_list = result.get('peers', [])
        if not peer_list:
            print("[Client] No peers found. Waiting...")
            self.state = 'no peers'
            # Keep trying
            for attempt in range(10):
                time.sleep(5)
                result = self.tracker.announce(
                    left=self.piece_manager.total_size - self.piece_manager.bytes_downloaded
                )
                peer_list = result.get('peers', [])
                if peer_list:
                    break

        if not peer_list:
            self.state = 'no peers available'
            return

        # 2. Connect to peers
        self.state = 'connecting to peers'
        for peer_info in peer_list[:20]:  # Max 20 peers
            if self._stop:
                break
            peer = PeerConnection(
                peer_info['ip'], peer_info['port'],
                self.info_hash, self.peer_id
            )
            if peer.connect():
                try:
                    peer.handshake()
                    self.peers.append(peer)
                    # Start a download thread for this peer
                    t = threading.Thread(
                        target=self._peer_loop, args=(peer,), daemon=True
                    )
                    t.start()
                except Exception as e:
                    print(f"[Client] Handshake failed with {peer.ip}: {e}")
                    peer.close()

        if not self.peers:
            self.state = 'connection failed'
            return

        self.state = 'downloading'

        # 3. Monitor loop
        while not self.piece_manager.is_complete() and not self._stop:
            time.sleep(2)
            self._update_rates()
            self._rechoke()

            # Re-announce periodically
            if int(time.time()) % 60 == 0:
                self.tracker.announce(
                    left=self.piece_manager.total_size - self.piece_manager.bytes_downloaded
                )

        if self.piece_manager.is_complete():
            self.state = 'seeding'
            self.tracker.announce_completed()
            print(f"\n[Client] Download complete: {self.name}")

            # Keep seeding
            while not self._stop:
                time.sleep(10)

    def _peer_loop(self, peer: PeerConnection):
        """Handle communication with a single peer."""
        peer_key = f"{peer.ip}:{peer.port}"

        try:
            # Send interested
            peer.send_interested()

            while peer.connected and not self._stop:
                msg_id, payload = peer.read_message()

                if msg_id is None:
                    continue
                if msg_id == -1:
                    break

                result = peer.process_message(msg_id, payload)

                # Handle bitfield
                if msg_id == BITFIELD:
                    self.piece_manager.update_peer_bitfield(
                        peer_key, peer.peer_bitfield
                    )

                # Handle HAVE
                if msg_id == HAVE:
                    import struct
                    idx = struct.unpack('>I', payload)[0]
                    self.piece_manager.peer_has_piece(peer_key, idx)

                # Handle UNCHOKE — start requesting pieces
                if msg_id == UNCHOKE:
                    self._request_pieces(peer, peer_key)

                # Handle PIECE data
                if result and result[0] == 'piece':
                    _, index, begin, block = result
                    self.piece_manager.add_block(index, begin, block)

                    if self.piece_manager.is_piece_complete(index):
                        if self.piece_manager.mark_complete(index):
                            # Write to disk
                            data = self.piece_manager.get_piece_data(index)
                            if not data:
                                data = b''
                                # Re-read from completed pieces
                            self.file_handler.write_piece(
                                index,
                                self._get_verified_piece_data(index)
                            )
                            # Announce HAVE to all peers
                            for p in self.peers:
                                if p.connected:
                                    try:
                                        p.send_have(index)
                                    except:
                                        pass
                            pct = self.piece_manager.progress * 100
                            print(f"[Client] Piece {index} OK — {pct:.1f}%")
                        else:
                            print(f"[Client] Piece {index} FAILED hash check")

                    # Request more pieces
                    if not peer.peer_choking:
                        self._request_pieces(peer, peer_key)

                # Handle REQUEST (uploading/seeding)
                if result and result[0] == 'request':
                    _, index, begin, length = result
                    if self.piece_manager.have[index] and not peer.am_choking:
                        piece_data = self.file_handler.read_piece(
                            index, self.piece_manager.piece_count
                        )
                        block = piece_data[begin:begin + length]
                        peer.send_piece(index, begin, block)

        except Exception as e:
            print(f"[Client] Peer {peer_key} error: {e}")
        finally:
            peer.close()
            self.piece_manager.remove_peer(peer_key)

    def _get_verified_piece_data(self, index: int) -> bytes:
        """Get piece data before buffer is cleared."""
        return self.piece_manager.get_piece_data(index)

    def _request_pieces(self, peer: PeerConnection, peer_key: str):
        """Request the next piece from a peer using rarest-first."""
        if peer.peer_choking:
            return

        piece_index = self.piece_manager.select_piece(peer_key)
        if piece_index < 0:
            return

        piece_size = self.piece_manager.get_piece_size(piece_index)

        # Request all blocks for this piece
        offset = 0
        while offset < piece_size:
            block_size = min(BLOCK_SIZE, piece_size - offset)
            peer.send_request(piece_index, offset, block_size)
            offset += block_size

    def _rechoke(self):
        """
        Tit-for-tat choking algorithm.
        Runs every ~10 seconds.
        Unchoke top 4 peers by download rate, plus 1 optimistic.
        """
        import random

        NUM_SLOTS = 4
        interested_peers = [p for p in self.peers if p.connected and p.peer_interested]

        if not interested_peers:
            return

        # Sort by download rate (what they give us)
        interested_peers.sort(key=lambda p: p.download_rate, reverse=True)

        to_unchoke = set()

        # Top N-1 by speed
        for p in interested_peers[:NUM_SLOTS - 1]:
            to_unchoke.add(p)

        # Optimistic unchoke
        choked = [p for p in interested_peers if p not in to_unchoke]
        if choked:
            to_unchoke.add(random.choice(choked))

        for p in self.peers:
            if not p.connected:
                continue
            if p in to_unchoke and p.am_choking:
                try:
                    p.send_unchoke()
                except:
                    pass
            elif p not in to_unchoke and not p.am_choking:
                try:
                    p.send_choke()
                except:
                    pass

    def _update_rates(self):
        """Calculate aggregate download/upload rates."""
        total_dl = 0
        total_ul = 0
        for p in self.peers:
            if p.connected:
                p.calc_rates()
                total_dl += p.download_rate
                total_ul += p.upload_rate
        self.download_rate = total_dl
        self.upload_rate = total_ul

    def get_status(self) -> dict:
        """Return current status as a JSON-serializable dict."""
        active_peers = sum(1 for p in self.peers if p.connected)
        elapsed = time.time() - self.start_time if self.start_time else 0
        downloaded = self.piece_manager.bytes_downloaded
        remaining = self.piece_manager.total_size - downloaded

        eta = -1
        if self.download_rate > 0:
            eta = int(remaining / self.download_rate)

        return {
            'info_hash': self.info_hash_hex,
            'name': self.name,
            'state': self.state,
            'progress': round(self.piece_manager.progress, 4),
            'download_rate': round(self.download_rate),
            'upload_rate': round(self.upload_rate),
            'num_peers': active_peers,
            'total_size': self.piece_manager.total_size,
            'downloaded': downloaded,
            'pieces_total': self.piece_manager.piece_count,
            'pieces_have': self.piece_manager.completed_count,
            'eta_seconds': eta,
            'elapsed': round(elapsed),
        }

    def stop(self):
        """Stop the download."""
        self._stop = True
        self.tracker.announce_stopped()
        for p in self.peers:
            p.close()


# ── CLI Entry Point ──────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python torrent_client.py <file.torrent> [save_path]")
        sys.exit(1)

    torrent_path = sys.argv[1]
    save_path = sys.argv[2] if len(sys.argv) > 2 else './downloads'

    client = TorrentClient()
    info_hash = client.add_torrent(torrent_path, save_path)

    print(f"Download started: {info_hash}")
    print("Press Ctrl+C to stop\n")

    try:
        while True:
            status = client.get_status(info_hash)
            if status:
                pct = status['progress'] * 100
                dl = status['download_rate'] / 1024
                ul = status['upload_rate'] / 1024
                print(f"\r{pct:.1f}% | DL: {dl:.1f} KB/s | UL: {ul:.1f} KB/s | "
                      f"Peers: {status['num_peers']} | {status['state']}",
                      end='', flush=True)

                if status['state'] == 'seeding':
                    print(f"\n\nDownload complete! Seeding...")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping...")
        task = client.downloads.get(info_hash)
        if task:
            task.stop()
