import { ShoppingBag, Menu, Search, X, Instagram } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './ui/Logo';
import { useCart } from '../context/CartContext';
import { useUI } from '../context/UIContext';

const LINKS = [
  { label: 'Catálogo', to: '/coleccion#inspiraciones' },
  { label: 'De autor', to: '/coleccion#de-autor' },
  { label: 'Castagna', to: '/#castagna', accent: true },
  { label: 'Nosotros', to: '/#nosotros' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { cartCount, setIsCartOpen } = useCart();
  const { setSearchOpen } = useUI();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => setIsMobileMenuOpen(false), [location.pathname, location.hash]);

  const solid = scrolled || isMobileMenuOpen || location.pathname !== '/';

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        solid ? 'bg-white/95 backdrop-blur-md border-b border-neutral-100' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 h-14 md:h-[72px] flex items-center justify-between">
        <div className="flex-1 flex md:hidden">
          <button
            aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMobileMenuOpen}
            className="w-10 h-10 -ml-2 flex items-center justify-center text-neutral-900"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        <nav className="hidden md:flex flex-1 gap-8 text-xs font-semibold tracking-[0.15em] uppercase text-neutral-500">
          {LINKS.map((l) => (
            <button
              key={l.label}
              onClick={() => navigate(l.to)}
              className={`hover:text-mustard-500 transition-colors uppercase tracking-[0.15em] ${l.accent ? 'text-mustard-600' : ''}`}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <Link to="/" aria-label="Práos Parfum, inicio" className="shrink-0">
          <Logo className="h-9 md:h-12 w-auto" />
        </Link>
        <div className="flex-1 flex justify-end gap-1 md:gap-6 items-center">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 text-xs font-semibold hover:text-neutral-500 transition-colors uppercase tracking-[0.15em]"
          >
            <Search className="w-4 h-4" /> Buscar
          </button>
          <button
            onClick={() => setIsCartOpen(true)}
            aria-label={`Abrir carrito (${cartCount} productos)`}
            className="relative w-10 h-10 -mr-2 flex items-center justify-center text-neutral-900"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-0.5 bg-mustard-500 text-white text-[10px] min-w-4 h-4 px-1 flex items-center justify-center rounded-full font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden bg-white border-b border-neutral-100 overflow-hidden"
          >
            <div className="px-4 py-2 flex flex-col text-base font-semibold tracking-[0.1em] uppercase text-neutral-700">
              {LINKS.map((l) => (
                <button
                  key={l.label}
                  onClick={() => navigate(l.to)}
                  className={`text-left py-3.5 border-b border-neutral-100 ${l.accent ? 'text-mustard-600' : ''}`}
                >
                  {l.label}
                </button>
              ))}
              <a
                href="https://instagram.com/praosparfum.cl"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 flex items-center gap-2 text-neutral-500"
              >
                <Instagram className="w-5 h-5" /> @praosparfum.cl
              </a>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
