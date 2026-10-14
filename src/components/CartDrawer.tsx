import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Minus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import { formatCLP, stockOf, SHIPPING } from '../lib/catalog';
import { useLockBody } from '../hooks/useLockBody';
import { ProductImage } from './ui/ProductImage';

export function CartDrawer() {
  const { items, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, cartTotal, cartCount } = useCart();
  const { allProducts, loading, error } = useProducts();
  const navigate = useNavigate();
  const close = () => setIsCartOpen(false);
  useLockBody(isCartOpen, close);

  // Units per product across sizes, to warn about stock before checkout.
  const perProduct = new Map<string, number>();
  items.forEach((i) => perProduct.set(i.productId, (perProduct.get(i.productId) || 0) + i.quantity));
  const stockIssue = (productId: string) => {
    const p = allProducts.find((x) => x.id === productId);
    if (loading) return 'Comprobando disponibilidad';
    if (error) return 'No se pudo comprobar el catálogo';
    if (!p || p.hidden) return 'Producto no disponible';
    const s = stockOf(p);
    const want = perProduct.get(productId) || 0;
    if (s <= 0) return 'Agotado';
    if (want > s) return `Solo quedan ${s}`;
    return null;
  };
  const hasIssues = items.some((i) => stockIssue(i.productId));

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-[80]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Carrito"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-[100dvh] w-full max-w-md bg-white shadow-2xl z-[80] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 md:px-6 h-14 md:h-[72px] border-b border-neutral-100 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                <h2 className="font-display text-xl">Tu carrito {cartCount > 0 && <span className="text-neutral-400">({cartCount})</span>}</h2>
              </div>
              <button onClick={close} aria-label="Cerrar carrito" className="w-10 h-10 -mr-2 flex items-center justify-center text-neutral-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-6 py-4 flex flex-col gap-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-neutral-500 gap-4">
                  <ShoppingBag className="w-12 h-12 opacity-20" />
                  <p>Tu carrito está vacío.</p>
                  <button
                    onClick={() => {
                      close();
                      navigate('/coleccion');
                    }}
                    className="h-11 px-6 rounded-full bg-neutral-900 text-white text-sm font-semibold uppercase tracking-wider"
                  >
                    Ver catálogo
                  </button>
                </div>
              ) : (
                items.map((item) => {
                  const issue = stockIssue(item.productId);
                  return (
                    <div key={item.key} className="flex gap-3 border-b border-neutral-100 pb-4 last:border-0">
                      <div className="w-20 h-24 bg-neutral-100 rounded-md overflow-hidden shrink-0">
                        <ProductImage src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-neutral-900 leading-tight truncate">{item.name}</h3>
                            <p className="text-xs text-neutral-500 mt-0.5">
                              {item.size} · {formatCLP(item.price)} c/u
                            </p>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.key)}
                            aria-label={`Quitar ${item.name}`}
                            className="w-8 h-8 -mr-1 -mt-1 flex items-center justify-center text-neutral-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {issue && <p className="text-xs font-semibold text-red-600 mt-1">{issue}</p>}
                        <div className="flex items-center justify-between mt-auto pt-2">
                          <div className="flex items-center border border-neutral-200 rounded-full">
                            <button
                              onClick={() => updateQuantity(item.key, item.quantity - 1)}
                              aria-label="Restar uno"
                              className="w-9 h-9 flex items-center justify-center text-neutral-600"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.key, item.quantity + 1)}
                              aria-label="Sumar uno"
                              className="w-9 h-9 flex items-center justify-center text-neutral-600"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="font-semibold">{formatCLP(item.price * item.quantity)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 && (
              <div className="px-4 md:px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-neutral-100 bg-neutral-50 shrink-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-neutral-600">Subtotal</span>
                  <span className="font-display text-2xl">{formatCLP(cartTotal)}</span>
                </div>
                <p className="text-xs text-neutral-500 mb-4 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Envío {formatCLP(SHIPPING.LOCAL_COST)} Biobío · {formatCLP(SHIPPING.NATIONAL_COST)} resto de Chile · Retiro gratis
                </p>
                {hasIssues && (
                  <p className="text-xs text-red-600 mb-3">Ajusta los productos marcados en rojo para continuar.</p>
                )}
                <button
                  disabled={hasIssues}
                  onClick={() => {
                    close();
                    navigate('/checkout');
                  }}
                  className="w-full bg-neutral-900 text-white hover:bg-neutral-800 h-14 font-semibold uppercase tracking-wider rounded-full disabled:opacity-40"
                >
                  Ir a pagar
                </button>
                <button onClick={close} className="w-full text-center text-sm text-neutral-500 mt-3 py-1">
                  Seguir comprando
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
