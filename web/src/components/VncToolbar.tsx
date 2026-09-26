import { useEffect, useState, RefObject } from 'react';

interface VncToolbarProps {
  rfb: any;
  containerRef: RefObject<HTMLDivElement>;
}

export default function VncToolbar({ rfb, containerRef }: VncToolbarProps) {
  const [scale, setScale] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canResizeWindow = typeof window !== 'undefined' && !!window.opener;

  useEffect(() => {
    setScale(false);
  }, [rfb]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const fitWindowToVnc = () => {
    const container = containerRef.current;
    if (!container || !rfb) return false;

    const fbWidth = rfb._display?.width || rfb._fbWidth;
    const fbHeight = rfb._display?.height || rfb._fbHeight;
    if (!fbWidth || !fbHeight) return false;

    const overheadW = window.innerWidth - container.clientWidth;
    const overheadH = window.innerHeight - container.clientHeight;
    const chromeW = window.outerWidth - window.innerWidth;
    const chromeH = window.outerHeight - window.innerHeight;

    try {
      window.resizeTo(fbWidth + overheadW + chromeW, fbHeight + overheadH + chromeH);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  // One-shot auto-fit when the popup console connects
  useEffect(() => {
    if (!rfb || !canResizeWindow) return;

    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tryFit = () => {
      if (done) return;
      if (fitWindowToVnc()) {
        done = true;
        return;
      }
      attempts++;
      if (attempts < 20) {
        timer = setTimeout(tryFit, 100);
      }
    };

    const onConnect = () => {
      attempts = 0;
      tryFit();
    };
    rfb.addEventListener('connect', onConnect);

    // In case connect already fired before this effect ran
    if (rfb._rfbConnectionState === 'connected') tryFit();

    return () => {
      done = true;
      if (timer) clearTimeout(timer);
      rfb.removeEventListener('connect', onConnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfb, canResizeWindow]);

  if (!rfb) return null;

  const btn =
    'px-2 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed';
  const btnActive =
    'px-2 py-1 rounded text-xs bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white';

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  };

  const toggleScale = () => {
    const next = !rfb.scaleViewport;
    rfb.scaleViewport = next;
    setScale(next);
  };

  return (
    <div className="flex items-center gap-2 flex-shrink-0 mb-1 px-2 py-1.5 bg-slate-800 rounded">
      <button className={btn} onClick={() => rfb.sendCtrlAltDel()}>
        Ctrl+Alt+Del
      </button>
      <div className="w-px h-4 bg-slate-600" />
      <button className={scale ? btnActive : btn} onClick={toggleScale}>
        Scale
      </button>
      <button className={btn} onClick={toggleFullscreen}>
        {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      </button>
      {canResizeWindow && (
        <button
          className={btn}
          onClick={fitWindowToVnc}
          title="Resize this window to match the VNC resolution"
        >
          Fit window
        </button>
      )}
    </div>
  );
}
