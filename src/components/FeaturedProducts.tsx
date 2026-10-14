import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useUI } from '../context/UIContext';
import { Gender, Product, genderOf, isAvailable, minPrice } from '../lib/catalog';
import { ProductCard, ProductCardSkeleton } from './ui/ProductCard';

const PAGE = 12;
type Sort = 'destacados' | 'precio-asc' | 'precio-desc' | 'nombre';

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 h-9 px-4 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${
        active ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
      }`}
    >
      {children}
    </button>
  );
}

export function FeaturedProducts() {
  const { products, loading, error, refresh } = useProducts();
  const { openProduct } = useUI();

  const [query, setQuery] = useState('');
  const [gender, setGender] = useState<Gender | 'TODOS'>('TODOS');
  const [type, setType] = useState<'TODOS' | 'DISEÑADOR' | 'NICHO'>('TODOS');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [brand, setBrand] = useState('TODAS');
  const [sort, setSort] = useState<Sort>('destacados');
  const [showMore, setShowMore] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const autor = useMemo(() => products.filter((p) => p.type === 'AUTOR'), [products]);
  const inspiraciones = useMemo(() => products.filter((p) => p.type !== 'AUTOR'), [products]);
  const brands = useMemo(
    () => Array.from(new Set(inspiraciones.map((p) => p.brand).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [inspiraciones]
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = inspiraciones.filter((p) => {
      if (gender !== 'TODOS' && genderOf(p) !== gender) return false;
      if (type !== 'TODOS' && p.type !== type) return false;
      if (brand !== 'TODAS' && p.brand !== brand) return false;
      if (onlyAvailable && !isAvailable(p)) return false;
      if (q && !normalize(`${p.name} ${p.brand || ''}`).includes(q)) return false;
      return true;
    });
    const byAvail = (a: Product, b: Product) => Number(isAvailable(b)) - Number(isAvailable(a));
    const sorters: Record<Sort, (a: Product, b: Product) => number> = {
      destacados: (a, b) => byAvail(a, b) || a.name.localeCompare(b.name, 'es'),
      'precio-asc': (a, b) => byAvail(a, b) || minPrice(a) - minPrice(b),
      'precio-desc': (a, b) => byAvail(a, b) || minPrice(b) - minPrice(a),
      nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    };
    return list.sort(sorters[sort]);
  }, [inspiraciones, gender, type, brand, onlyAvailable, query, sort]);

  useEffect(() => setVisible(PAGE), [gender, type, brand, onlyAvailable, query, sort]);

  // Infinite scroll: load the next page when the sentinel gets close.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setVisible((v) => v + PAGE), {
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const activeExtra = (brand !== 'TODAS' ? 1 : 0) + (sort !== 'destacados' ? 1 : 0);
  const clearAll = () => {
    setQuery('');
    setGender('TODOS');
    setType('TODOS');
    setBrand('TODAS');
    setOnlyAvailable(false);
    setSort('destacados');
  };

  return (
    <section className="pt-20 md:pt-28 pb-12 md:pb-24">
      {error && <div role="alert" className="container mx-auto px-4 mb-6 text-sm text-red-700">No se pudo cargar el catálogo. <button className="underline" onClick={() => refresh()}>Reintentar</button></div>}
      {/* ---- De autor ---- */}
      <div id="de-autor" className="scroll-mt-20 container mx-auto px-4 md:px-6 mb-10 md:mb-16">
        <h2 className="text-4xl md:text-6xl leading-none">Perfumería de autor</h2>
        <p className="text-neutral-500 text-sm md:text-lg mt-2 mb-5">Creaciones propias con el sello de Práos Parfum.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          {loading && !autor.length
            ? Array.from({ length: 2 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : autor.map((p) => <ProductCard key={p.id} product={p} onOpen={openProduct} />)}
        </div>
      </div>

      {/* ---- Inspiraciones ---- */}
      <div id="inspiraciones" className="scroll-mt-20 container mx-auto px-4 md:px-6">
        <h2 className="text-4xl md:text-6xl leading-none">Inspiraciones</h2>
        <p className="text-neutral-500 text-sm md:text-lg mt-2">
          Inspiradas en la mejor perfumería de diseñador y nicho · 60ml.
        </p>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-14 md:top-[72px] z-30 bg-white/95 backdrop-blur-md border-b border-neutral-100 mt-4">
        <div className="container mx-auto px-4 md:px-6 py-3 space-y-2">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar perfume o marca"
                className="w-full h-10 pl-9 pr-3 rounded-full bg-neutral-100 text-base md:text-sm outline-none focus:ring-2 focus:ring-mustard-500"
              />
            </label>
            <button
              onClick={() => setShowMore((s) => !s)}
              aria-expanded={showMore}
              className={`relative h-10 px-3 rounded-full border flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${
                showMore || activeExtra ? 'border-neutral-900' : 'border-neutral-200'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filtros</span>
              {activeExtra > 0 && (
                <span className="w-4 h-4 rounded-full bg-mustard-500 text-white text-[10px] flex items-center justify-center">{activeExtra}</span>
              )}
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            <Chip active={gender === 'TODOS'} onClick={() => setGender('TODOS')}>Todos</Chip>
            <Chip active={gender === 'MASCULINO'} onClick={() => setGender('MASCULINO')}>Hombre</Chip>
            <Chip active={gender === 'FEMENINO'} onClick={() => setGender('FEMENINO')}>Mujer</Chip>
            <Chip active={gender === 'UNISEX'} onClick={() => setGender('UNISEX')}>Unisex</Chip>
            <span className="w-px bg-neutral-200 shrink-0 my-1" />
            <Chip active={type === 'DISEÑADOR'} onClick={() => setType(type === 'DISEÑADOR' ? 'TODOS' : 'DISEÑADOR')}>Diseñador</Chip>
            <Chip active={type === 'NICHO'} onClick={() => setType(type === 'NICHO' ? 'TODOS' : 'NICHO')}>Nicho</Chip>
            <Chip active={onlyAvailable} onClick={() => setOnlyAvailable((v) => !v)}>Disponibles</Chip>
          </div>

          {showMore && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                aria-label="Marca"
                className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-base md:text-sm"
              >
                <option value="TODAS">Todas las marcas</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                aria-label="Ordenar"
                className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-base md:text-sm"
              >
                <option value="destacados">Destacados</option>
                <option value="precio-asc">Precio: menor a mayor</option>
                <option value="precio-desc">Precio: mayor a menor</option>
                <option value="nombre">Nombre A-Z</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 pt-4">
        <div className="flex items-center justify-between mb-3 text-xs text-neutral-500">
          <span>
            {filtered.length} {filtered.length === 1 ? 'fragancia' : 'fragancias'}
          </span>
          {(query || gender !== 'TODOS' || type !== 'TODOS' || onlyAvailable || activeExtra > 0) && (
            <button onClick={clearAll} className="flex items-center gap-1 font-semibold text-mustard-600">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>

        {loading && !inspiraciones.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
            {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-neutral-50 rounded-lg">
            <p className="text-neutral-500">No encontramos fragancias con esos filtros.</p>
            <button onClick={clearAll} className="mt-3 text-mustard-600 font-semibold">Limpiar filtros</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
              {filtered.slice(0, visible).map((p) => (
                <ProductCard key={p.id} product={p} onOpen={openProduct} />
              ))}
            </div>
            {visible < filtered.length && (
              <div ref={sentinel} className="flex justify-center mt-8">
                <button
                  onClick={() => setVisible((v) => v + PAGE)}
                  className="px-6 h-11 rounded-full border border-neutral-900 text-sm font-semibold uppercase tracking-wider"
                >
                  Ver más ({filtered.length - visible})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
