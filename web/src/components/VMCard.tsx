import { Link } from 'wouter';
import { VMWithStatus } from '../types';
import { api } from '../api/client';
import { useStore } from '../stores/useStore';
import VMConsolePreview from './VMConsolePreview';

interface Props {
  vm: VMWithStatus;
}

const statusColors: Record<string, string> = {
  running: 'bg-emerald-500',
  stopped: 'bg-slate-500',
  starting: 'bg-yellow-500',
  stopping: 'bg-yellow-500',
  error: 'bg-red-500',
};

const statusLabels: Record<string, string> = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting...',
  stopping: 'Stopping...',
  error: 'Error',
};

export default function VMCard({ vm }: Props) {
  const { fetchVMs } = useStore();
  const status = vm.status?.status || 'stopped';
  const hasPendingChanges = vm.config_generation > vm.running_generation;

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.startVM(vm.id);
      fetchVMs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.stopVM(vm.id);
      fetchVMs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.restartVM(vm.id);
      fetchVMs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${vm.name}"?`)) {
      await api.deleteVM(vm.id);
      fetchVMs();
    }
  };

  return (
    <div
      className={`bg-slate-800 border rounded-lg p-4 cursor-pointer hover:border-slate-500 transition-colors ${
        status === 'running' ? 'border-emerald-700' : 'border-slate-700'
      }`}
    >
      <Link href={status === 'running' ? `/vm/${vm.id}/console` : '#'}>
        <div className="flex gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-semibold text-white truncate">{vm.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                <span className="text-xs text-slate-400">{statusLabels[status]}</span>
              </div>
            </div>
            {vm.preset && (
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded inline-block mb-3">
                {vm.preset}
              </span>
            )}
            <div className="text-xs text-slate-400 space-y-1">
              <div>CPU: {vm.system.cpu} | RAM: {vm.system.ram} MB</div>
              <div>VGA: {vm.display.vga} | NIC: {vm.network.model}</div>
              <div>Disk: {vm.storage.disk_size || 'unconfigured'} {vm.storage.disk_format}</div>
            </div>
          </div>
          <div className="w-44 flex-shrink-0">
            <VMConsolePreview vmId={vm.id} status={status} />
          </div>
        </div>
      </Link>

      {hasPendingChanges && (
        <div className="text-xs text-amber-400 mb-3 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
          Changes pending restart
        </div>
      )}

      {vm.status?.error && (
        <div className="text-xs text-red-400 mb-3 truncate">{vm.status.error}</div>
      )}

      <div className="flex gap-2">
        {status === 'running' ? (
          <>
            <Link
              href={`/vm/${vm.id}/console`}
              className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs text-white text-center"
            >
              Console
            </Link>
            <button
              onClick={handleRestart}
              className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded text-xs text-white"
            >
              Restart
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white"
            >
              Stop
            </button>
          </>
        ) : (
          <button
            onClick={handleStart}
            className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs text-white"
          >
            Start
          </button>
        )}
        <Link
          href={`/vm/${vm.id}/edit`}
          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white text-center"
        >
          Edit
        </Link>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 bg-red-900 hover:bg-red-800 rounded text-xs text-red-200"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
