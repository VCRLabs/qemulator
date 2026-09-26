import { useEffect, useRef, useState } from 'react';

interface Props {
  vmId: string;
  status: string;
}

type Phase = 'off' | 'connecting' | 'connected' | 'error';

export default function VMConsolePreview({ vmId, status }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('off');

  useEffect(() => {
    if (status !== 'running') {
      setPhase('off');
      return;
    }

    let cancelled = false;
    let rfb: any = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const cleanupRfb = () => {
      if (rfb) {
        try {
          rfb.disconnect();
        } catch {
          /* ignore */
        }
        rfb = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };

    const scheduleRetry = () => {
      if (cancelled || attempts >= 5) return;
      attempts += 1;
      retryTimer = setTimeout(() => {
        cleanupRfb();
        void connect();
      }, 2000);
    };

    const connect = async () => {
      if (cancelled) return;
      setPhase('connecting');
      try {
        const { default: RFB } = await import('@novnc/novnc');
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        const wsUrl = `ws://${window.location.host}/api/vms/${vmId}/vnc`;
        rfb = new RFB(containerRef.current, wsUrl, {
          credentials: { password: '' },
        });
        rfb.viewOnly = true;
        rfb.scaleViewport = true;
        rfb.focusOnClick = false;

        rfb.addEventListener('connect', () => {
          if (!cancelled) setPhase('connected');
        });
        rfb.addEventListener('disconnect', () => {
          if (cancelled) return;
          setPhase('error');
          scheduleRetry();
        });
        rfb.addEventListener('error', () => {
          if (!cancelled) setPhase('error');
        });
      } catch {
        if (!cancelled) {
          setPhase('error');
          scheduleRetry();
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      cleanupRfb();
    };
  }, [vmId, status]);

  const running = status === 'running';
  const showCanvas = running && phase !== 'off';

  return (
    <div className="relative w-full h-28 bg-black overflow-hidden pointer-events-none select-none">
      <div
        ref={containerRef}
        className={`absolute inset-0 ${showCanvas ? '' : 'hidden'}`}
      />
      {!running && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span className="text-xs">
            {status === 'starting'
              ? 'Starting...'
              : status === 'stopping'
                ? 'Stopping...'
                : 'Powered off'}
          </span>
        </div>
      )}
      {running && phase !== 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <span className="text-xs text-slate-400 animate-pulse">
            {phase === 'error' ? 'Reconnecting...' : 'Connecting...'}
          </span>
        </div>
      )}
    </div>
  );
}
