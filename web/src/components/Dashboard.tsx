import { Link } from 'wouter';
import { useStore } from '../stores/useStore';
import VMCard from './VMCard';

export default function Dashboard() {
  const { vms, loading, error } = useStore();

  if (loading) {
    return <div className="text-center text-slate-400 py-12">Loading...</div>;
  }

  return (
    <div>
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-3 mb-4 text-red-200 text-sm">
          {error}
        </div>
      )}

      {vms.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🖥️</div>
          <h2 className="text-2xl font-semibold mb-2 text-slate-200">No VMs yet</h2>
          <p className="text-slate-400 mb-6">Create your first virtual machine to get started</p>
          <Link
            href="/create"
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-medium inline-block"
          >
            Create VM
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vms.map((vm) => (
            <VMCard key={vm.id} vm={vm} />
          ))}
        </div>
      )}
    </div>
  );
}
