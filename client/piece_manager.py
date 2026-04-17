"""
Piece Manager — handles piece selection, verification, and tracking.
Implements the rarest-first algorithm and SHA-1 integrity checking.
"""

import hashlib
import random
import threading


class PieceManager:
    """
    Manages the state of all pieces in a torrent download.
    Tracks which pieces we have, which peers have which pieces,
    and implements the rarest-first selection strategy.
    """

    def __init__(self, piece_count: int, piece_length: int, total_size: int,
                 piece_hashes: list):
        """
        piece_count: total number of pieces
        piece_length: size of each piece in bytes
        total_size: total file size in bytes
        piece_hashes: list of 20-byte SHA-1 hashes, one per piece
        """
        self.piece_count = piece_count
        self.piece_length = piece_length
        self.total_size = total_size
        self.piece_hashes = piece_hashes  # List of bytes (20 each)

        # Track what we have
        self.have = [False] * piece_count
        self.completed_count = 0

        # Track what each peer has: peer_key -> list[bool]
        self.peer_pieces = {}

        # Currently requested pieces: piece_index -> peer_key
        self.pending = {}

        # Piece data buffer: piece_index -> {offset -> bytes}
        self.piece_buffers = {}

        self._lock = threading.Lock()

    def update_peer_bitfield(self, peer_key: str, bitfield: list):
        """Register a peer's bitfield (which pieces they have)."""
        with self._lock:
            # Trim to our piece count
            self.peer_pieces[peer_key] = bitfield[:self.piece_count]

    def peer_has_piece(self, peer_key: str, index: int):
        """Update when we receive a HAVE message from a peer."""
        with self._lock:
            if peer_key not in self.peer_pieces:
                self.peer_pieces[peer_key] = [False] * self.piece_count
            if index < self.piece_count:
                self.peer_pieces[peer_key][index] = True

    def remove_peer(self, peer_key: str):
        """Remove a peer from tracking."""
        with self._lock:
            self.peer_pieces.pop(peer_key, None)
            # Un-pend any pieces assigned to this peer
            for idx in list(self.pending.keys()):
                if self.pending[idx] == peer_key:
                    del self.pending[idx]

    def select_piece(self, peer_key: str) -> int:
        """
        RAREST FIRST piece selection algorithm.

        1. Calculate availability of each piece across all peers
        2. Filter to pieces: we don't have, peer has, not pending
        3. Sort by rarity (ascending)
        4. Randomize among ties
        5. Return the rarest piece index, or -1 if none available

        Returns: piece index or -1
        """
        with self._lock:
            if peer_key not in self.peer_pieces:
                return -1

            peer_bf = self.peer_pieces[peer_key]

            # Calculate availability across all peers
            availability = [0] * self.piece_count
            for pk, bf in self.peer_pieces.items():
                for i in range(min(len(bf), self.piece_count)):
                    if bf[i]:
                        availability[i] += 1

            # Build candidates: (availability, piece_index)
            candidates = []
            for i in range(self.piece_count):
                if (not self.have[i]
                        and i < len(peer_bf) and peer_bf[i]
                        and i not in self.pending):
                    candidates.append((availability[i], i))

            if not candidates:
                return -1

            # Randomize then sort by rarity (rarest first)
            random.shuffle(candidates)
            candidates.sort(key=lambda x: x[0])

            chosen = candidates[0][1]
            self.pending[chosen] = peer_key
            return chosen

    def get_piece_size(self, index: int) -> int:
        """Get the actual size of a specific piece (last piece may be smaller)."""
        if index == self.piece_count - 1:
            remainder = self.total_size % self.piece_length
            return remainder if remainder > 0 else self.piece_length
        return self.piece_length

    def add_block(self, index: int, begin: int, block: bytes):
        """Add a received block to a piece buffer."""
        with self._lock:
            if index not in self.piece_buffers:
                self.piece_buffers[index] = {}
            self.piece_buffers[index][begin] = block

    def is_piece_complete(self, index: int) -> bool:
        """Check if all blocks for a piece have been received."""
        with self._lock:
            if index not in self.piece_buffers:
                return False
            piece_size = self.get_piece_size(index)
            received = sum(len(b) for b in self.piece_buffers[index].values())
            return received >= piece_size

    def get_piece_data(self, index: int) -> bytes:
        """Assemble all blocks for a piece in order."""
        with self._lock:
            if index not in self.piece_buffers:
                return b''
            blocks = self.piece_buffers[index]
            result = b''
            for offset in sorted(blocks.keys()):
                result += blocks[offset]
            return result

    def verify_piece(self, index: int) -> bool:
        """
        Verify piece integrity using SHA-1 hash.
        Compares computed hash against the hash from the .torrent file.
        """
        data = self.get_piece_data(index)
        computed = hashlib.sha1(data).digest()
        expected = self.piece_hashes[index]

        if computed == expected:
            return True
        else:
            print(f"[Piece] Hash mismatch for piece {index}!")
            print(f"  Expected: {expected.hex()}")
            print(f"  Got:      {computed.hex()}")
            return False

    def mark_complete(self, index: int) -> bool:
        """
        Mark a piece as complete after verification.
        Returns True if hash is valid, False if corrupted.
        """
        if self.verify_piece(index):
            with self._lock:
                self.have[index] = True
                self.completed_count += 1
                self.pending.pop(index, None)
                # Free the buffer (piece will be written to disk)
                self.piece_buffers.pop(index, None)
            return True
        else:
            # Hash failed — discard and re-request
            with self._lock:
                self.piece_buffers.pop(index, None)
                self.pending.pop(index, None)
            return False

    def is_complete(self) -> bool:
        """Check if all pieces have been downloaded."""
        return self.completed_count == self.piece_count

    @property
    def progress(self) -> float:
        """Download progress as a float 0.0 to 1.0."""
        return self.completed_count / self.piece_count if self.piece_count > 0 else 0

    @property
    def bytes_downloaded(self) -> int:
        """Approximate bytes downloaded (completed pieces)."""
        if self.completed_count == self.piece_count:
            return self.total_size
        return self.completed_count * self.piece_length

    def get_endgame_pieces(self) -> list:
        """
        ENDGAME MODE: When only a few pieces remain, return all
        missing piece indices so they can be requested from multiple peers.
        """
        remaining = []
        for i in range(self.piece_count):
            if not self.have[i]:
                remaining.append(i)
        return remaining
