import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, Lock, LogOut, Package, Receipt, Settings } from 'lucide-react';
import { adminFetch, login, logout, setUnauthorizedHandler } from './admin/api';
import { OrdersTab } from './admin/OrdersTab';
import { ProductsTab } from './admin/ProductsTab';
import { SettingsTab } from './admin/SettingsTab';
import { Logo } from './ui/Logo';

type Tab = 'pedidos' | 'productos' | 'ajustes';

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      onLoggedIn();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6">
      <Logo className="h-12 w-auto mb-8" />
      <h1 className="text-3xl font-display mb-2">Panel de administración</h1>
      <p className="text-neutral-500 mb-6 text-sm text-center">Ingresa la contraseña de administrador.</p>
      <form onSubmit={submit} className="w-full max-w-xs space-y-3">
        <label className="relative block">
          <Lock className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            aria-label="Contraseña"
            className="w-full h-12 pl-11 pr-12 rounded-full border border-neutral-200 text-base focus:outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-neutral-400"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </label>
        {error && <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
        <button
          disabled={loading}
          className="w-full h-12 rounded-full bg-neutral-900 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Entrar
        </button>
      </form>
      <Link to="/" className="mt-6 text-sm text-neutral-500">Volver a la tienda</Link>
    </div>
  );
}

export function AdminPanel() {
  // 'checking' while validating a saved session with the server.
  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking');
  const [loggingOut, setLoggingOut] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem('admin-tab');
      return saved === 'productos' || saved === 'ajustes' ? saved : 'pedidos';
    } catch { return 'pedidos'; }
  });

  useEffect(() => {
    setUnauthorizedHandler(() => setState('out'));
    let active = true;
    adminFetch('/api/admin/session')
      .then(() => { if (active) setState('in'); })
      .catch(() => { if (active) setState('out'); });
    return () => { active = false; setUnauthorizedHandler(null); };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('admin-tab', tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  const signOut = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setState('out');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo cerrar la sesión.');
    } finally { setLoggingOut(false); }
  };

  if (state === 'checking') return <div className="p-8 text-center text-neutral-500">Cargando…</div>;
  if (state === 'out') return <LoginScreen onLoggedIn={() => setState('in')} />;

  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: 'pedidos', label: 'Pedidos', icon: Receipt },
    { id: 'productos', label: 'Productos', icon: Package },
    { id: 'ajustes', label: 'Ajustes', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 md:pb-8">
      <header className="sticky top-0 z-30 bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to="/" aria-label="Volver a la tienda" className="text-neutral-500"><ArrowLeft className="w-5 h-5" /></Link>
          <span className="font-display text-xl">Administración</span>
          <nav className="hidden md:flex gap-1 ml-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 h-9 rounded-full text-sm font-semibold flex items-center gap-2 ${tab === t.id ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </nav>
          <button onClick={signOut} disabled={loggingOut} aria-label="Cerrar sesión" className="ml-auto text-neutral-500 hover:text-red-600 flex items-center gap-1.5 text-sm disabled:opacity-50">
            <LogOut className="w-5 h-5" /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 md:py-8">
        {tab === 'pedidos' && <OrdersTab />}
        {tab === 'productos' && <ProductsTab />}
        {tab === 'ajustes' && <SettingsTab />}
      </main>

      {/* Mobile tabs */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-neutral-200 flex h-16 pb-[env(safe-area-inset-bottom)] z-30">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${tab === t.id ? 'text-neutral-900' : 'text-neutral-400'}`}
          >
            <t.icon className="w-5 h-5" /> {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
