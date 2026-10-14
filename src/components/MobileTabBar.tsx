import { Home, LayoutGrid, Search, ShoppingBag } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatCLP } from '../lib/catalog';

/** Bottom navigation for phones: everything reachable with the thumb. */
export function MobileTabBar({ onSearch }: { onSearch: () => void }) {
  const { cartCount, cartTotal, setIsCartOpen } = useCart();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const tab = 'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider';
  const active = (on: boolean) => (on ? 'text-neutral-900' : 'text-neutral-400');

  return (
    <nav
      aria-label="Navegación inferior"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-neutral-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-16">
        <button className={`${tab} ${active(pathname === '/')}`} onClick={() => navigate('/')}>
          <Home className="w-5 h-5" />
          Inicio
        </button>
        <button className={`${tab} ${active(pathname === '/coleccion')}`} onClick={() => navigate('/coleccion')}>
          <LayoutGrid className="w-5 h-5" />
          Catálogo
        </button>
        <button className={`${tab} text-neutral-400`} onClick={onSearch}>
          <Search className="w-5 h-5" />
          Buscar
        </button>
        <button
          className={`${tab} ${cartCount ? 'text-neutral-900' : 'text-neutral-400'} relative`}
          onClick={() => setIsCartOpen(true)}
        >
          <span className="relative">
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-mustard-500 text-white text-[10px] min-w-4 h-4 px-1 flex items-center justify-center rounded-full font-bold">
                {cartCount}
              </span>
            )}
          </span>
          {cartCount ? formatCLP(cartTotal) : 'Carrito'}
        </button>
      </div>
    </nav>
  );
}
