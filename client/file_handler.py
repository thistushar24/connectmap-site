"""
File Handler — splits files into pieces for seeding and
merges downloaded pieces back into complete files.
"""

import os
import hashlib


class FileHandler:
    """Handles reading/writing pieces to/from disk."""

    def __init__(self, save_path: str, files: list, piece_length: int,
                 total_size: int):
        """
        save_path: directory to save downloaded files
        files: list of {'path': str, 'size': int}
        piece_length: bytes per piece
        total_size: total bytes across all files
        """
        self.save_path = save_path
        self.files = files
        self.piece_length = piece_length
        self.total_size = total_size

        # Ensure save directory exists
        os.makedirs(save_path, exist_ok=True)

    def write_piece(self, index: int, data: bytes):
        """
        Write a verified piece to disk.
        Handles multi-file torrents by calculating which file(s)
        the piece spans across.
        """
        piece_offset = index * self.piece_length
        remaining = len(data)
        data_offset = 0

        # Find which file(s) this piece belongs to
        current_file_offset = 0
        for file_info in self.files:
            file_path = os.path.join(self.save_path, file_info['path'])
            file_size = file_info['size']

            # Check if this piece overlaps with this file
            file_start = current_file_offset
            file_end = current_file_offset + file_size

            if piece_offset < file_end and (piece_offset + remaining) > file_start:
                # Calculate write position within this file
                write_start = max(0, piece_offset - file_start)
                read_start = max(0, file_start - piece_offset)
                write_length = min(
                    remaining - read_start,
                    file_size - write_start
                )

                if write_length > 0:
                    # Ensure directory exists
                    file_dir = os.path.dirname(file_path)
                    if file_dir:
                        os.makedirs(file_dir, exist_ok=True)

                    # Write data to file
                    mode = 'r+b' if os.path.exists(file_path) else 'wb'
                    with open(file_path, mode) as f:
                        if mode == 'wb':
                            # Pre-allocate the file
                            f.seek(file_size - 1)
                            f.write(b'\x00')
                        f.seek(write_start)
                        f.write(data[data_offset + read_start:
                                     data_offset + read_start + write_length])

            current_file_offset += file_size

    def read_piece(self, index: int, piece_count: int) -> bytes:
        """
        Read a piece from disk (for seeding/uploading).
        Returns the piece data or empty bytes if not available.
        """
        piece_offset = index * self.piece_length

        # Calculate actual piece size (last piece may be smaller)
        if index == piece_count - 1:
            remainder = self.total_size % self.piece_length
            piece_size = remainder if remainder > 0 else self.piece_length
        else:
            piece_size = self.piece_length

        data = b''
        remaining = piece_size
        current_file_offset = 0

        for file_info in self.files:
            file_path = os.path.join(self.save_path, file_info['path'])
            file_size = file_info['size']

            file_start = current_file_offset
            file_end = current_file_offset + file_size

            if piece_offset < file_end and (piece_offset + remaining) > file_start:
                read_start = max(0, piece_offset - file_start)
                skip = max(0, file_start - piece_offset)
                read_length = min(remaining, file_size - read_start)

                if read_length > 0 and os.path.exists(file_path):
                    try:
                        with open(file_path, 'rb') as f:
                            f.seek(read_start)
                            chunk = f.read(read_length)
                            data += chunk
                            remaining -= len(chunk)
                    except Exception:
                        data += b'\x00' * read_length
                        remaining -= read_length

            current_file_offset += file_size

            if remaining <= 0:
                break

        return data

    def verify_existing(self, piece_hashes: list, piece_count: int) -> list:
        """
        Check which pieces are already on disk (for resume support).
        Returns a list of booleans indicating which pieces are valid.
        """
        have = [False] * piece_count
        for i in range(piece_count):
            data = self.read_piece(i, piece_count)
            if len(data) > 0:
                computed = hashlib.sha1(data).digest()
                if computed == piece_hashes[i]:
                    have[i] = True

        verified = sum(have)
        if verified > 0:
            print(f"[File] Resume: {verified}/{piece_count} pieces already on disk")

        return have


def create_torrent(source_path: str, piece_length: int = 262144,
                   tracker_url: str = 'http://localhost:6969/announce') -> dict:
    """
    Create a .torrent metadata dictionary from a file or directory.

    source_path: path to file or directory
    piece_length: bytes per piece (default 256KB)
    tracker_url: tracker announce URL

    Returns a dict that can be bencoded into a .torrent file.
    """
    files = []
    all_data = b''

    if os.path.isfile(source_path):
        # Single file torrent
        name = os.path.basename(source_path)
        size = os.path.getsize(source_path)
        files.append({'path': name, 'size': size})
        with open(source_path, 'rb') as f:
            all_data = f.read()
    elif os.path.isdir(source_path):
        # Multi-file torrent
        name = os.path.basename(source_path)
        for root, dirs, filenames in os.walk(source_path):
            for fname in sorted(filenames):
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, source_path)
                size = os.path.getsize(full_path)
                files.append({'path': rel_path, 'size': size})
                with open(full_path, 'rb') as f:
                    all_data += f.read()
    else:
        raise FileNotFoundError(f"Source not found: {source_path}")

    # Generate piece hashes
    pieces = b''
    for i in range(0, len(all_data), piece_length):
        chunk = all_data[i:i + piece_length]
        pieces += hashlib.sha1(chunk).digest()

    total_size = len(all_data)
    piece_count = (total_size + piece_length - 1) // piece_length

    # Build info dict
    if len(files) == 1:
        info = {
            'name': name,
            'length': total_size,
            'piece length': piece_length,
            'pieces': pieces,
        }
    else:
        info = {
            'name': name,
            'piece length': piece_length,
            'pieces': pieces,
            'files': [
                {
                    'length': f['size'],
                    'path': f['path'].replace('\\', '/').split('/'),
                }
                for f in files
            ],
        }

    torrent = {
        'announce': tracker_url,
        'info': info,
        'created by': 'BitTorrent Student Client 1.0',
    }

    print(f"[Torrent] Created: {name}")
    print(f"  Files: {len(files)}, Size: {total_size}, Pieces: {piece_count}")

    return torrent
