import { useEffect } from 'react';
import { Route, Switch, Link, useLocation } from 'wouter';
import { useStore } from './stores/useStore';
import { createSSE } from './api/client';
import Dashboard from './components/Dashboard';
import VMCreate from './components/VMCreate';
import VMEdit from './components/VMEdit';
import VMConsole from './components/VMConsole';
import ImageLibrary from './components/ImageLibrary';

function NavBar() {
  const [location] = useLocation();

  const linkClass = (path: string) =>
    `px-3 py-1 rounded text-sm ${
      location === path ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
    }`;

  return (
    <nav className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-emerald-400">
        qemulator
      </Link>
      <div className="flex gap-4">
        <Link href="/" className={linkClass('/')}>
          VMs
        </Link>
        <Link href="/images" className={linkClass('/images')}>
          Images
        </Link>
        <Link
          href="/create"
          className="px-3 py-1 rounded text-sm bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          + New VM
        </Link>
      </div>
    </nav>
  );
}

export default function App() {
  const { fetchVMs, fetchPresets, updateVMStatus } = useStore();
  const isPopup = typeof window !== 'undefined' && !!window.opener;

  useEffect(() => {
    fetchVMs();
    fetchPresets();

    const sse = createSSE((event, data) => {
      if (event === 'vm-status') {
        updateVMStatus(data.id, data);
      }
    });

    return () => sse.close();
  }, []);

  return (
    <div className={`min-h-screen ${isPopup ? 'bg-black' : 'bg-slate-900'}`}>
      {!isPopup && <NavBar />}
      <main className={isPopup ? 'h-screen p-2' : 'max-w-7xl mx-auto p-6'}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/create" component={VMCreate} />
          <Route path="/vm/:vmId/edit" component={VMEdit} />
          <Route path="/vm/:vmId/console" component={VMConsole} />
          <Route path="/images" component={ImageLibrary} />
          <Route>
            <div className="text-center text-slate-400 py-12">
              <h2 className="text-2xl font-semibold mb-2">404</h2>
              <p>Page not found</p>
              <Link href="/" className="text-emerald-400 hover:underline mt-4 inline-block">
                Back to Dashboard
              </Link>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
