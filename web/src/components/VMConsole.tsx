import { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { api } from '../api/client';
import { VMConfig, MediaDeviceInfo, VMStatusInfo } from '../types';
import { useStore } from '../stores/useStore';
import MediaControl from './MediaControl';
import VncToolbar from './VncToolbar';

export default function VMConsole() {
  const [, params] = useRoute('/vm/:vmId/console');
  const vmId = params?.vmId || '';
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [rfb, setRfb] = useState<any>(null);
  const [status, setStatus] = useState<string>('connecting');
  const [vm, setVm] = useState<VMConfig | null>(null);
  const [vmStatus, setVmStatus] = useState<VMStatusInfo | null>(null);
  const [media, setMedia] = useState<MediaDeviceInfo[]>([]);
  const [powerBusy, setPowerBusy] = useState(false);
  const [vncEpoch, setVncEpoch] = useState(0);
  const { fetchVMs } = useStore();
  const isPopup = typeof window !== 'undefined' && !!window.opener;

  const handleOpenConsole = () => {
    // Match the popup chrome (toolbar + page padding) so the content area
    // fits the VNC framebuffer exactly on open.
    let width = 1280;
    let height = 800;

    const fbWidth = rfb?._display?.width || rfb?._fbWidth;
    const fbHeight = rfb?._display?.height || rfb?._fbHeight;
    const container = containerRef.current;

    if (fbWidth && fbHeight && container) {
      const toolbar = container.previousElementSibling as HTMLElement | null;
      const overheadH = (toolbar?.offsetHeight || 40) + 4 + 16; // mb-1 + main p-2
      const overheadW = 16; // main p-2
      width = fbWidth + overheadW;
      height = fbHeight + overheadH;
    }

    window.open(
      `/vm/${vmId}/console`,
      `console-${vmId}`,
      `popup=yes,width=${width},height=${height}`
    );
  };

  const refreshMedia = async () => {
    try {
      const devs = await api.getVMMedia(vmId);
      setMedia(devs);
    } catch (e) {
      setMedia([]);
    }
  };

  const refreshStatus = async () => {
    try {
      const statusInfo = await api.getVMStatus(vmId);
      setVmStatus(statusInfo);
      fetchVMs();
      return statusInfo;
    } catch {
      return null;
    }
  };

  const handleStart = async () => {
    setPowerBusy(true);
    try {
      await api.startVM(vmId);
      setStatus('connecting');
      await refreshStatus();
      setVncEpoch((n) => n + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setPowerBusy(false);
    }
  };

  const handleStop = async () => {
    setPowerBusy(true);
    try {
      await api.stopVM(vmId);
      setStatus('stopped');
      await refreshStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setPowerBusy(false);
    }
  };

  const handleRestart = async () => {
    setPowerBusy(true);
    try {
      await api.restartVM(vmId);
      setStatus('connecting');
      await refreshStatus();
      setVncEpoch((n) => n + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setPowerBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let rfb: any = null;

    const connect = async () => {
      try {
        if (!vm) {
          const vmData = await api.getVM(vmId);
          if (cancelled) return;
          setVm(vmData);
        }

        const statusInfo = await api.getVMStatus(vmId);
        if (cancelled) return;
        setVmStatus(statusInfo);

        if (vncEpoch === 0) {
          await refreshMedia();
        }

        if (statusInfo.status !== 'running') {
          setStatus('stopped');
          return;
        }

        setStatus('loading_vnc');

        const { default: RFB } = await import('@novnc/novnc');

        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';

        const wsUrl = `ws://${window.location.host}/api/vms/${vmId}/vnc`;
        rfb = new RFB(containerRef.current, wsUrl, {
          credentials: { password: '' },
        });
        setRfb(rfb);

        rfb.addEventListener('connect', () => {
          if (!cancelled) setStatus('connected');
        });
        rfb.addEventListener('disconnect', () => {
          if (!cancelled) setStatus('disconnected');
        });
        rfb.addEventListener('error', () => {
          if (!cancelled) setStatus('error');
        });
      } catch (err: any) {
        if (!cancelled) {
          setStatus('error');
          console.error('VNC connect error:', err);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      setRfb(null);
      if (rfb) rfb.disconnect();
    };
  }, [vmId, vncEpoch]);

  const statusColors: Record<string, string> = {
    connecting: 'text-yellow-400',
    loading_vnc: 'text-yellow-400',
    connected: 'text-emerald-400',
    stopped: 'text-slate-400',
    disconnected: 'text-slate-400',
    error: 'text-red-400',
  };

  const statusLabel: Record<string, string> = {
    connecting: 'Connecting...',
    loading_vnc: 'Loading VNC...',
    connected: 'Connected',
    stopped: 'Stopped',
    disconnected: 'Disconnected',
    error: 'Error',
  };

  if (isPopup) {
    return (
      <div className="flex flex-col h-full">
        <VncToolbar rfb={rfb} containerRef={containerRef} />
        <div
          ref={containerRef}
          className={`flex-1 overflow-hidden ${
            status === 'stopped' ? 'hidden' : ''
          }`}
        />
        {status === 'stopped' && (
          <div className="flex-1 flex items-center justify-center bg-slate-900 rounded border border-slate-700">
            <p className="text-slate-400">VM is stopped.</p>
          </div>
        )}
        {(status === 'error' || status === 'disconnected') && (
          <div className="flex-1 flex items-center justify-center bg-slate-900 rounded border border-slate-700">
            <p className="text-slate-400">
              {statusLabel[status]} — refresh or start the VM from the main window.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Main console area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm">
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-white">{vm?.name || vmId}</h2>
          <span className={`text-xs ${statusColors[status] || 'text-slate-400'}`}>
            ● {statusLabel[status] || status}
          </span>
          <div className="ml-auto">
            <button
              onClick={handleOpenConsole}
              title="Open console in a separate window"
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open console
            </button>
          </div>
        </div>

        <VncToolbar rfb={rfb} containerRef={containerRef} />

        <div
          ref={containerRef}
          className={`flex-1 bg-black rounded overflow-hidden ${
            status === 'stopped' ? 'hidden' : ''
          }`}
          style={{ minHeight: '400px' }}
        />

        {status === 'stopped' && (
          <div className="flex-1 flex items-center justify-center bg-slate-900 rounded border border-slate-700">
            <div className="text-center">
              <div className="text-4xl mb-3">🖥️</div>
              <p className="text-slate-400">VM is stopped. Start it to see the display.</p>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* VM Power Controls */}
        <div className="bg-slate-800 border border-slate-700 rounded p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Controls</h3>
          <div className="flex gap-2">
            {(vmStatus?.status === 'stopped' || vmStatus?.status === 'error') && (
              <button
                onClick={handleStart}
                disabled={powerBusy}
                className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded text-xs text-white"
              >
                {powerBusy ? '...' : 'Start'}
              </button>
            )}
            {vmStatus?.status === 'running' && (
              <>
                <button
                  onClick={handleStop}
                  disabled={powerBusy}
                  className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-40 rounded text-xs text-white"
                >
                  {powerBusy ? '...' : 'Stop'}
                </button>
                <button
                  onClick={handleRestart}
                  disabled={powerBusy}
                  className="flex-1 px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 rounded text-xs text-white"
                >
                  {powerBusy ? '...' : 'Restart'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Removable media controls */}
        {media.length > 0 && (
          <MediaControl
            vmId={vmId}
            devices={media}
            onRefresh={refreshMedia}
          />
        )}

        {/* VM Info */}
        {vm && (
          <div className="bg-slate-800 border border-slate-700 rounded p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">VM Info</h3>
            <div className="text-xs text-slate-400 space-y-1">
              <div>CPU: {vm.system.cpu}</div>
              <div>RAM: {vm.system.ram} MB</div>
              <div>VGA: {vm.display.vga}</div>
              <div>NIC: {vm.network.model}</div>
              <div>Disk: {vm.storage.disk_size || 'set'}</div>
              {vm.preset && <div>Preset: {vm.preset}</div>}
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
