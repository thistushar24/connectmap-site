const express = require('express');
const router = express.Router();
const { TorrentStore, FileStore } = require('../utils/store');

/**
 * GET /api/search?q=<query>&category=<cat>&page=<n>&limit=<n>&type=<torrent|file|all>
 * Searches both Torrent and File stores. Returns combined results with _type discriminator.
 */
router.get('/', async (req, res) => {
  try {
    const { q, category, page = 1, limit = 20, type = 'all' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const nameRegex = q && q.trim() ? { $regex: q.trim(), $options: 'i' } : null;
    const catFilter = category && category !== 'all' ? { category } : {};

    const results = [];
    let total = 0;

    // Search Torrents
    if (type === 'all' || type === 'torrent') {
      const filter = {
        ...(nameRegex ? { name: nameRegex } : {}),
        ...catFilter,
      };
      const [torrents, torrentCount] = await Promise.all([
        TorrentStore.find(filter, { skip, limit: limitNum }),
        TorrentStore.countDocuments(filter),
      ]);
      torrents.forEach((t) => results.push({ ...t, _type: 'torrent' }));
      total += torrentCount;
    }

    // Search Files
    if (type === 'all' || type === 'file') {
      const filter = {
        ...(nameRegex ? { originalName: nameRegex } : {}),
        ...catFilter,
      };
      const [files, fileCount] = await Promise.all([
        FileStore.find(filter, { skip, limit: limitNum }),
        FileStore.countDocuments(filter),
      ]);
      files.forEach((f) => results.push({ ...f, _type: 'file', name: f.originalName }));
      total += fileCount;
    }

    // Sort combined by date descending
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      results: results.slice(0, limitNum),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
