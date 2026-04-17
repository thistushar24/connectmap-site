import { useState, useEffect, useRef, useCallback } from 'react';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const SIGNAL_URL = import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin; // P2P signaling server

function genCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

export default function VideoCallPage() {
  // Connection state
  const [phase, setPhase] = useState('lobby'); // lobby | room
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [peerStatus, setPeerStatus] = useState('waiting'); // waiting | connecting | connected | disconnected
  const [statusMsg, setStatusMsg] = useState('');

  // Media controls
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [inCall, setInCall] = useState(false);

  // Refs
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pendingCandidates = useRef([]);

  // ── Cleanup ──────────────────────────────────────────────
  const hangUp = useCallback(() => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPeerStatus('disconnected');
    setInCall(false);
    setStatusMsg('Call ended');
  }, []);

  // ── Start camera ─────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch {
      setStatusMsg('⚠ Camera / mic access denied');
      return null;
    }
  }, []);

  // ── Create RTCPeerConnection ─────────────────────────────
  const createPC = useCallback((targetId, stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add all local tracks BEFORE creating offer/answer
    if (stream) {
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    }

    // Receive remote stream
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', roomCode, e.candidate, targetId);
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setPeerStatus('connected');
        setInCall(true);
        setStatusMsg('🟢 Secure P2P Connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setPeerStatus('disconnected');
        setStatusMsg('Peer disconnected');
        setInCall(false);
      }
    };

    return pc;
  }, [roomCode]);

  // ── Socket.IO setup ──────────────────────────────────────
  useEffect(() => {
    if (phase !== 'room') return;

    // Dynamically load socket.io client
    const scriptId = 'socketio-script';
    const loadSocket = () => {
      return new Promise((resolve) => {
        if (window.io) { resolve(window.io); return; }
        if (document.getElementById(scriptId)) {
          const check = setInterval(() => {
            if (window.io) { clearInterval(check); resolve(window.io); }
          }, 100);
          return;
        }
        const s = document.createElement('script');
        s.id = scriptId;
        s.src = `${SIGNAL_URL}/socket.io/socket.io.js`;
        s.onload = () => resolve(window.io);
        s.onerror = () => setStatusMsg('⚠ Cannot reach signaling server');
        document.head.appendChild(s);
      });
    };

    let sock;
    loadSocket().then((io) => {
      if (!io) return;
      sock = io(SIGNAL_URL, { transports: ['websocket', 'polling'] });
      socketRef.current = sock;

      sock.on('connect', () => {
        sock.emit('join-room', roomCode, 'video');
      });

      sock.on('connect_error', () => {
        setStatusMsg('⚠ Cannot connect to signaling server');
      });

      // HOST: room created — wait for guest
      sock.on('room-created', () => {
        setStatusMsg('Room created. Waiting for peer...');
        setPeerStatus('waiting');
      });

      // GUEST: joined — wait for offer from host
      sock.on('room-joined', () => {
        setStatusMsg('Joined room. Connecting...');
        setPeerStatus('connecting');
      });

      // HOST: guest joined — acquire camera then send offer
      sock.on('guest-joined', async (guestId) => {
        setPeerStatus('connecting');
        setStatusMsg('Peer connected — acquiring camera...');
        const stream = localStreamRef.current || (await startCamera());
        if (!stream) return;
        const pc = createPC(guestId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sock.emit('offer', roomCode, offer, guestId);
        setStatusMsg('Offer sent — establishing connection...');
      });

      // GUEST: receive offer — acquire camera then answer
      sock.on('offer', async (sdp, hostId) => {
        setPeerStatus('connecting');
        setStatusMsg('Receiving offer — acquiring camera...');
        const stream = localStreamRef.current || (await startCamera());
        if (!stream) return;
        const pc = createPC(hostId, stream);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        // Flush buffered candidates
        for (const c of pendingCandidates.current) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidates.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sock.emit('answer', roomCode, answer, hostId);
        setStatusMsg('Answer sent...');
      });

      // HOST: receive answer
      sock.on('answer', async (sdp) => {
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
          for (const c of pendingCandidates.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingCandidates.current = [];
        }
      });

      // ICE candidates
      sock.on('ice-candidate', async (candidate) => {
        if (pcRef.current && pcRef.current.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } else {
          pendingCandidates.current.push(candidate);
        }
      });

      // Peer disconnected
      sock.on('peer-disconnected', () => {
        setPeerStatus('disconnected');
        setStatusMsg('Peer disconnected');
        setInCall(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      });
    });

    return () => {
      if (sock) sock.disconnect();
      socketRef.current = null;
    };
  }, [phase, roomCode, isHost, startCamera, createPC]);

  // ── Start camera preview on entering room ────────────────
  useEffect(() => {
    if (phase === 'room') {
      startCamera();
    }
    return () => {
      if (phase !== 'room') {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
        }
      }
    };
  }, [phase, startCamera]);

  // ── Mic toggle ───────────────────────────────────────────
  const toggleMic = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setMicMuted((m) => !m);
  };

  // ── Camera toggle ─────────────────────────────────────────
  const toggleCam = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setCamOff((c) => !c);
  };

  // ── Enter room ───────────────────────────────────────────
  const createRoom = () => {
    const code = genCode();
    setRoomCode(code);
    setIsHost(true);
    setPhase('room');
    setStatusMsg('Creating room...');
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) return;
    setRoomCode(code);
    setIsHost(false);
    setPhase('room');
    setStatusMsg('Joining room...');
  };

  const leaveRoom = () => {
    hangUp();
    if (socketRef.current) socketRef.current.disconnect();
    socketRef.current = null;
    setPhase('lobby');
    setRoomCode('');
    setJoinCode('');
    setPeerStatus('waiting');
    setStatusMsg('');
    setMicMuted(false);
    setCamOff(false);
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--on-surface)' }}>
            P2P Video Call
          </h2>
          <p style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 4 }}>
            End-to-end encrypted · WebRTC · No server recording
          </p>
        </div>
        {phase === 'room' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: peerStatus === 'connected' ? 'var(--primary-container)' : peerStatus === 'connecting' ? '#f59e0b' : '#6b7280',
                boxShadow: peerStatus === 'connected' ? '0 0 8px var(--primary-container)' : 'none',
              }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: peerStatus === 'connected' ? 'var(--primary-container)' : '#9ca3af' }}>
                {peerStatus === 'connected' ? 'Connected' : peerStatus === 'connecting' ? 'Connecting...' : peerStatus === 'disconnected' ? 'Disconnected' : 'Waiting for peer'}
              </span>
            </div>
            <div style={{ padding: '4px 12px', background: 'var(--surface-highest)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace', color: 'var(--primary-container)' }}>
              #{roomCode}
            </div>
          </div>
        )}
      </div>

      {/* ── LOBBY ── */}
      {phase === 'lobby' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 480, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Info card */}
            <div style={{ background: 'var(--surface-low)', padding: 24, borderLeft: '4px solid var(--primary-container)', borderRadius: 4 }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--primary-container)', marginBottom: 8 }}>
                How it works
              </h3>
              <ul style={{ fontSize: 12, color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 0, listStyle: 'none' }}>
                {['Create a room and share the 6-letter code', 'Your peer enters the code to join', 'WebRTC establishes a direct encrypted connection', 'No video passes through our servers'].map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--primary-container)', fontWeight: 900 }}>{i + 1}.</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Create */}
            <button
              className="btn-primary neon-glow"
              style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '16px 32px' }}
              onClick={createRoom}
            >
              <span className="material-symbols-outlined">add_video</span>
              Create Video Room
            </button>

            <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.15em' }}>— or join with a code —</div>

            {/* Join */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                maxLength={6}
                placeholder="ENTER 6-LETTER CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                style={{
                  flex: 1, padding: '14px 20px',
                  background: 'var(--surface-low)',
                  border: '1px solid rgba(60,75,53,0.3)',
                  outline: 'none',
                  fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
                  letterSpacing: '0.3em', textAlign: 'center',
                  color: 'var(--on-surface)', borderRadius: 4,
                }}
              />
              <button
                className="btn-secondary"
                style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}
                onClick={joinRoom}
                disabled={joinCode.trim().length !== 6}
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ROOM ── */}
      {phase === 'room' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status bar */}
          {statusMsg && (
            <div style={{ padding: '8px 16px', background: 'var(--surface-low)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', borderLeft: '2px solid var(--primary-container)' }}>
              {statusMsg}
            </div>
          )}

          {/* Video grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 400 }}>
            {/* Local */}
            <div style={{ position: 'relative', background: '#0a0a0a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(57,255,20,0.2)' }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }}
              />
              {camOff && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#6b7280' }}>videocam_off</span>
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 12, left: 12, padding: '4px 10px', background: 'rgba(0,0,0,0.7)', borderRadius: 4, fontSize: 10, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                YOU {micMuted && '🔇'}
              </div>
            </div>

            {/* Remote */}
            <div style={{ position: 'relative', background: '#0a0a0a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(60,75,53,0.2)' }}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {peerStatus !== 'connected' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', gap: 12 }}>
                  <span className="material-symbols-outlined animate-pulse" style={{ fontSize: 48, color: '#6b7280' }}>
                    {peerStatus === 'waiting' ? 'person_search' : 'connecting_airports'}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    {peerStatus === 'waiting' ? 'Waiting for peer...' : peerStatus === 'connecting' ? 'Connecting...' : 'Peer disconnected'}
                  </span>
                  {peerStatus === 'waiting' && (
                    <div style={{ padding: '8px 20px', background: 'var(--surface-highest)', fontFamily: 'monospace', fontSize: 20, fontWeight: 900, letterSpacing: '0.3em', color: 'var(--primary-container)' }}>
                      {roomCode}
                    </div>
                  )}
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 12, left: 12, padding: '4px 10px', background: 'rgba(0,0,0,0.7)', borderRadius: 4, fontSize: 10, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                PEER
              </div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px', background: 'var(--surface-low)', borderRadius: 8 }}>
            {/* Mic toggle */}
            <button
              onClick={toggleMic}
              title={micMuted ? 'Unmute' : 'Mute'}
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: micMuted ? 'rgba(255,180,171,0.15)' : 'var(--surface-container)',
                border: `2px solid ${micMuted ? 'var(--error)' : 'rgba(60,75,53,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: micMuted ? 'var(--error)' : 'var(--on-surface)',
                transition: 'all 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                {micMuted ? 'mic_off' : 'mic'}
              </span>
            </button>

            {/* Cam toggle */}
            <button
              onClick={toggleCam}
              title={camOff ? 'Turn on camera' : 'Turn off camera'}
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: camOff ? 'rgba(255,180,171,0.15)' : 'var(--surface-container)',
                border: `2px solid ${camOff ? 'var(--error)' : 'rgba(60,75,53,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: camOff ? 'var(--error)' : 'var(--on-surface)',
                transition: 'all 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                {camOff ? 'videocam_off' : 'videocam'}
              </span>
            </button>

            {/* Room code display */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Share this code</p>
              <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, letterSpacing: '0.3em', color: 'var(--primary-container)' }}>{roomCode}</div>
            </div>

            {/* End call */}
            <button
              onClick={leaveRoom}
              title="End call and leave room"
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'var(--error-container)',
                border: '2px solid var(--error)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--error)',
                transition: 'all 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>call_end</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
