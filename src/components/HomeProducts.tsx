import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useUI } from '../context/UIContext';
import { isAvailable } from '../lib/catalog';
import { ProductCard, ProductCardSkeleton } from './ui/ProductCard';

/** "Disponibles ahora" — puts products on the home page so phones see them right away. */
export function HomeProducts() {
  const { products, loading, error, refresh } = useProducts();
  const { openProduct } = useUI();
  const list = useMemo(
    () => products.filter((p) => p.type !== 'AUTOR' && isAvailable(p)).slice(0, 8),
    [products]
  );

  return (
    <section className="py-10 md:py-20 container mx-auto px-4 md:px-6">
      <div className="flex items-end justify-between mb-4 md:mb-8">
        <div>
          <h2 className="text-3xl md:text-5xl leading-none">Disponibles ahora</h2>
          <p className="text-neutral-500 text-sm mt-1">Inspiraciones 60ml · listas para despacho</p>
        </div>
        <Link to="/coleccion#inspiraciones" className="hidden sm:flex items-center gap-1 text-sm font-semibold text-mustard-600">
          Ver todo <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      {error && <div role="alert" className="my-4 text-sm text-red-700">No se pudo cargar el catálogo. <button className="underline" onClick={() => refresh()}>Reintentar</button></div>}
      {!loading && !error && !list.length && <p className="text-sm text-neutral-500 my-4">No hay inspiraciones disponibles por ahora.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        {loading && !list.length
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : list.map((p) => <ProductCard key={p.id} product={p} onOpen={openProduct} />)}
      </div>
      <Link
        to="/coleccion#inspiraciones"
        className="mt-6 flex sm:inline-flex sm:mx-auto items-center justify-center gap-2 h-12 px-8 rounded-full border border-neutral-900 text-sm font-semibold uppercase tracking-wider"
      >
        Ver catálogo completo <ArrowRight className="w-4 h-4" />
      </Link>
    </section>
  );
}
