const mongoose = require('mongoose');

/**
 * General File model — for non-torrent file uploads
 * Stored in the uploads/ directory, served via /api/upload/download-file/:id
 */
const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true,
  },
  storedFilename: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  mimetype: {
    type: String,
    default: 'application/octet-stream',
  },
  description: {
    type: String,
    default: '',
  },
  category: {
    type: String,
    enum: ['software', 'video', 'audio', 'games', 'documents', 'other'],
    default: 'other',
  },
  uploadedBy: {
    type: String,
    default: 'anonymous',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Text index for search
fileSchema.index({ originalName: 'text', description: 'text' });
fileSchema.index({ originalName: 1 });

module.exports = mongoose.model('File', fileSchema);
