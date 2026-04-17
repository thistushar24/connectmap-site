const express = require('express');
const router = express.Router();
const { TorrentStore } = require('../utils/store');
const { generateMagnet } = require('../utils/torrentParser');

/**
 * GET /api/torrent  — list all torrents with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [results, total] = await Promise.all([
      TorrentStore.find({}, { skip, limit: limitNum }),
      TorrentStore.countDocuments(),
    ]);

    res.json({
      results,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    console.error('List error:', err.message);
    res.status(500).json({ error: 'Failed to list torrents' });
  }
});

/**
 * GET /api/torrent/magnet/:id  — get magnet link only
 */
router.get('/magnet/:id', async (req, res) => {
  try {
    const torrent = await TorrentStore.findById(req.params.id);
    if (!torrent) return res.status(404).json({ error: 'Torrent not found' });
    const magnet = generateMagnet(torrent.infoHash, torrent.name, torrent.trackerUrl);
    res.json({ magnet, infoHash: torrent.infoHash });
  } catch (err) {
    console.error('Magnet error:', err.message);
    res.status(500).json({ error: 'Failed to generate magnet' });
  }
});

/**
 * GET /api/torrent/:id  — get full torrent details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let torrent = await TorrentStore.findById(id);
    if (!torrent) torrent = await TorrentStore.findOne({ infoHash: id.toLowerCase() });
    if (!torrent) return res.status(404).json({ error: 'Torrent not found' });

    // Add computed fields
    torrent.magnet = generateMagnet(torrent.infoHash, torrent.name, torrent.trackerUrl);
    const total = (torrent.seeders || 0) + (torrent.leechers || 0);
    torrent.health = total > 0 ? Math.round(((torrent.seeders || 0) / total) * 100 * 10) / 10 : 0;

    res.json(torrent);
  } catch (err) {
    console.error('Torrent detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch torrent' });
  }
});

/**
 * DELETE /api/torrent/:id  — remove a torrent
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let result = await TorrentStore.findByIdAndDelete(id);
    if (!result) result = await TorrentStore.findOneAndDelete({ infoHash: id.toLowerCase() });
    if (!result) return res.status(404).json({ error: 'Torrent not found' });
    res.json({ status: 'deleted', id: result._id });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete torrent' });
  }
});

module.exports = router;
