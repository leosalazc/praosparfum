import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useUI } from '../context/UIContext';
import { isAvailable } from '../lib/catalog';
import { perfumeNotesData } from '../data/perfumeNotes';
import { ProductCard } from './ui/ProductCard';
import { useLockBody } from '../hooks/useLockBody';

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function SearchOverlay() {
  const { isSearchOpen: isOpen, setSearchOpen, openProduct } = useUI();
  const onClose = () => setSearchOpen(false);
  const [query, setQuery] = useState('');
  const { products } = useProducts();
  const inputRef = useRef<HTMLInputElement>(null);
  useLockBody(isOpen, onClose);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery('');
  }, [isOpen]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return products
      .filter((p) => {
        const notes = (perfumeNotesData[p.name.toLowerCase().trim()]?.notes || []).map((n: any) => n.desc).join(' ');
        return normalize(`${p.name} ${p.brand || ''} ${p.type} ${notes}`).includes(q);
      })
      .sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)));
  }, [products, query]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-white flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar"
        >
          <div className="container mx-auto px-4 md:px-6 h-16 md:h-24 flex items-center gap-3 border-b border-neutral-100">
            <Search className="w-5 h-5 md:w-6 md:h-6 text-neutral-400" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Perfume, marca o nota (ej. vainilla)"
              className="flex-1 min-w-0 text-lg md:text-3xl bg-transparent outline-none font-light placeholder-neutral-300"
            />
            <button onClick={onClose} aria-label="Cerrar búsqueda" className="w-10 h-10 flex items-center justify-center text-neutral-500">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-neutral-50/50 overscroll-contain">
            <div className="container mx-auto px-4 md:px-6 py-4 md:py-10">
              {query.trim() && results.length === 0 && (
                <div className="text-center text-neutral-500 py-16">No encontramos resultados para "{query}"</div>
              )}
              {!query.trim() && (
                <p className="text-center text-neutral-400 py-10 text-sm">Escribe para buscar entre {products.length} fragancias.</p>
              )}
              {results.length > 0 && (
                <>
                  <p className="text-xs text-neutral-500 mb-3">{results.length} resultados</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6">
                    {results.map((p) => (
                      <ProductCard key={p.id} product={p} onOpen={openProduct} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
