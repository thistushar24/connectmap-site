import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// ── Backend API ─────────────────────────────────────────────

export async function searchTorrents(query, category = 'all', page = 1) {
  const params = { page, limit: 20 };
  if (query && query.trim()) params.q = query;
  if (category !== 'all') params.category = category;
  const { data } = await api.get('/search', { params });
  return data;
}

export async function listTorrents(page = 1, limit = 20) {
  const { data } = await api.get('/torrent', { params: { page, limit } });
  return data;
}

export async function listFiles(page = 1, limit = 20) {
  const { data } = await api.get('/files', { params: { page, limit } });
  return data;
}

export async function getTorrentDetails(id) {
  const { data } = await api.get(`/torrent/${id}`);
  return data;
}

export async function getMagnet(id) {
  const { data } = await api.get(`/torrent/magnet/${id}`);
  return data;
}

/**
 * Upload any file. Field name is 'file' (not 'torrent').
 * Backend will auto-detect .torrent vs regular file.
 */
export async function uploadFile(file, description = '', category = 'other', onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('description', description);
  formData.append('category', category);
  const { data } = await api.post('/upload', formData, {
    onUploadProgress: onProgress
      ? (e) => {
          if (e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        }
      : undefined,
  });
  return data;
}

// Keep legacy name as alias for backward compat
export const uploadTorrent = uploadFile;

export async function deleteTorrent(id) {
  const { data } = await api.delete(`/torrent/${id}`);
  return data;
}

export async function deleteFile(id) {
  const { data } = await api.delete(`/files/${id}`);
  return data;
}

export async function getStats() {
  const { data } = await api.get('/stats');
  return data;
}

export async function getTrackerStats() {
  const { data } = await api.get('/tracker/stats');
  return data;
}

export function getDownloadUrl(id) {
  return `${API_BASE}/upload/download/${id}`;
}

export function getFileDownloadUrl(id) {
  return `${API_BASE}/upload/download-file/${id}`;
}

// ── Python Client API ───────────────────────────────────────
// Routed through /api/client/* (backend proxies to Python port 5000 silently).
// Returns [] / null / {offline:true} when Python client is not running.

export async function startDownload(torrentPath, savePath) {
  try {
    const { data } = await api.post('/client/download', {
      torrent_path: torrentPath,
      save_path: savePath,
    });
    return data;
  } catch {
    return { offline: true, error: 'Python client not running' };
  }
}

export async function getDownloadStatus(infoHash) {
  try {
    const { data } = await api.get(`/client/status/${infoHash}`);
    return data?.offline ? null : data;
  } catch {
    return null;
  }
}

export async function getAllDownloads() {
  try {
    const { data } = await api.get('/client/status');
    if (data?.offline) return [];
    return Array.isArray(data) ? data : data?.downloads || [];
  } catch {
    return [];
  }
}

export async function stopDownload(infoHash) {
  try {
    const { data } = await api.post(`/client/stop/${infoHash}`);
    return data;
  } catch {
    return { offline: true };
  }
}

// ── Utilities ───────────────────────────────────────────────

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatETA(seconds) {
  if (!seconds || seconds < 0) return '∞';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();
}

/** Map display categories to backend enum values */
export const CATEGORY_MAP = {
  'Movies': 'video',
  'Games': 'games',
  'Software': 'software',
  'Music': 'audio',
  'Documents': 'documents',
  'Other': 'other',
};

/** Reverse map for display */
export const CATEGORY_DISPLAY = {
  video: 'Movies',
  games: 'Games',
  software: 'Software',
  audio: 'Music',
  documents: 'Documents',
  other: 'Other',
};

/** Icon map for file types based on category */
export const CATEGORY_ICONS = {
  video: 'movie',
  games: 'sports_esports',
  software: 'terminal',
  audio: 'album',
  documents: 'description',
  other: 'folder_zip',
};

/** Get icon by file extension for general files */
export function getFileExtIcon(filename) {
  if (!filename) return { icon: 'description', color: 'var(--secondary)' };
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  const map = {
    '.pdf': 'picture_as_pdf',
    '.doc': 'description', '.docx': 'description',
    '.xls': 'table_chart', '.xlsx': 'table_chart',
    '.ppt': 'slideshow', '.pptx': 'slideshow',
    '.txt': 'article', '.md': 'article',
    '.mp4': 'movie', '.mkv': 'movie', '.avi': 'movie', '.mov': 'movie',
    '.mp3': 'music_note', '.flac': 'music_note', '.wav': 'music_note',
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image', '.webp': 'image',
    '.zip': 'folder_zip', '.rar': 'folder_zip', '.7z': 'folder_zip', '.tar': 'folder_zip', '.gz': 'folder_zip',
    '.exe': 'terminal', '.bin': 'terminal', '.iso': 'album',
    '.torrent': 'cloud_download',
  };
  return { icon: map[ext] || 'insert_drive_file', color: 'var(--secondary)' };
}
