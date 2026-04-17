"""
Peer Wire Protocol — implements the BitTorrent peer-to-peer binary protocol.
Handles: handshake, message framing, and all standard BEP 3 message types.
"""

import struct
import socket
import threading
import time

# Protocol constants
PROTOCOL_STRING = b'BitTorrent protocol'
PROTOCOL_LEN = 19

# Message IDs
CHOKE = 0
UNCHOKE = 1
INTERESTED = 2
NOT_INTERESTED = 3
HAVE = 4
BITFIELD = 5
REQUEST = 6
PIECE = 7
CANCEL = 8

BLOCK_SIZE = 16384  # 16 KB — standard block size


class PeerConnection:
    """
    Manages a TCP connection to a single BitTorrent peer.
    Implements the peer wire protocol including handshake and message exchange.
    """

    def __init__(self, ip: str, port: int, info_hash: bytes, peer_id: bytes):
        self.ip = ip
        self.port = port
        self.info_hash = info_hash    # 20 bytes
        self.peer_id = peer_id        # 20 bytes
        self.remote_peer_id = None
        self.sock = None

        # Connection state (BEP 3 state machine)
        self.am_choking = True        # Am I choking the peer?
        self.am_interested = False    # Am I interested in the peer?
        self.peer_choking = True      # Is the peer choking me?
        self.peer_interested = False  # Is the peer interested in me?

        # Peer's available pieces
        self.peer_bitfield = []

        # Stats
        self.download_rate = 0
        self.upload_rate = 0
        self._downloaded_bytes = 0
        self._uploaded_bytes = 0
        self._last_rate_calc = time.time()

        self.connected = False
        self._lock = threading.Lock()

    def connect(self, timeout: int = 10) -> bool:
        """Establish TCP connection to the peer."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(timeout)
            self.sock.connect((self.ip, self.port))
            self.connected = True
            print(f"[Peer] Connected to {self.ip}:{self.port}")
            return True
        except Exception as e:
            print(f"[Peer] Failed to connect to {self.ip}:{self.port}: {e}")
            self.connected = False
            return False

    def handshake(self) -> bytes:
        """
        Perform the BitTorrent handshake (68 bytes total):
        <pstrlen=19><pstr="BitTorrent protocol"><reserved=8 zeros><info_hash=20><peer_id=20>
        """
        # Build handshake message
        msg = struct.pack('B', PROTOCOL_LEN)
        msg += PROTOCOL_STRING
        msg += b'\x00' * 8          # Reserved bytes
        msg += self.info_hash        # 20 bytes
        msg += self.peer_id          # 20 bytes

        self.sock.sendall(msg)

        # Receive peer's handshake
        response = self._recv_exact(68)

        pstrlen = response[0]
        pstr = response[1:20]
        reserved = response[20:28]
        recv_info_hash = response[28:48]
        recv_peer_id = response[48:68]

        # Validate
        if pstr != PROTOCOL_STRING:
            raise Exception(f"Invalid protocol string: {pstr}")
        if recv_info_hash != self.info_hash:
            raise Exception("Info hash mismatch — wrong torrent!")

        self.remote_peer_id = recv_peer_id
        print(f"[Peer] Handshake OK with {self.ip}:{self.port}")
        return recv_peer_id

    # ── Message Senders ──────────────────────────────────────────────

    def send_interested(self):
        """Tell the peer we are interested in their data."""
        self._send_message(INTERESTED)
        self.am_interested = True

    def send_not_interested(self):
        self._send_message(NOT_INTERESTED)
        self.am_interested = False

    def send_choke(self):
        self._send_message(CHOKE)
        self.am_choking = True

    def send_unchoke(self):
        self._send_message(UNCHOKE)
        self.am_choking = False

    def send_have(self, piece_index: int):
        """Announce that we have successfully downloaded a piece."""
        payload = struct.pack('>I', piece_index)
        self._send_message(HAVE, payload)

    def send_request(self, piece_index: int, begin: int, length: int):
        """Request a block of data from the peer."""
        payload = struct.pack('>III', piece_index, begin, length)
        self._send_message(REQUEST, payload)

    def send_cancel(self, piece_index: int, begin: int, length: int):
        """Cancel a pending request."""
        payload = struct.pack('>III', piece_index, begin, length)
        self._send_message(CANCEL, payload)

    def send_bitfield(self, bitfield: list):
        """Send our bitfield to the peer."""
        # Convert list of bools to bytes
        byte_count = (len(bitfield) + 7) // 8
        raw = bytearray(byte_count)
        for i, has in enumerate(bitfield):
            if has:
                raw[i // 8] |= (1 << (7 - (i % 8)))
        self._send_message(BITFIELD, bytes(raw))

    def send_piece(self, index: int, begin: int, block: bytes):
        """Send a piece block to the peer (upload)."""
        payload = struct.pack('>II', index, begin) + block
        self._send_message(PIECE, payload)
        self._uploaded_bytes += len(block)

    # ── Message Receiver ─────────────────────────────────────────────

    def read_message(self):
        """
        Read one length-prefixed message from the peer.
        Returns (message_id, payload) or (None, None) for keep-alive.
        """
        try:
            length_bytes = self._recv_exact(4)
            length = struct.unpack('>I', length_bytes)[0]

            if length == 0:
                return None, None  # Keep-alive

            msg_id = self._recv_exact(1)[0]
            payload = self._recv_exact(length - 1) if length > 1 else b''

            return msg_id, payload

        except socket.timeout:
            return None, None
        except Exception as e:
            print(f"[Peer] Read error from {self.ip}:{self.port}: {e}")
            self.connected = False
            return -1, None

    def process_message(self, msg_id: int, payload: bytes):
        """Process a received message and update internal state."""
        if msg_id == CHOKE:
            self.peer_choking = True
            print(f"[Peer] {self.ip} choked us")

        elif msg_id == UNCHOKE:
            self.peer_choking = False
            print(f"[Peer] {self.ip} unchoked us")

        elif msg_id == INTERESTED:
            self.peer_interested = True

        elif msg_id == NOT_INTERESTED:
            self.peer_interested = False

        elif msg_id == HAVE:
            piece_index = struct.unpack('>I', payload)[0]
            if piece_index < len(self.peer_bitfield):
                self.peer_bitfield[piece_index] = True

        elif msg_id == BITFIELD:
            self.peer_bitfield = self._parse_bitfield(payload)
            pieces_have = sum(self.peer_bitfield)
            print(f"[Peer] {self.ip} has {pieces_have}/{len(self.peer_bitfield)} pieces")

        elif msg_id == PIECE:
            index = struct.unpack('>I', payload[:4])[0]
            begin = struct.unpack('>I', payload[4:8])[0]
            block = payload[8:]
            self._downloaded_bytes += len(block)
            return ('piece', index, begin, block)

        elif msg_id == REQUEST:
            index = struct.unpack('>I', payload[:4])[0]
            begin = struct.unpack('>I', payload[4:8])[0]
            length = struct.unpack('>I', payload[8:12])[0]
            return ('request', index, begin, length)

        elif msg_id == CANCEL:
            pass  # Handle cancel if needed

        return None

    # ── Internal Helpers ─────────────────────────────────────────────

    def _send_message(self, msg_id: int, payload: bytes = b''):
        """Send a length-prefixed message."""
        with self._lock:
            length = 1 + len(payload)
            header = struct.pack('>I', length) + struct.pack('B', msg_id)
            self.sock.sendall(header + payload)

    def _recv_exact(self, n: int) -> bytes:
        """Receive exactly n bytes from the socket."""
        data = b''
        while len(data) < n:
            chunk = self.sock.recv(n - len(data))
            if not chunk:
                raise ConnectionError("Connection closed by peer")
            data += chunk
        return data

    def _parse_bitfield(self, payload: bytes) -> list:
        """Convert a bitfield byte string to a list of booleans."""
        bits = []
        for byte in payload:
            for bit in range(7, -1, -1):
                bits.append(bool(byte & (1 << bit)))
        return bits

    def calc_rates(self):
        """Calculate download/upload rates (call periodically)."""
        now = time.time()
        elapsed = now - self._last_rate_calc
        if elapsed > 0:
            self.download_rate = self._downloaded_bytes / elapsed
            self.upload_rate = self._uploaded_bytes / elapsed
            self._downloaded_bytes = 0
            self._uploaded_bytes = 0
            self._last_rate_calc = now

    def close(self):
        """Close the connection."""
        self.connected = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
