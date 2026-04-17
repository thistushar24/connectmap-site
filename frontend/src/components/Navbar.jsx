import { NavLink } from 'react-router-dom';

export default function Sidebar({ onUploadClick }) {
  const links = [
    { to: '/',          icon: 'search',       label: 'Search' },
    { to: '/dashboard', icon: 'dynamic_form', label: 'Dashboard' },
    { to: '/peers',     icon: 'hub',          label: 'Peers' },
    { to: '/video',     icon: 'video_call',   label: 'Video Call' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <h1>BIT TORRENT</h1>
        <p className="version">V2.4.0 ENGINE</p>
      </div>

      <nav className="sidebar__nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
            }
          >
            <span className="material-symbols-outlined">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__cta">
        <button onClick={onUploadClick} className="neon-glow">
          UPLOAD FILE
        </button>
      </div>

      <div className="sidebar__footer">
        <a href="#">
          <span className="material-symbols-outlined">settings</span>
          <span>Settings</span>
        </a>
        <a href="#">
          <span className="material-symbols-outlined">help</span>
          <span>Support</span>
        </a>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <span className="topbar__brand">BIT TORRENT</span>

      </div>
      <div className="topbar__right">
        <div className="topbar__icons">
          <span className="material-symbols-outlined">notifications</span>
          <span className="material-symbols-outlined">account_tree</span>
        </div>
        <button className="topbar__connect">Connect</button>
      </div>
    </header>
  );
}
