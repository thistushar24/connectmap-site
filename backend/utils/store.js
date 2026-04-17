/**
 * MongoDB-only store.
 * Delegates directly to Mongoose models — no JSON file fallback.
 * All operations will throw if called before the DB is connected,
 * which forces the server to wait for a successful connection before serving requests.
 */

let _Torrent = null;
let _File = null;

function setModels(torrentModel, fileModel) {
  _Torrent = torrentModel;
  _File = fileModel;
}

function assertReady() {
  if (!_Torrent || !_File) {
    throw new Error('Database not connected yet — models not initialized');
  }
}

// ─── Torrent Store ──────────────────────────────────────────────────────────

const TorrentStore = {
  async create(data) {
    assertReady();
    return _Torrent.create(data);
  },

  async findOne(filter) {
    assertReady();
    return _Torrent.findOne(filter).lean();
  },

  async findById(id) {
    assertReady();
    return _Torrent.findById(id).lean();
  },

  async find(filter = {}, { skip = 0, limit = 20 } = {}) {
    assertReady();
    return _Torrent.find(filter)
      .select('-piecesHex')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  },

  async countDocuments(filter = {}) {
    assertReady();
    return _Torrent.countDocuments(filter);
  },

  async findByIdAndDelete(id) {
    assertReady();
    return _Torrent.findByIdAndDelete(id).lean();
  },

  async findOneAndDelete(filter) {
    assertReady();
    return _Torrent.findOneAndDelete(filter).lean();
  },

  async aggregate(pipeline) {
    assertReady();
    return _Torrent.aggregate(pipeline);
  },
};

// ─── File Store ─────────────────────────────────────────────────────────────

const FileStore = {
  async create(data) {
    assertReady();
    return _File.create(data);
  },

  async findById(id) {
    assertReady();
    return _File.findById(id).lean();
  },

  async find(filter = {}, { skip = 0, limit = 20 } = {}) {
    assertReady();
    return _File.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  },

  async countDocuments(filter = {}) {
    assertReady();
    return _File.countDocuments(filter);
  },

  async findByIdAndDelete(id) {
    assertReady();
    return _File.findByIdAndDelete(id).lean();
  },

  async aggregate(pipeline) {
    assertReady();
    return _File.aggregate(pipeline);
  },
};

module.exports = { TorrentStore, FileStore, setModels };
