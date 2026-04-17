import { useState, useEffect } from 'react';
import { getTrackerStats } from '../services/api';
import axios from 'axios';

const VELOCITY_BARS = [40, 60, 90, 70, 85, 95, 65, 80, 100, 75];

export default function PeersPage() {
  const [trackerStats, setTrackerStats] = useState({ totalSwarms: 0, totalPeers: 0, uptime: 0 });
  const [trackerOnline, setTrackerOnline] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [logLines, setLogLines] = useState([]);
  const [velocityBars, setVelocityBars] = useState(VELOCITY_BARS);

  // Fetch tracker stats
  useEffect(() => {
    fetchTrackerStats();
    fetchApiHealth();
    const interval = setInterval(() => {
      fetchTrackerStats();
      fetchApiHealth();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Animate velocity bars
  useEffect(() => {
    const interval = setInterval(() => {
      setVelocityBars((prev) =>
        prev.map(() => Math.floor(Math.random() * 60) + 40)
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Generate log entries
  useEffect(() => {
    const initial = [
      { text: `[${time()}] ENGINE: INITIALIZING PEER DISCOVERY MODULE`, color: 'green' },
      { text: `[${time()}] DHT: BOOTSTRAPPING ROUTING TABLE`, color: null },
      { text: `[${time()}] TRACKER: CONNECTING TO ${window.location.origin}`, color: null },
    ];
    setLogLines(initial);

    const interval = setInterval(() => {
      const messages = [
        { text: `[${time()}] ENGINE: HEARTBEAT — ${trackerOnline ? 'TRACKER ONLINE' : 'AWAITING TRACKER'}`, color: trackerOnline ? 'green' : null },
        { text: `[${time()}] DHT: ROUTING TABLE ${trackerStats.totalPeers} NODES`, color: 'blue' },
        { text: `[${time()}] ENGINE: PACKET ${Math.random() > 0.5 ? 'IN' : 'OUT'} ${rndIP()}`, color: Math.random() > 0.7 ? 'green' : null },
        { text: `[${time()}] PEER: KEEPALIVE TO ${rndIP()}:${Math.floor(6000 + Math.random() * 4000)}`, color: null },
        { text: `[${time()}] SWARM: ${trackerStats.totalSwarms} ACTIVE SWARMS MONITORED`, color: 'blue' },
      ];
      const newLine = messages[Math.floor(Math.random() * messages.length)];
      setLogLines((prev) => [...prev.slice(-8), newLine]);
    }, 3000);
    return () => clearInterval(interval);
  }, [trackerOnline, trackerStats]);

  const fetchTrackerStats = async () => {
    try {
      const data = await getTrackerStats();
      if (data && !data.error) {
        setTrackerStats(data);
        setTrackerOnline(true);
      } else {
        setTrackerOnline(false);
      }
    } catch {
      setTrackerOnline(false);
    }
  };

  const fetchApiHealth = async () => {
    try {
      await axios.get('/api/health', { timeout: 3000 });
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-height))', overflow: 'hidden', display: 'grid', gridTemplateColumns: '8fr 4fr', gap: 24, padding: 0 }}>
      {/* Left: Map + Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, overflow: 'hidden' }}>
        {/* Live Mesh Map */}
        <section style={{
          height: 256, background: 'var(--surface-low)', borderRadius: 4,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Dot grid */}
          <div className="dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 20 }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 12, fontWeight: 900, letterSpacing: '0.15em', color: 'var(--primary-container)', textTransform: 'uppercase' }}>Live Mesh Map</h2>
            <p style={{ fontSize: 10, color: '#6b7280', marginTop: 4, textTransform: 'uppercase' }}>
              {trackerOnline ? 'Global Ingress / Egress Flow' : 'Waiting for tracker connection...'}
            </p>
          </div>

          {/* Simulated nodes */}
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {trackerOnline && (
              <>
                <div className="node-pulse" style={{ position: 'absolute', top: '30%', left: '20%', width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-container)' }} />
                <div style={{ position: 'absolute', top: '60%', left: '45%', width: 8, height: 8, borderRadius: '50%', background: 'var(--secondary-container)' }} />
                <div className="node-pulse" style={{ position: 'absolute', top: '40%', left: '75%', width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-container)' }} />
                <div style={{ position: 'absolute', top: '80%', left: '80%', width: 8, height: 8, borderRadius: '50%', background: 'var(--secondary-container)' }} />
                <div className="node-pulse" style={{ position: 'absolute', top: '25%', left: '55%', width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-container)' }} />
                {/* Connection lines */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '50%', height: 1, background: 'linear-gradient(to right, transparent, rgba(57, 255, 20, 0.3), transparent)', transform: 'rotate(12deg)' }} />
                  <div style={{ position: 'absolute', width: '33%', height: 1, background: 'linear-gradient(to right, transparent, rgba(80, 142, 255, 0.3), transparent)', transform: 'rotate(-45deg)' }} />
                  <div style={{ position: 'absolute', width: '40%', height: 1, background: 'linear-gradient(to right, transparent, rgba(57, 255, 20, 0.2), transparent)', transform: 'rotate(30deg)', top: '35%' }} />
                </div>
              </>
            )}
          </div>

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 16, fontSize: 10, fontWeight: 700, letterSpacing: '-0.02em' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: trackerOnline ? 'var(--primary-container)' : '#6b7280' }} />
              <span style={{ textTransform: 'uppercase' }}>Tracker: {trackerOnline ? 'Online' : 'Offline'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--secondary-container)' }} />
              <span style={{ textTransform: 'uppercase' }}>Peers: {trackerStats.totalPeers}</span>
            </div>
          </div>
        </section>

        {/* Tracker Info Table */}
        <section style={{ flex: 1, background: 'var(--surface-low)', borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(60, 75, 53, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Tracker Overview
            </h3>
            <span className={`badge ${trackerOnline ? 'badge--green' : 'badge--red'}`}>
              {trackerOnline ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>

          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div style={{ background: 'var(--surface-container)', padding: 16, borderRadius: 2 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Active Swarms</p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.05em', color: 'var(--primary-container)' }}>
                  {trackerStats.totalSwarms}
                </p>
              </div>
              <div style={{ background: 'var(--surface-container)', padding: 16, borderRadius: 2 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Connected Peers</p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.05em', color: 'var(--secondary-container)' }}>
                  {trackerStats.totalPeers}
                </p>
              </div>
              <div style={{ background: 'var(--surface-container)', padding: 16, borderRadius: 2 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Uptime</p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.05em' }}>
                  {trackerStats.uptime ? formatUptime(trackerStats.uptime) : '--'}
                </p>
              </div>
            </div>

            {/* Tracker URL */}
            <div style={{ background: 'var(--surface-container)', padding: 16, borderRadius: 2 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Tracker Endpoint</p>
              <p style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--primary-container)', wordBreak: 'break-all' }}>
                {window.location.origin}/api/tracker/announce
              </p>
            </div>

          </div>
        </section>
      </div>

      {/* Right Sidebar: Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Packet Velocity */}
        <section style={{ background: 'var(--surface-container)', borderRadius: 4, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--primary-container)', textTransform: 'uppercase' }}>Packet Velocity</h3>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6b7280' }}>monitoring</span>
          </header>
          <div style={{ height: 128, width: '100%', display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {velocityBars.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  background: `rgba(57, 255, 20, ${0.1 + (h / 100) * 0.8})`,
                  transition: 'height 0.5s ease',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700, color: '#6b7280', letterSpacing: '0.15em' }}>Swarms</span>
              <span style={{ display: 'block', fontFamily: 'var(--font-headline)', fontSize: 18, fontWeight: 900, letterSpacing: '-0.05em' }}>{trackerStats.totalSwarms}</span>
            </div>
            <div>
              <span style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700, color: '#6b7280', letterSpacing: '0.15em' }}>Peers</span>
              <span style={{ display: 'block', fontFamily: 'var(--font-headline)', fontSize: 18, fontWeight: 900, letterSpacing: '-0.05em' }}>{trackerStats.totalPeers}</span>
            </div>
          </div>
        </section>

        {/* Node Persistence */}
        <section style={{ background: 'var(--surface-container)', borderRadius: 4, padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--secondary-container)', textTransform: 'uppercase' }}>System Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Tracker Server', sub: window.location.origin, status: trackerOnline ? 'ONLINE' : 'OFFLINE', statusColor: trackerOnline ? 'var(--primary-container)' : 'var(--error)' },
              { label: 'Backend API', sub: window.location.origin, status: apiOnline ? 'ONLINE' : 'OFFLINE', statusColor: apiOnline ? 'var(--primary-container)' : 'var(--error)' },
              { label: 'Announce Interval', sub: 'Peer re-registration', status: '60s', statusColor: 'var(--secondary-container)' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#d1d5db', textTransform: 'uppercase', display: 'block' }}>{item.label}</span>
                  <span style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' }}>{item.sub}</span>
                </div>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: item.statusColor }}>{item.status}</span>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 16, borderTop: '1px solid rgba(60, 75, 53, 0.15)' }}>
            <button
              onClick={fetchTrackerStats}
              style={{
                width: '100%', padding: 8, background: 'var(--surface-highest)',
                color: '#d1d5db', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#d1d5db'}
            >
              Refresh Status
            </button>
          </div>
        </section>

        {/* Terminal Log */}
        <section className="terminal" style={{ flex: 1 }}>
          <div className="terminal__dots">
            <div className="terminal__dot" />
            <div className="terminal__dot" />
            <div className="terminal__dot" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {logLines.map((line, i) => (
              <p key={i} className={line.color === 'green' ? 'terminal__line--green' : line.color === 'blue' ? 'terminal__line--blue' : ''}>
                {line.text}
              </p>
            ))}
            <p className="animate-pulse" style={{ color: 'var(--primary-container)' }}>_</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function time() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function rndIP() {
  return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

function formatUptime(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
