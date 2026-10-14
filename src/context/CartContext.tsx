import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { Product, Variant, formatCLP, getVariants, stockOf } from '../lib/catalog';
import { useProducts } from './ProductContext';

export type CartItem = {
  key: string; // productId|size
  productId: string;
  name: string;
  brand?: string;
  type: string;
  size: string;
  price: number;
  image?: string;
  quantity: number;
};

type Toast = { id: number; message: string } | null;

type CartContextType = {
  items: CartItem[];
  addToCart: (product: Product, variant: Variant, quantity?: number) => void;
  removeFromCart: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  cartTotal: number;
  cartCount: number;
  toast: Toast;
  dismissToast: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = 'praos-cart-v2';
const MAX_QTY = 20;

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.key === 'string' && typeof i.productId === 'string' &&
      typeof i.size === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= MAX_QTY &&
      Number.isFinite(i.price) && i.price > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Persisted so the cart survives the round-trip to Webpay and page reloads.
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const { allProducts, loading, error } = useProducts();

  // Keep cart prices/images in sync with the live catalog (e.g. after a price change).
  useEffect(() => {
    if (loading || error) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.flatMap((it) => {
        const p = allProducts.find((x) => x.id === it.productId);
        if (!p || p.hidden) {
          changed = true;
          return [];
        }
        const v = getVariants(p).find((x) => x.size === it.size);
        if (!v) {
          changed = true;
          return [];
        }
        if (v.price !== it.price || p.image !== it.image || p.name !== it.name) {
          changed = true;
          return [{ ...it, price: v.price, image: p.image, name: p.name }];
        }
        return [it];
      });
      return changed ? next : prev;
    });
  }, [allProducts, loading, error]);

  useEffect(() => {
    try {
      // Don't persist inline (base64) images: they are big and come from the catalog anyway.
      const slim = items.map((i) => (i.image?.startsWith('data:') ? { ...i, image: undefined } : i));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      /* private mode / storage full */
    }
  }, [items]);

  // Keep several tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && setItems(loadCart());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const addToCart = (product: Product, variant: Variant, quantity = 1) => {
    const live = allProducts.find((p) => p.id === product.id && !p.hidden);
    const currentVariant = live && getVariants(live).find((v) => v.size === variant.size);
    if (!live || !currentVariant || !Number.isInteger(quantity) || quantity < 1 || loading || error) return;
    product = live;
    variant = currentVariant;
    const inCart = items.filter((it) => it.productId === product.id).reduce((sum, it) => sum + it.quantity, 0);
    quantity = Math.min(quantity, Math.max(0, stockOf(product) - inCart));
    if (!quantity) {
      showToast('Ya tienes todas las unidades disponibles en el carrito.');
      return;
    }
    const key = `${product.id}|${variant.size}`;
    setItems((prev) => {
      const count = prev.filter((it) => it.productId === product.id).reduce((sum, it) => sum + it.quantity, 0);
      const allowed = Math.min(quantity, Math.max(0, stockOf(product) - count));
      if (!allowed) return prev;
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, price: variant.price, quantity: Math.min(MAX_QTY, item.quantity + allowed) } : item
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name: product.name,
          brand: product.brand,
          type: product.type,
          size: variant.size,
          price: variant.price,
          image: product.image,
          quantity: Math.min(MAX_QTY, allowed),
        },
      ];
    });
    showToast(`${product.name} ${variant.size} · ${formatCLP(variant.price)} agregado`);
  };

  const removeFromCart = (key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const updateQuantity = (key: string, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      removeFromCart(key);
      return;
    }
    setItems((prev) => prev.map((item) => {
      if (item.key !== key) return item;
      const product = allProducts.find((p) => p.id === item.productId && !p.hidden);
      const other = prev.filter((it) => it.productId === item.productId && it.key !== key).reduce((sum, it) => sum + it.quantity, 0);
      const available = product ? Math.max(0, stockOf(product) - other) : 0;
      return available ? { ...item, quantity: Math.min(MAX_QTY, quantity, available) } : item;
    }));
  };

  const clearCart = useCallback(() => setItems([]), []);

  const cartTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const cartCount = items.reduce((count, item) => count + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        cartTotal,
        cartCount,
        toast,
        dismissToast: () => setToast(null),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
