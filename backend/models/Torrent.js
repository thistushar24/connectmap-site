const mongoose = require('mongoose');

const torrentSchema = new mongoose.Schema({
  infoHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  totalSize: {
    type: Number,
    required: true,
  },
  pieceLength: {
    type: Number,
    required: true,
  },
  pieceCount: {
    type: Number,
    required: true,
  },
  piecesHex: {
    type: String,
    required: true,
  },
  files: [
    {
      path: { type: String, required: true },
      size: { type: Number, required: true },
    },
  ],
  trackerUrl: {
    type: String,
    default: '',
  },
  announceList: {
    type: [[String]],
    default: [],
  },
  torrentFilename: {
    type: String,
    default: '',
  },
  seeders: {
    type: Number,
    default: 0,
  },
  leechers: {
    type: Number,
    default: 0,
  },
  uploadedBy: {
    type: String,
    default: 'anonymous',
  },
  category: {
    type: String,
    enum: ['software', 'video', 'audio', 'games', 'documents', 'other'],
    default: 'other',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Text index for full-text search
torrentSchema.index({ name: 'text', description: 'text' });
// Also index name for regex fallback search
torrentSchema.index({ name: 1 });

module.exports = mongoose.model('Torrent', torrentSchema);
