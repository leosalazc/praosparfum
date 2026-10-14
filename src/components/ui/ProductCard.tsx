import { Plus } from 'lucide-react';
import { Product, getVariants, isAvailable, priceLabel, sizesLabel } from '../../lib/catalog';
import { useCart } from '../../context/CartContext';
import { ProductImage } from './ProductImage';
import { localImage } from '../../lib/productImage';

/**
 * Compact product card designed for a 2-column grid on phones.
 * The add button is always visible (no hover-only controls on touch screens).
 */
export function ProductCard({ product: p, onOpen }: { product: Product; onOpen: (p: Product) => void }) {
  const { addToCart } = useCart();
  const available = isAvailable(p);
  const variants = getVariants(p);
  const isInspiration = p.type !== 'AUTOR';

  const quickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (variants.length > 1) onOpen(p); // let the customer pick the size
    else addToCart(p, variants[0]);
  };

  return (
    <article
      onClick={() => onOpen(p)}
      className={`group flex flex-col cursor-pointer bg-white rounded-lg overflow-hidden border border-neutral-100 hover:border-neutral-200 hover:shadow-md transition-all ${
        available ? '' : 'opacity-60'
      }`}
    >
      <div className="relative aspect-[4/5] bg-neutral-50 overflow-hidden">
        <ProductImage
          src={p.image}
          fallback={localImage(p.id)}
          alt={p.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <span
          className={`absolute top-2 left-2 text-[9px] sm:text-[10px] px-2 py-0.5 font-semibold tracking-wider uppercase rounded-sm ${
            p.type === 'AUTOR' ? 'bg-neutral-900 text-mustard-400' : 'bg-white/90 text-neutral-700'
          }`}
        >
          {p.type === 'AUTOR' ? 'De autor' : p.type === 'NICHO' ? 'Nicho' : 'Diseñador'}
        </span>
        {!available && (
          <span className="absolute inset-x-0 bottom-0 bg-neutral-900/80 text-white text-[10px] py-1 text-center font-semibold tracking-widest uppercase">
            Agotado
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-2.5 sm:p-4">
        {isInspiration && p.brand && (
          <p className="text-[10px] sm:text-xs text-neutral-400 leading-tight truncate">Inspirado en {p.brand}</p>
        )}
        <h3 className="font-sans normal-case tracking-normal text-sm sm:text-base font-semibold text-neutral-900 leading-snug mt-0.5 line-clamp-2 min-h-[2.5em]">
          {p.name}
        </h3>
        <div className="flex items-end justify-between gap-1 mt-auto pt-2">
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-bold text-neutral-900 leading-none">{priceLabel(p)}</p>
            <p className="text-[10px] sm:text-xs text-neutral-400 mt-1">{sizesLabel(p)}</p>
          </div>
          {available && (
            <button
              onClick={quickAdd}
              aria-label={`Agregar ${p.name} al carrito`}
              className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-mustard-500 active:scale-90 transition-all"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-lg overflow-hidden border border-neutral-100 animate-pulse">
      <div className="aspect-[4/5] bg-neutral-100" />
      <div className="p-3 space-y-2">
        <div className="h-2 bg-neutral-100 rounded w-2/3" />
        <div className="h-3 bg-neutral-100 rounded" />
        <div className="h-3 bg-neutral-100 rounded w-1/3" />
      </div>
    </div>
  );
}
