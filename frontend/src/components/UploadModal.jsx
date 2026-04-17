import { useState, useRef } from 'react';
import { uploadFile, CATEGORY_MAP } from '../services/api';

export default function UploadModal({ isOpen, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setFile(null);
    setDescription('');
    setCategory('other');
    setError('');
    setSuccess('');
    setProgress(0);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    setProgress(0);
    try {
      const result = await uploadFile(file, description, category, setProgress);
      const label = result.name || file.name;
      setSuccess(`Uploaded "${label}" successfully!`);
      setTimeout(() => {
        resetForm();
        onClose();
        if (onUploaded) onUploaded(result);
      }, 1200);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Upload failed';
      if (msg.includes('already exists')) {
        setError('This torrent already exists in the database');
      } else {
        setError(msg);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError('');
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isTorrent = file && file.name.endsWith('.torrent');

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h4 className="modal-panel__title">Upload File</h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File Drop Zone */}
          <div>
            <label className="modal__label">Select Any File</label>
            <div
              className={`drop-zone ${dragOver ? 'drop-zone--active' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--primary-container)', marginBottom: 8, display: 'block' }}>
                {file ? (isTorrent ? 'cloud_download' : 'insert_drive_file') : 'upload_file'}
              </span>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: file ? 'var(--primary-container)' : '#6b7280' }}>
                {file ? file.name : 'Drop any file here or click to browse'}
              </p>
              {file && (
                <p style={{ fontSize: 9, color: '#6b7280', marginTop: 4, textTransform: 'uppercase' }}>
                  {isTorrent ? '🧲 Will be indexed as torrent' : '📄 Will be stored as general file'} · {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="*/*"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setError(''); } }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="modal__label">Description (Optional)</label>
            <input
              className="modal__input"
              type="text"
              placeholder="Brief description of this file..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category */}
          <div>
            <label className="modal__label">Category</label>
            <select
              className="modal__input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ cursor: 'pointer' }}
            >
              <option value="other">Other</option>
              <option value="video">Movies / Video</option>
              <option value="games">Games</option>
              <option value="software">Software</option>
              <option value="audio">Music / Audio</option>
              <option value="documents">Documents</option>
            </select>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Uploading...</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary-container)' }}>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar__fill" style={{ width: `${progress}%`, transition: 'width 0.2s ease' }} />
              </div>
            </div>
          )}

          {/* Status Messages */}
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(255,180,171,0.1)', color: 'var(--error)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '8px 12px', background: 'rgba(57,255,20,0.1)', color: 'var(--primary-container)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {success}
            </div>
          )}

          {/* Actions */}
          <div className="modal__actions">
            <button
              className="btn-primary neon-glow"
              style={{ flex: 1 }}
              onClick={handleSubmit}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
            <button className="btn-secondary" onClick={handleClose} disabled={uploading}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
