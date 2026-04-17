import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTorrentDetails, getMagnet, formatBytes, formatDate, getDownloadUrl } from '../services/api';

const CATEGORY_ICONS = {
  video: 'movie',
  games: 'sports_esports',
  software: 'terminal',
  audio: 'album',
  documents: 'description',
  other: 'folder_zip',
};

function getFileIcon(name) {
  if (!name) return { icon: 'description', color: 'var(--secondary)' };
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
  const icons = {
    '.md': 'description',
    '.txt': 'description',
    '.pdf': 'picture_as_pdf',
    '.bin': 'terminal',
    '.exe': 'terminal',
    '.iso': 'album',
    '.mp4': 'movie',
    '.mkv': 'movie',
    '.avi': 'movie',
    '.mp3': 'music_note',
    '.flac': 'music_note',
    '.zip': 'folder_zip',
    '.rar': 'folder_zip',
    '.tar': 'folder_zip',
    '.gz': 'folder_zip',
    '.7z': 'folder_zip',
    '.jpg': 'image',
    '.png': 'image',
    '.asc': 'check_circle',
  };
  return {
    icon: icons[ext] || 'description',
    color: ext === '.asc' ? 'var(--primary-container)' : 'var(--secondary)',
  };
}

export default function TorrentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [torrent, setTorrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getTorrentDetails(id)
        .then((data) => {
          setTorrent(data);
          setLoading(false);
        })
        .catch((err) => {
          setError('Torrent not found');
          setLoading(false);
        });
    }
  }, [id]);

  const handleDownload = () => {
    const url = getDownloadUrl(id);
    window.open(url, '_blank');
  };

  const handleShareMagnet = async () => {
    try {
      const data = await getMagnet(id);
      await navigator.clipboard.writeText(data.magnet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: use the magnet from torrent data
      if (torrent?.magnet) {
        await navigator.clipboard.writeText(torrent.magnet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <span className="material-symbols-outlined animate-pulse" style={{ fontSize: 48, color: 'var(--primary-container)', display: 'block', marginBottom: 16 }}>dns</span>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#6b7280' }}>Loading torrent data...</p>
        </div>
      </div>
    );
  }

  if (error || !torrent) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--error)', display: 'block', marginBottom: 16 }}>error</span>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--error)', marginBottom: 16 }}>{error || 'Torrent not found'}</p>
          <button className="btn-secondary" onClick={() => navigate('/')}>← Back to Search</button>
        </div>
      </div>
    );
  }

  const seedPercent = (torrent.seeders || 0) + (torrent.leechers || 0) > 0
    ? ((torrent.seeders || 0) / ((torrent.seeders || 0) + (torrent.leechers || 0))) * 100
    : 50;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', transition: 'color 0.15s ease' }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary-container)'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Back to Search
      </button>

      {/* Hero Section */}
      <section style={{
        position: 'relative', overflow: 'hidden', borderRadius: 4,
        background: 'var(--surface-low)', padding: '40px',
        borderLeft: '4px solid var(--primary-container)',
      }}>
        {/* Background icon */}
        <div style={{ position: 'absolute', top: 0, right: 16, opacity: 0.1 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 144 }}>
            {CATEGORY_ICONS[torrent.category] || 'folder_zip'}
          </span>
        </div>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span className="badge badge--green">{torrent.category?.toUpperCase() || 'OTHER'}</span>
            <span style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {formatDate(torrent.createdAt)}
            </span>
          </div>
          <h2 style={{
            fontFamily: 'var(--font-headline)', fontSize: '2.5rem', fontWeight: 800,
            letterSpacing: '-0.05em', marginBottom: 16, wordBreak: 'break-word',
          }}>
            {torrent.name}
          </h2>
          {torrent.description && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16, maxWidth: 600 }}>{torrent.description}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <button className="btn-primary neon-glow" onClick={handleDownload}>
              <span className="material-symbols-outlined">download</span>
              Download .torrent
            </button>
            <button className="btn-secondary" onClick={handleShareMagnet}>
              <span className="material-symbols-outlined">{copied ? 'check' : 'share'}</span>
              {copied ? 'Copied!' : 'Copy Magnet'}
            </button>
          </div>
        </div>
      </section>

      {/* Bento Grid: Metadata + Swarm */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* System Metadata */}
        <div className="glass-panel" style={{ padding: 24, borderRadius: 4, border: '1px solid rgba(60, 75, 53, 0.1)' }}>
          <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--primary-container)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-container)' }} />
            SYSTEM METADATA
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Total Size</p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {formatBytes(torrent.totalSize)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Piece Count</p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {torrent.pieceCount?.toLocaleString()} <span style={{ fontSize: 10, color: '#9ca3af' }}>@ {formatBytes(torrent.pieceLength)}</span>
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Date Encoded</p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {formatDate(torrent.createdAt)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Health</p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.25rem', fontWeight: 700, color: torrent.health > 50 ? 'var(--primary-container)' : 'var(--error)' }}>
                {torrent.health || 0}%
              </p>
            </div>
          </div>
          {/* Info Hash */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(60, 75, 53, 0.1)' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Info Hash (SHA-1)</p>
            <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--secondary)', background: 'var(--surface-container)', padding: 12, borderRadius: 2, wordBreak: 'break-all', letterSpacing: '0.05em' }}>
              {torrent.infoHash}
            </p>
          </div>
          {/* Magnet URI */}
          {torrent.magnet && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Magnet URI</p>
              <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#6b7280', background: 'var(--surface-container)', padding: 12, borderRadius: 2, wordBreak: 'break-all', overflow: 'hidden', maxHeight: 60 }}>
                {torrent.magnet}
              </p>
            </div>
          )}
        </div>

        {/* Swarm Dynamics */}
        <div className="glass-panel" style={{ padding: 24, borderRadius: 4, border: '1px solid rgba(60, 75, 53, 0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--secondary)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)' }} />
              SWARM DYNAMICS
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.875rem', fontWeight: 900, letterSpacing: '-0.05em' }}>
                    {(torrent.seeders || 0).toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-container)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Seeders</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.875rem', fontWeight: 900, letterSpacing: '-0.05em' }}>
                    {torrent.leechers || 0}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Leechers</p>
                </div>
              </div>
              {/* Seeder bar */}
              <div style={{ height: 8, background: 'var(--surface-highest)', borderRadius: 9999, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${seedPercent}%`, background: 'var(--primary-container)' }}>
                  <div style={{ position: 'absolute', right: 0, top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.5)' }} />
                </div>
              </div>
            </div>
          </div>
          {/* Tracker Info */}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--surface-container)', borderRadius: 2 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Tracker</p>
            <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--primary-container)', wordBreak: 'break-all' }}>
              {torrent.trackerUrl || 'No tracker'}
            </p>
          </div>
        </div>
      </div>

      {/* File Structure */}
      <div className="glass-panel" style={{ borderRadius: 4, border: '1px solid rgba(60, 75, 53, 0.1)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--surface-container)', padding: '16px 24px', borderBottom: '1px solid rgba(60, 75, 53, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 className="section-title" style={{ fontSize: 12 }}>Package Structure</h3>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            {torrent.files?.length || 0} Files Total
          </span>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
          {torrent.files?.length > 0 ? torrent.files.map((file, i) => {
            const { icon, color } = getFileIcon(file.path);
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                  transition: 'background 0.15s ease',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ color, fontSize: 20 }}>{icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
                <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', flexShrink: 0 }}>
                  {file.size ? formatBytes(file.size) : '--'}
                </span>
              </div>
            );
          }) : (
            <p style={{ fontSize: 12, color: '#6b7280', padding: 16 }}>No file information available</p>
          )}
        </div>
      </div>
    </div>
  );
}
