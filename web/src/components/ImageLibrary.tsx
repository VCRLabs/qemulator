import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '../stores/useStore';
import { api } from '../api/client';

export default function ImageLibrary() {
  const [, navigate] = useLocation();
  const { images, fetchImages } = useStore();
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState('2G');
  const [creating, setCreating] = useState(false);
  const [linkPath, setLinkPath] = useState('');
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchImages();
  }, []);

  const handleCreateBlank = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createBlankImage(newName.trim(), 'qcow2', newSize);
      setNewName('');
      fetchImages();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLink = async () => {
    if (!linkPath.trim()) return;
    setLinking(true);
    try {
      const name = linkPath.split('/').pop() || 'linked';
      await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', name, path: linkPath.trim() }),
      });
      setLinkPath('');
      fetchImages();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLinking(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (confirm(`Delete image "${name}"?`)) {
      await api.deleteImage(name);
      fetchImages();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm">
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-white">Image Library</h2>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded p-4 mb-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">Create Blank Image</h3>
        <div className="flex gap-2">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="name.qcow2"
            className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white" />
          <input type="text" value={newSize} onChange={(e) => setNewSize(e.target.value)}
            placeholder="2G"
            className="w-24 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white" />
          <button onClick={handleCreateBlank} disabled={creating || !newName.trim()}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm text-white">
            Create
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded p-4 mb-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">Link External Image</h3>
        <div className="flex gap-2">
          <input type="text" value={linkPath} onChange={(e) => setLinkPath(e.target.value)}
            placeholder="/path/to/image.qcow2"
            className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white font-mono" />
          <button onClick={handleLink} disabled={linking || !linkPath.trim()}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-sm text-white">
            Link
          </button>
        </div>
      </div>

      {images.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No images yet</p>
      ) : (
        <div className="space-y-2">
          {images.map((img) => (
            <div key={img.name} className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-white font-medium">{img.name}</div>
                <div className="text-xs text-slate-400">
                  {formatSize(img.size)} · {img.managed ? 'managed' : 'linked'}
                </div>
              </div>
              <button onClick={() => handleDelete(img.name)}
                className="px-3 py-1 bg-red-900 hover:bg-red-800 rounded text-xs text-red-200">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
