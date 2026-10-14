import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Product } from '../lib/catalog';
import { resolveImage } from '../lib/productImage';

export type { Product } from '../lib/catalog';

interface ProductContextType {
  products: Product[];
  /** Public catalog only. Hidden products are fetched separately by the admin. */
  allProducts: Product[];
  loading: boolean;
  error: string;
  refresh: (fresh?: boolean) => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);
const sortByName = (a: Product, b: Product) => a.name.localeCompare(b.name, 'es');

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async (fresh = true) => {
    if (!fresh && activeRequest.current && !activeRequest.current.signal.aborted) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const res = await fetch('/api/products', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('No se pudo actualizar el catálogo. Intenta nuevamente.');
      const list: Product[] = await res.json();
      if (!Array.isArray(list)) throw new Error('El catálogo recibido no es válido.');
      if (controller.signal.aborted) return;
      setProducts(list.filter((p) => !p.hidden).map((p) => ({ ...p, image: resolveImage(p.id, p.image) })).sort(sortByName));
      setError('');
    } catch (e) {
      if (controller.signal.aborted) return;
      // Never offer bundled or stale inventory after an authoritative failure.
      setProducts([]);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(false); };
    const interval = window.setInterval(onVisible, 5000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(interval);
      activeRequest.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  return <ProductContext.Provider value={{ products, allProducts: products, loading, error, refresh }}>{children}</ProductContext.Provider>;
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (context === undefined) throw new Error('useProducts must be used within a ProductProvider');
  return context;
}
