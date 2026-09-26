import { useState } from 'react';
import { api } from '../api/client';
import { MediaDeviceInfo } from '../types';
import FileBrowser from './FileBrowser';

interface Props {
  vmId: string;
  devices: MediaDeviceInfo[];
  onRefresh: () => void;
}

const KIND_LABEL: Record<string, string> = {
  cdrom: 'CD-ROM',
  floppy: 'Floppy',
};

function basename(path: string): string {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export default function MediaControl({ vmId, devices, onRefresh }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<{ kind: 'cdrom' | 'floppy'; currentFile: string } | null>(null);

  if (devices.length === 0) return null;

  const refresh = async () => {
    try {
      await onRefresh();
    } catch {}
  };

  const swap = async (kind: 'cdrom' | 'floppy', filename: string) => {
    if (!filename) return;
    setBusy(kind);
    setError('');
    try {
      const media: any = {};
      media[kind] = filename;
      await api.updateVMMedia(vmId, media);
      await refresh();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const eject = async (kind: 'cdrom' | 'floppy') => {
    setBusy(kind);
    setError('');
    try {
      await api.ejectVMMedia(vmId, kind);
      await refresh();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">Removable Media</h3>
      {error && (
        <div className="text-xs text-red-400 mb-2 break-words">{error}</div>
      )}
      <div className="space-y-3">
        {devices.map((dev) => {
          const kind = dev.kind as 'cdrom' | 'floppy';
          const label = KIND_LABEL[dev.kind] || dev.kind;
          const isBusy = busy === dev.kind;
          return (
            <div key={dev.kind + dev.device} className="border border-slate-700 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-300">
                  {dev.kind === 'cdrom' ? '💿' : '💾'} {label}
                </span>
                {dev.present ? (
                  <span className="text-[10px] text-emerald-400">inserted</span>
                ) : (
                  <span className="text-[10px] text-slate-500">empty</span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 font-mono truncate mb-2" title={dev.file}>
                {dev.present ? basename(dev.file) || dev.file : <span className="text-slate-600">— none —</span>}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setPicker({ kind, currentFile: dev.file })}
                  disabled={isBusy}
                  className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded text-[11px] text-white"
                >
                  {isBusy ? '...' : dev.present ? 'Swap' : 'Insert'}
                </button>
                <button
                  onClick={() => eject(kind)}
                  disabled={isBusy || !dev.present}
                  className="px-2 py-1 bg-slate-700 hover:bg-red-700 disabled:opacity-40 rounded text-[11px] text-white"
                >
                  Eject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {picker && (
        <FileBrowser
          value={picker.currentFile}
          startOpen
          modalOnly
          onClose={() => setPicker(null)}
          onChange={(path) => {
            const kind = picker.kind;
            setPicker(null);
            swap(kind, path);
          }}
          filterExts={picker.kind === 'cdrom' ? 'iso,img,qcow2,bin,cue' : 'img,ima,vfd,qcow2,bin'}
          placeholder="/path/to/image"
        />
      )}
    </div>
  );
}
