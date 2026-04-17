"""
Flask Status Server — exposes torrent client status to the React frontend.
Provides REST API endpoints for starting downloads, checking progress,
and managing torrents.
"""

import os
import sys
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from torrent_client import TorrentClient

app = Flask(__name__)
CORS(app)

client = TorrentClient()

DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), 'downloads')
os.makedirs(DOWNLOADS_DIR, exist_ok=True)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'client': 'BitTorrent Python Client'})


@app.route('/download', methods=['POST'])
def start_download():
    """
    Start downloading a torrent.

    Body (JSON):
    {
        "torrent_path": "/path/to/file.torrent",
        "save_path": "./downloads" (optional)
    }
    """
    data = request.get_json()

    if not data or 'torrent_path' not in data:
        return jsonify({'error': 'torrent_path is required'}), 400

    torrent_path = data['torrent_path']
    save_path = data.get('save_path', DOWNLOADS_DIR)

    if not os.path.exists(torrent_path):
        return jsonify({'error': f'File not found: {torrent_path}'}), 404

    try:
        info_hash = client.add_torrent(torrent_path, save_path)
        return jsonify({
            'status': 'started',
            'info_hash': info_hash,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/status/<info_hash>', methods=['GET'])
def get_status(info_hash):
    """Get the status of a specific download."""
    status = client.get_status(info_hash)
    if not status:
        return jsonify({'error': 'Download not found'}), 404
    return jsonify(status)


@app.route('/status', methods=['GET'])
def get_all_status():
    """Get status of all downloads."""
    statuses = client.get_all_status()
    return jsonify({'downloads': statuses})


@app.route('/stop/<info_hash>', methods=['POST'])
def stop_download(info_hash):
    """Stop a download."""
    task = client.downloads.get(info_hash)
    if not task:
        return jsonify({'error': 'Download not found'}), 404
    task.stop()
    return jsonify({'status': 'stopped', 'info_hash': info_hash})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    print(f"Torrent Client API running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
