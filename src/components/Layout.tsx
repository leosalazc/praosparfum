import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';
import { CartToast } from './CartToast';
import { MobileTabBar } from './MobileTabBar';
import { SearchOverlay } from './SearchOverlay';
import { ProductDetailDrawer } from './ProductDetailDrawer';
import { useUI } from '../context/UIContext';

/** Scrolls to #hash targets after navigation, or to the top on page change. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let tries = 0;
      let timer: number;
      const tick = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Images above the target may load and shift the layout: correct once more.
          timer = window.setTimeout(() => {
            const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
            if (Math.abs(el.getBoundingClientRect().top - offset) > 40) el.scrollIntoView({ block: 'start' });
          }, 700);
        } else if (tries++ < 20) timer = window.setTimeout(tick, 50); // wait for lazy content
      };
      tick();
      return () => window.clearTimeout(timer);
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}

export function Layout({ children, minimal = false }: { children: ReactNode; minimal?: boolean }) {
  const { setSearchOpen } = useUI();
  return (
    <>
      <ScrollManager />
      <Navbar />
      <CartDrawer />
      <ProductDetailDrawer />
      <SearchOverlay />
      <main className="flex-grow">{children}</main>
      {!minimal && <Footer />}
      {/* Space for the mobile bottom bar */}
      {!minimal && <div className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" aria-hidden />}
      <CartToast />
      {!minimal && <MobileTabBar onSearch={() => setSearchOpen(true)} />}
    </>
  );
}
