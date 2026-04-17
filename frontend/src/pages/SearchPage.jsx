import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchTorrents, listTorrents, listFiles, formatBytes, getDownloadUrl, getFileDownloadUrl, getFileExtIcon, CATEGORY_ICONS } from '../services/api';

const CATEGORIES = [
  { label: 'Movies', value: 'video', icon: 'movie' },
  { label: 'Games', value: 'games', icon: 'sports_esports' },
  { label: 'Software', value: 'software', icon: 'terminal' },
  { label: 'Music', value: 'audio', icon: 'album' },
  { label: 'Documents', value: 'documents', icon: 'description' },
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [activeCategory, setActiveCategory] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const navigate = useNavigate();

  // Load recent on mount
  useEffect(() => { loadRecent(); }, []);

  const loadRecent = async () => {
    setLoading(true);
    try {
      // Load torrents and files, combine
      const [tData, fData] = await Promise.all([
        listTorrents(1, 10),
        listFiles(1, 10),
      ]);
      const combined = [
        ...(tData.results || []).map((t) => ({ ...t, _type: 'torrent' })),
        ...(fData.results || []).map((f) => ({ ...f, _type: 'file', name: f.originalName })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setResults(combined);
      setTotalCount((tData.total || 0) + (fData.total || 0));
      setTotalPages(1);
      setSearched(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (searchQuery = query, cat = activeCategory, p = 1) => {
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchTorrents(searchQuery, cat || 'all', p);
      setResults(data.results || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };

  const handleCategoryClick = (catValue) => {
    const newCat = activeCategory === catValue ? null : catValue;
    setActiveCategory(newCat);
    handleSearch(query, newCat, 1);
  };

  const handleDownload = (e, item) => {
    e.stopPropagation();
    setDownloadingId(item._id);
    const url = item._type === 'file' ? getFileDownloadUrl(item._id) : getDownloadUrl(item._id);
    window.open(url, '_blank');
    setTimeout(() => setDownloadingId(null), 2000);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      handleSearch(query, activeCategory, newPage);
    }
  };

  const getItemIcon = (item) => {
    if (item._type === 'file') {
      return getFileExtIcon(item.originalName || item.name).icon;
    }
    return CATEGORY_ICONS[item.category] || 'folder_zip';
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)',
        width: 384, height: 384, background: 'rgba(57, 255, 20, 0.05)',
        borderRadius: '50%', filter: 'blur(120px)', pointerEvents: 'none',
      }} />

      {/* Hero Search */}
      <div style={{ marginBottom: 64, marginTop: 32, textAlign: 'center', position: 'relative' }}>
        <h2 style={{
          fontFamily: 'var(--font-headline)', fontSize: '3rem', fontWeight: 900,
          letterSpacing: '-0.05em', marginBottom: 32,
          background: 'linear-gradient(to right, var(--on-surface), var(--primary-container))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          SCAN THE NETWORK
        </h2>

        <div style={{ position: 'relative', maxWidth: 768, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'var(--surface-container)',
            border: '1px solid rgba(60, 75, 53, 0.3)',
            borderRadius: 4, padding: 8,
          }}
          className="neon-glow"
          >
            <span className="material-symbols-outlined" style={{ marginLeft: 16, color: 'var(--primary-container)' }}>search</span>
            <input
              id="search-input"
              type="text"
              placeholder="SEARCH FILES & TORRENTS BY NAME..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1, padding: '12px 16px',
                fontFamily: 'var(--font-headline)', fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--on-surface)',
              }}
            />
            <button className="btn-primary" style={{ borderRadius: 2, padding: '12px 32px' }} onClick={() => handleSearch()}>
              SEARCH
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#6b7280', textTransform: 'uppercase' }}>
            {totalCount > 0 ? `${totalCount} items indexed` : 'Browse the network'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        {/* Filter Sidebar */}
        <aside style={{ width: 256, flexShrink: 0, position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Categories */}
          <div style={{ background: 'var(--surface-low)', padding: 24, borderLeft: '2px solid rgba(57, 255, 20, 0.2)' }}>
            <h3 className="section-title--green" style={{ fontSize: 12, fontFamily: 'var(--font-headline)', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>
              Categories
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.value;
                return (
                  <label key={cat.value} className="filter-check" onClick={() => handleCategoryClick(cat.value)}>
                    <div className={`filter-check__box ${isActive ? 'filter-check__box--checked' : ''}`}>
                      {isActive && <div className="filter-check__inner" />}
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: isActive ? 'var(--primary-container)' : '#6b7280' }}>{cat.icon}</span>
                    <span className="filter-check__label" style={{ color: isActive ? 'var(--primary-container)' : '#9ca3af' }}>{cat.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Show All */}
          <button
            onClick={() => { setActiveCategory(null); setQuery(''); loadRecent(); }}
            style={{
              padding: '12px', background: 'var(--surface-low)',
              borderLeft: '2px solid rgba(60, 75, 53, 0.3)',
              fontSize: 10, fontWeight: 700, color: '#9ca3af',
              textTransform: 'uppercase', letterSpacing: '0.15em',
              textAlign: 'left', transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary-container)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; }}
          >
            ← Show All Files
          </button>
        </aside>

        {/* Results */}
        <div style={{ flex: 1 }}>
          {searched && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    {query ? 'Search Results' : 'Recent Files & Torrents'}
                  </h3>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 8px', background: 'var(--surface-highest)', color: '#9ca3af' }}>
                    {totalCount.toLocaleString()} FOUND
                  </span>
                </div>
              </div>

              {/* Table Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '6fr 2fr 2fr 2fr',
                padding: '12px 24px', fontSize: 10, fontWeight: 900,
                textTransform: 'uppercase', letterSpacing: '0.15em',
                color: '#6b7280', borderBottom: '1px solid rgba(60, 75, 53, 0.1)',
                background: 'rgba(28, 27, 27, 0.5)',
              }}>
                <div>Resource Name</div>
                <div style={{ textAlign: 'right' }}>Size</div>
                <div style={{ textAlign: 'right' }}>Type</div>
                <div style={{ textAlign: 'right' }}>Action</div>
              </div>

              {/* Results List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {loading ? (
                  <div style={{ padding: 48, textAlign: 'center', color: '#6b7280', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    <span className="material-symbols-outlined animate-pulse" style={{ fontSize: 32, color: 'var(--primary-container)', display: 'block', marginBottom: 8 }}>radar</span>
                    Scanning network...
                  </div>
                ) : results.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: '#6b7280', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    No files found. Upload one to get started!
                  </div>
                ) : (
                  results.map((item) => (
                    <div
                      key={item._id}
                      style={{
                        display: 'grid', gridTemplateColumns: '6fr 2fr 2fr 2fr',
                        padding: '16px 24px', alignItems: 'center',
                        background: 'var(--surface-low)',
                        borderLeft: '2px solid transparent',
                        cursor: item._type === 'torrent' ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => item._type === 'torrent' && navigate(`/torrent/${item._id}`)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-container)';
                        e.currentTarget.style.borderLeftColor = 'var(--primary-container)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--surface-low)';
                        e.currentTarget.style.borderLeftColor = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--surface-highest)', color: item._type === 'file' ? 'var(--secondary)' : 'var(--primary-container)',
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            {getItemIcon(item)}
                          </span>
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <p style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                          <p style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', letterSpacing: '-0.02em', textTransform: 'uppercase', marginTop: 2 }}>
                            {item._type === 'torrent' ? `Hash: ${item.infoHash?.substring(0, 8)}...` : `Uploaded · ${item.mimetype || 'unknown type'}`}
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>
                        {formatBytes(item.totalSize || item.size || 0)}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          padding: '2px 8px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                          background: item._type === 'torrent' ? 'rgba(57,255,20,0.1)' : 'rgba(80,142,255,0.1)',
                          color: item._type === 'torrent' ? 'var(--primary-container)' : 'var(--secondary-container)',
                        }}>
                          {item._type === 'torrent' ? '🧲 Torrent' : '📄 File'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button
                          style={{ padding: 8, color: downloadingId === item._id ? '#022100' : 'var(--primary-container)', background: downloadingId === item._id ? 'var(--primary-container)' : 'transparent', transition: 'all 0.15s ease' }}
                          onClick={(e) => handleDownload(e, item)}
                          onMouseEnter={(e) => { if (downloadingId !== item._id) { e.currentTarget.style.background = 'var(--primary-container)'; e.currentTarget.style.color = '#022100'; } }}
                          onMouseLeave={(e) => { if (downloadingId !== item._id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--primary-container)'; } }}
                        >
                          <span className="material-symbols-outlined">
                            {downloadingId === item._id ? 'check' : 'download'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                  <button className="btn-ghost" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>← Prev</button>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', padding: '8px 16px', background: 'var(--surface-highest)' }}>
                    Page {page} of {totalPages}
                  </span>
                  <button className="btn-ghost" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}>Next →</button>
                </div>
              )}
            </>
          )}

          {/* Network Stats Footer */}
          <div style={{ marginTop: 64, background: 'var(--surface-low)', padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 32 }}>
              <div>
                <h4 style={{ fontFamily: 'var(--font-headline)', fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8 }}>
                  BITTORRENT NETWORK
                </h4>
                <p style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.15em', maxWidth: 384 }}>
                  Upload any file to share across the network. Torrent files are parsed and indexed automatically.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 48 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Indexed</p>
                  <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.875rem', fontWeight: 900, color: 'var(--primary-container)', letterSpacing: '-0.05em' }}>{totalCount}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 10, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Health</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary-container)', boxShadow: '0 0 8px #39FF14' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-container)', textTransform: 'uppercase' }}>Online</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
