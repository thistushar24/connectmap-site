const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { TorrentStore, FileStore } = require('../utils/store');
const { parseTorrent } = require('../utils/torrentParser');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

/**
 * POST /api/upload
 * Accept any file. .torrent → parse & index. Everything else → File record.
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const isTorrent = path.extname(req.file.originalname).toLowerCase() === '.torrent';

    if (isTorrent) {
      const buffer = fs.readFileSync(req.file.path);
      let parsed;
      try {
        parsed = parseTorrent(buffer);
      } catch (parseErr) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Failed to parse .torrent file: ' + parseErr.message });
      }

      // Check duplicate
      const existing = await TorrentStore.findOne({ infoHash: parsed.infoHash });
      if (existing) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({
          error: 'Torrent already exists',
          id: existing._id,
          infoHash: existing.infoHash,
        });
      }

      const trackerUrl = parsed.announce || 'http://localhost:6969/announce';

      const torrent = await TorrentStore.create({
        infoHash: parsed.infoHash,
        name: parsed.name,
        description: req.body.description || '',
        totalSize: parsed.totalSize,
        pieceLength: parsed.pieceLength,
        pieceCount: parsed.pieceCount,
        piecesHex: parsed.piecesHex,
        files: parsed.files,
        trackerUrl,
        announceList: parsed.announceList,
        torrentFilename: req.file.filename,
        category: req.body.category || 'other',
        uploadedBy: req.body.uploadedBy || 'anonymous',
      });

      return res.status(201).json({
        type: 'torrent',
        id: torrent._id,
        infoHash: torrent.infoHash,
        name: torrent.name,
        totalSize: torrent.totalSize,
        pieceCount: torrent.pieceCount,
        files: torrent.files?.length || 0,
      });
    } else {
      // General file
      const fileRecord = await FileStore.create({
        originalName: req.file.originalname,
        storedFilename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        description: req.body.description || '',
        category: req.body.category || 'other',
        uploadedBy: req.body.uploadedBy || 'anonymous',
      });

      return res.status(201).json({
        type: 'file',
        id: fileRecord._id,
        name: fileRecord.originalName,
        size: fileRecord.size,
        mimetype: fileRecord.mimetype,
      });
    }
  } catch (err) {
    console.error('Upload error:', err.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

/**
 * GET /api/upload/download/:id  — download raw .torrent file
 */
router.get('/download/:id', async (req, res) => {
  try {
    const torrent = await TorrentStore.findById(req.params.id);
    if (!torrent?.torrentFilename) return res.status(404).json({ error: 'Torrent not found' });
    const filePath = path.join(uploadsDir, torrent.torrentFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from server' });
    res.download(filePath, `${torrent.name}.torrent`);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * GET /api/upload/download-file/:id  — download general file
 */
router.get('/download-file/:id', async (req, res) => {
  try {
    const fileRecord = await FileStore.findById(req.params.id);
    if (!fileRecord?.storedFilename) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadsDir, fileRecord.storedFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from server' });
    res.setHeader('Content-Type', fileRecord.mimetype || 'application/octet-stream');
    res.download(filePath, fileRecord.originalName);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * DELETE /api/upload/file/:id  — delete general file
 */
router.delete('/file/:id', async (req, res) => {
  try {
    const fileRecord = await FileStore.findByIdAndDelete(req.params.id);
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });
    const filePath = path.join(uploadsDir, fileRecord.storedFilename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
