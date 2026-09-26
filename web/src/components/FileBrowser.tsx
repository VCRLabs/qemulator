import { useState, useEffect, useRef } from 'react';

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface Props {
  value: string;
  onChange: (path: string) => void;
  filterExts?: string;
  placeholder?: string;
  startOpen?: boolean;
  modalOnly?: boolean;
  onClose?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileBrowser({ value, onChange, filterExts, placeholder, startOpen, modalOnly, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const loadDir = async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dir) params.set('dir', dir);
      if (filterExts) params.set('ext', filterExts);
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to list');
        setEntries([]);
        return;
      }
      const data = await res.json();
      setEntries(data);
      setCurrentDir(dir);
      setSelected('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openBrowser = () => {
    const startDir = value ? value.substring(0, value.lastIndexOf('/')) || '/' : '';
    setSelected('');
    setOpen(true);
    loadDir(startDir);
  };

  useEffect(() => {
    if (startOpen) openBrowser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateUp = () => {
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    loadDir('/' + parts.join('/'));
  };

  const handleConfirm = () => {
    if (selected) {
      onChange(selected);
    }
    setOpen(false);
    if (!selected && onClose) onClose();
  };

  const close = () => {
    setOpen(false);
    if (onClose) onClose();
  };

  // modalOnly mode: render nothing when closed, only the modal when open.
  if (modalOnly && !open) {
    return null;
  }

  // modalOnly mode: render only the modal overlay (no inline input row).
  if (modalOnly) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div ref={panelRef} className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-[500px] max-h-[70vh] flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
            <button onClick={navigateUp} disabled={!currentDir}
              className="px-2 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800">
              ↑ Up
            </button>
            <span className="text-xs text-slate-400 truncate font-mono flex-1">
              {currentDir || '/'}
            </span>
            <button onClick={close}
              className="px-2 py-1 text-sm text-slate-400 hover:text-white rounded hover:bg-slate-800">
              Cancel
            </button>
          </div>

          <div className="overflow-y-auto flex-1 min-h-[200px] max-h-[400px]">
            {loading && (
              <div className="px-4 py-8 text-xs text-slate-500 text-center">Loading...</div>
            )}
            {error && (
              <div className="px-4 py-3 text-xs text-red-400">{error}</div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div className="px-4 py-8 text-xs text-slate-500 text-center">Empty directory</div>
            )}
            {!loading && entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => {
                  if (entry.is_dir) {
                    loadDir(entry.path);
                  } else {
                    setSelected(entry.path);
                  }
                }}
                onDoubleClick={() => {
                  if (entry.is_dir) loadDir(entry.path);
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm ${
                  selected === entry.path
                    ? 'bg-emerald-900/40 text-emerald-300'
                    : entry.is_dir
                    ? 'hover:bg-slate-800 text-blue-400'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="w-5 text-center text-xs">
                  {entry.is_dir ? '📁' : '📄'}
                </span>
                <span className="flex-1 truncate">{entry.name}</span>
                {!entry.is_dir && (
                  <span className="text-xs text-slate-500">{formatSize(entry.size)}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <span className="text-xs text-slate-500 truncate max-w-[300px]">
              {selected || 'No file selected'}
            </span>
            <div className="flex gap-2">
              <button onClick={close}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={!selected}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded text-xs text-white">
                Select
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white font-mono"
          placeholder={placeholder || "/path/to/file"}
        />
        <button
          onClick={openBrowser}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300 border border-slate-600"
        >
          Browse
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-white font-mono"
          placeholder={placeholder || "/path/to/file"}
        />
        <button
          onClick={openBrowser}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300 border border-slate-600"
        >
          Browse
        </button>
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div ref={panelRef} className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-[500px] max-h-[70vh] flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
            <button onClick={navigateUp} disabled={!currentDir}
              className="px-2 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800">
              ↑ Up
            </button>
            <span className="text-xs text-slate-400 truncate font-mono flex-1">
              {currentDir || '/'}
            </span>
            <button onClick={() => setOpen(false)}
              className="px-2 py-1 text-sm text-slate-400 hover:text-white rounded hover:bg-slate-800">
              Cancel
            </button>
          </div>

          <div className="overflow-y-auto flex-1 min-h-[200px] max-h-[400px]">
            {loading && (
              <div className="px-4 py-8 text-xs text-slate-500 text-center">Loading...</div>
            )}
            {error && (
              <div className="px-4 py-3 text-xs text-red-400">{error}</div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div className="px-4 py-8 text-xs text-slate-500 text-center">Empty directory</div>
            )}
            {!loading && entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => {
                  if (entry.is_dir) {
                    loadDir(entry.path);
                  } else {
                    setSelected(entry.path);
                  }
                }}
                onDoubleClick={() => {
                  if (entry.is_dir) loadDir(entry.path);
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm ${
                  selected === entry.path
                    ? 'bg-emerald-900/40 text-emerald-300'
                    : entry.is_dir
                    ? 'hover:bg-slate-800 text-blue-400'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="w-5 text-center text-xs">
                  {entry.is_dir ? '📁' : '📄'}
                </span>
                <span className="flex-1 truncate">{entry.name}</span>
                {!entry.is_dir && (
                  <span className="text-xs text-slate-500">{formatSize(entry.size)}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <span className="text-xs text-slate-500 truncate max-w-[300px]">
              {selected || 'No file selected'}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={!selected}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded text-xs text-white">
                Select
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
