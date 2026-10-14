import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { Product } from '../lib/catalog';

type UIContextType = {
  selectedProduct: Product | null;
  openProduct: (p: Product) => void;
  closeProduct: () => void;
  isSearchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
};

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const openProduct = useCallback((p: Product) => setSelectedProduct(p), []);
  const closeProduct = useCallback(() => setSelectedProduct(null), []);
  return (
    <UIContext.Provider value={{ selectedProduct, openProduct, closeProduct, isSearchOpen, setSearchOpen }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within a UIProvider');
  return ctx;
}
