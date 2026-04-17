/**
 * Bencode encoder/decoder for .torrent file parsing
 * Implements BEP 0003 bencode format
 */

class BencodeDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.pos = 0;
  }

  decode() {
    const char = String.fromCharCode(this.buffer[this.pos]);

    if (char === 'i') return this.decodeInt();
    if (char === 'l') return this.decodeList();
    if (char === 'd') return this.decodeDict();
    if (char >= '0' && char <= '9') return this.decodeString();

    throw new Error(`Invalid bencode at position ${this.pos}: '${char}'`);
  }

  decodeInt() {
    this.pos++; // skip 'i'
    const end = this.buffer.indexOf(0x65, this.pos); // 'e'
    if (end === -1) throw new Error('Unterminated integer');
    const num = parseInt(this.buffer.slice(this.pos, end).toString('ascii'), 10);
    this.pos = end + 1;
    return num;
  }

  decodeString() {
    const colonIndex = this.buffer.indexOf(0x3a, this.pos); // ':'
    if (colonIndex === -1) throw new Error('Invalid string: no colon');
    const length = parseInt(this.buffer.slice(this.pos, colonIndex).toString('ascii'), 10);
    this.pos = colonIndex + 1;
    const str = this.buffer.slice(this.pos, this.pos + length);
    this.pos += length;
    return str;
  }

  decodeList() {
    this.pos++; // skip 'l'
    const list = [];
    while (this.buffer[this.pos] !== 0x65) { // 'e'
      list.push(this.decode());
    }
    this.pos++; // skip 'e'
    return list;
  }

  decodeDict() {
    this.pos++; // skip 'd'
    const dict = {};
    while (this.buffer[this.pos] !== 0x65) { // 'e'
      const key = this.decodeString().toString('utf8');
      const value = this.decode();
      dict[key] = value;
    }
    this.pos++; // skip 'e'
    return dict;
  }

  /**
   * Decode and also return the raw bytes range of the 'info' dictionary
   * This is needed for info_hash calculation
   */
  decodeWithInfoRange() {
    this.pos++; // skip 'd'
    const dict = {};
    let infoStart = -1;
    let infoEnd = -1;

    while (this.buffer[this.pos] !== 0x65) {
      const key = this.decodeString().toString('utf8');
      if (key === 'info') {
        infoStart = this.pos;
      }
      const value = this.decode();
      if (key === 'info') {
        infoEnd = this.pos;
      }
      dict[key] = value;
    }
    this.pos++;

    return {
      data: dict,
      infoBuffer: infoStart >= 0 ? this.buffer.slice(infoStart, infoEnd) : null,
    };
  }
}

function encode(obj) {
  if (typeof obj === 'number' || typeof obj === 'bigint') {
    return Buffer.from(`i${obj}e`);
  }
  if (Buffer.isBuffer(obj)) {
    return Buffer.concat([Buffer.from(`${obj.length}:`), obj]);
  }
  if (typeof obj === 'string') {
    const buf = Buffer.from(obj, 'utf8');
    return Buffer.concat([Buffer.from(`${buf.length}:`), buf]);
  }
  if (Array.isArray(obj)) {
    const parts = [Buffer.from('l')];
    for (const item of obj) parts.push(encode(item));
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }
  if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj).sort();
    const parts = [Buffer.from('d')];
    for (const key of keys) {
      parts.push(encode(key));
      parts.push(encode(obj[key]));
    }
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }
  throw new Error(`Cannot bencode type: ${typeof obj}`);
}

function decode(buffer) {
  const decoder = new BencodeDecoder(buffer);
  return decoder.decode();
}

function decodeWithInfo(buffer) {
  const decoder = new BencodeDecoder(buffer);
  return decoder.decodeWithInfoRange();
}

module.exports = { encode, decode, decodeWithInfo };
