"""
Bencode encoder/decoder for .torrent file parsing.
Implements the bencode format as specified in BEP 0003.
"""

def decode(data: bytes, index: int = 0):
    """Decode a bencoded value starting at index. Returns (value, next_index)."""
    char = chr(data[index])

    if char == 'i':
        # Integer: i<number>e
        end = data.index(b'e', index)
        return int(data[index + 1 : end]), end + 1

    elif char == 'l':
        # List: l<values>e
        result = []
        index += 1
        while chr(data[index]) != 'e':
            val, index = decode(data, index)
            result.append(val)
        return result, index + 1

    elif char == 'd':
        # Dictionary: d<key><value>...e (keys must be strings, sorted)
        result = {}
        index += 1
        while chr(data[index]) != 'e':
            key, index = decode(data, index)
            if isinstance(key, bytes):
                key = key.decode('utf-8', errors='replace')
            val, index = decode(data, index)
            result[key] = val
        return result, index + 1

    elif char.isdigit():
        # String: <length>:<data>
        colon = data.index(b':', index)
        length = int(data[index:colon])
        start = colon + 1
        return data[start : start + length], start + length

    else:
        raise ValueError(f"Invalid bencode character '{char}' at position {index}")


def encode(obj) -> bytes:
    """Encode a Python object into bencode format."""
    if isinstance(obj, int):
        return f'i{obj}e'.encode()

    elif isinstance(obj, bytes):
        return f'{len(obj)}:'.encode() + obj

    elif isinstance(obj, str):
        encoded = obj.encode('utf-8')
        return f'{len(encoded)}:'.encode() + encoded

    elif isinstance(obj, list):
        parts = [b'l']
        for item in obj:
            parts.append(encode(item))
        parts.append(b'e')
        return b''.join(parts)

    elif isinstance(obj, dict):
        parts = [b'd']
        # Keys must be sorted
        for key in sorted(obj.keys(), key=lambda k: k.encode() if isinstance(k, str) else k):
            parts.append(encode(key))
            parts.append(encode(obj[key]))
        parts.append(b'e')
        return b''.join(parts)

    else:
        raise TypeError(f"Cannot bencode type: {type(obj)}")


def decode_file(filepath: str) -> dict:
    """Decode an entire .torrent file."""
    with open(filepath, 'rb') as f:
        data = f.read()
    result, _ = decode(data)
    return result


def decode_with_info_range(data: bytes):
    """
    Decode a torrent file and also return the raw bytes of the 'info' dictionary.
    This is critical for calculating the info_hash correctly.
    """
    if chr(data[0]) != 'd':
        raise ValueError("Torrent file must start with a dictionary")

    result = {}
    index = 1  # skip 'd'
    info_start = -1
    info_end = -1

    while chr(data[index]) != 'e':
        key, index = decode(data, index)
        if isinstance(key, bytes):
            key = key.decode('utf-8', errors='replace')

        if key == 'info':
            info_start = index

        val, index = decode(data, index)

        if key == 'info':
            info_end = index

        result[key] = val

    info_raw = data[info_start:info_end] if info_start >= 0 else None
    return result, info_raw


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        data = decode_file(sys.argv[1])
        print(f"Torrent name: {data.get('info', {}).get('name', b'unknown')}")
        print(f"Announce: {data.get('announce', b'none')}")
    else:
        # Self-test
        test_data = {'name': 'test', 'value': 42, 'list': [1, 2, 3]}
        encoded = encode(test_data)
        decoded, _ = decode(encoded)
        assert decoded['name'] == b'test'
        assert decoded['value'] == 42
        print("Bencode self-test passed!")
