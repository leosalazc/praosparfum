import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';

/** Small confirmation after adding to cart — doesn't interrupt browsing. */
export function CartToast() {
  const { toast, dismissToast, setIsCartOpen, cartCount } = useCart();
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[45] flex justify-center px-3 pointer-events-none">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
            className="pointer-events-auto w-full max-w-md bg-neutral-900 text-white rounded-xl shadow-2xl flex items-center gap-3 pl-4 pr-2 py-2"
          >
            <CheckCircle2 className="w-5 h-5 text-mustard-400 shrink-0" />
            <p className="text-sm flex-1 leading-tight">{toast.message}</p>
            <button
              onClick={() => {
                dismissToast();
                setIsCartOpen(true);
              }}
              className="shrink-0 bg-mustard-500 text-neutral-900 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg"
            >
              Ver carrito ({cartCount})
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
