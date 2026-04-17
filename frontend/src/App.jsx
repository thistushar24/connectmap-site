import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar, { TopBar } from './components/Navbar';
import UploadModal from './components/UploadModal';
import SearchPage from './pages/SearchPage';
import TorrentDetails from './pages/TorrentDetails';
import Dashboard from './pages/Dashboard';
import PeersPage from './pages/PeersPage';
import VideoCallPage from './pages/VideoCallPage';

export default function App() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);

  const handleUploaded = () => {
    // Force re-render of pages to show new data
    setUploadKey((k) => k + 1);
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar onUploadClick={() => setUploadOpen(true)} />
        <div className="app-main">
          <TopBar />
          <div className="app-content">
            <Routes>
              <Route path="/" element={<SearchPage key={uploadKey} />} />
              <Route path="/torrent/:id" element={<TorrentDetails />} />
              <Route path="/dashboard" element={<Dashboard key={uploadKey} />} />
              <Route path="/peers" element={<PeersPage />} />
              <Route path="/video" element={<VideoCallPage />} />
            </Routes>
          </div>
        </div>
        <UploadModal
          isOpen={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
        />
        {/* Ambient glows */}
        <div className="ambient-glow ambient-glow--green" />
        <div className="ambient-glow ambient-glow--blue" />
      </div>
    </BrowserRouter>
  );
}
