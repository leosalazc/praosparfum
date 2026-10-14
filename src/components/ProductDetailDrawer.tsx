import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Minus, Plus } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import { useUI } from '../context/UIContext';
import { perfumeNotesData } from '../data/perfumeNotes';
import { Product, formatCLP, getVariants, isAvailable, stockOf } from '../lib/catalog';
import { useLockBody } from '../hooks/useLockBody';
import { ProductImage } from './ui/ProductImage';
import { localImage } from '../lib/productImage';

function getProductDetails(p: Product) {
  const lowerName = p.name.toLowerCase().trim();

  if (lowerName === 'castagna del bosco') {
    return {
      tagline: 'Nueva Fragancia de Autor',
      description:
        'Luego de un largo recorrido en busca de las notas que armonizaran con la esencia cálida de la castaña, nació una fragancia única que rinde homenaje a la tradicional Fiesta de la Castaña que se celebra en Chiguayante.',
      notes: [
        { title: 'SALIDA', desc: 'La castaña dulce y tostada se mezcla con la elegancia amarga del chocolate negro.' },
        { title: 'CORAZÓN', desc: 'Un café aromático aporta intensidad y calidez.' },
        { title: 'BASE', desc: 'El cuero, el sándalo y el ámbar brindan carácter, cremosidad y una estela profunda y duradera.' },
      ],
    };
  }
  if (lowerName === 'monley') {
    return {
      tagline: 'Perfume de Autor',
      description:
        'Este es un perfume de autor que evoca la pureza y la vitalidad del mar. Un aroma limpio, jabonoso y fresco que te transporta inmediatamente a una brisa oceánica matutina.',
      notes: [
        { title: 'SALIDA', desc: 'Notas marinas, cítricos chispeantes y bergamota fresca.' },
        { title: 'CORAZÓN', desc: 'Romero, caqui y toques acuáticos que aportan un carácter jabonoso y limpio.' },
        { title: 'BASE', desc: 'Almizcle blanco, pachulí y maderas claras para una fijación fresca.' },
      ],
    };
  }

  const knownData = perfumeNotesData[lowerName];

  if (p.type === 'AUTOR') {
    return {
      tagline: 'Perfume de Autor',
      description:
        'Este es un perfume de autor, una creación única y exclusiva de Práos Parfum. Diseñada con ingredientes seleccionados para ofrecer una experiencia olfativa irrepetible y con un sello personal.',
      notes: knownData?.notes || [
        { title: 'NOTAS', desc: 'Una composición armoniosa de notas exclusivas que evolucionan maravillosamente en la piel a lo largo del día.' },
      ],
    };
  }

  return {
    tagline: `Inspirado en ${p.brand || 'perfumería de ' + p.type.toLowerCase()}`,
    description: `Esta fragancia es una exquisita inspiración del perfume ${p.name}${
      p.brand ? ' de ' + p.brand : ''
    }. Ha sido formulada cuidadosamente para capturar su esencia, ofreciendo una experiencia olfativa excepcional que evoluciona en sus distintas notas.`,
    notes: knownData?.notes || [
      {
        title: 'PIRÁMIDE OLFATIVA',
        desc: 'Desarrollada para reflejar fielmente la evolución aromática del perfume original, desde sus notas de salida hasta su fijación en la piel.',
      },
    ],
  };
}

/** Product sheet: bottom sheet on phones, side drawer on desktop. */
export function ProductDetailDrawer() {
  const { selectedProduct, closeProduct } = useUI();
  const { allProducts } = useProducts();
  const { addToCart, items } = useCart();
  // Always read the live product (stock may change while the sheet is open).
  const product = selectedProduct ? allProducts.find((p) => p.id === selectedProduct.id) || null : null;
  const isOpen = !!product;

  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  useLockBody(isOpen, closeProduct);

  useEffect(() => {
    if (product) {
      setSize(getVariants(product)[0]?.size || '');
      setQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.id]);

  const variants = product ? getVariants(product) : [];
  const variant = variants.find((v) => v.size === size) || variants[0];
  const details = product ? getProductDetails(product) : null;
  const isCastagna = product?.name.toLowerCase() === 'castagna del bosco';
  const available = product ? isAvailable(product) : false;
  const inCart = product ? items.filter((i) => i.productId === product.id).reduce((s, i) => s + i.quantity, 0) : 0;
  const maxQty = product ? Math.max(0, stockOf(product) - inCart) : 0;

  const dark = isCastagna;
  const muted = dark ? 'text-neutral-300' : 'text-neutral-600';

  return (
    <AnimatePresence>
      {product && details && variant && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeProduct}
            className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={product.name}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`fixed z-[70] inset-x-0 bottom-0 max-h-[92svh] rounded-t-2xl md:rounded-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[480px] shadow-2xl flex flex-col ${
              dark ? 'bg-[#261810] text-white' : 'bg-white text-neutral-900'
            }`}
          >
            {/* Grab handle + close */}
            <div className="relative shrink-0">
              <div className={`md:hidden mx-auto mt-2 h-1.5 w-12 rounded-full ${dark ? 'bg-white/20' : 'bg-neutral-200'}`} />
              <button
                onClick={closeProduct}
                aria-label="Cerrar"
                className={`absolute right-3 top-2 md:top-4 z-10 w-10 h-10 rounded-full flex items-center justify-center ${
                  dark ? 'bg-white/10 hover:bg-white/20' : 'bg-white/90 shadow hover:bg-neutral-100'
                }`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="flex gap-4 p-4 pt-3 md:flex-col md:p-0">
                <div className="w-32 shrink-0 aspect-[4/5] md:w-full md:aspect-square rounded-lg md:rounded-none overflow-hidden bg-neutral-100 relative">
                  <ProductImage src={product.image} fallback={localImage(product.id)} alt={product.name} eager className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1 md:px-6 pr-10 md:pr-6">
                  <p className={`text-[10px] font-bold tracking-[0.2em] uppercase ${dark ? 'text-mustard-500' : 'text-mustard-600'}`}>
                    {details.tagline}
                  </p>
                  <h2 className="font-display text-3xl md:text-4xl leading-none mt-1">{product.name}</h2>
                  <p className="text-2xl font-semibold mt-3">{formatCLP(variant.price)}</p>
                  <p className={`text-xs mt-1 ${available ? (dark ? 'text-green-300' : 'text-green-700') : 'text-red-500'}`}>
                    {!available
                      ? 'Agotado'
                      : stockOf(product) === 1
                        ? '¡Última unidad!'
                        : stockOf(product) <= 3
                          ? `¡Últimas ${stockOf(product)} unidades!`
                          : 'Disponible'}
                  </p>
                </div>
              </div>

              <div className="px-4 md:px-6 pb-6">
                {/* Size selector */}
                <p className={`text-xs font-bold tracking-widest uppercase mb-2 ${muted}`}>Tamaño</p>
                <div className="flex gap-2 mb-6">
                  {variants.map((v) => (
                    <button
                      key={v.size}
                      onClick={() => setSize(v.size)}
                      className={`flex-1 rounded-lg border-2 py-3 px-2 text-center transition-colors ${
                        v.size === variant.size
                          ? dark
                            ? 'border-mustard-500 bg-mustard-500/10'
                            : 'border-neutral-900 bg-neutral-50'
                          : dark
                            ? 'border-white/10'
                            : 'border-neutral-200'
                      }`}
                    >
                      <span className="block font-bold">{v.size}</span>
                      <span className={`block text-sm ${muted}`}>{formatCLP(v.price)}</span>
                    </button>
                  ))}
                </div>

                <p className={`leading-relaxed mb-6 text-sm md:text-base ${muted}`}>{details.description}</p>

                <h4 className="text-xs font-bold tracking-[0.2em] uppercase flex items-center gap-4 mb-3">
                  Notas aromáticas
                  <span className={`h-px flex-grow ${dark ? 'bg-white/10' : 'bg-neutral-200'}`} />
                </h4>
                <dl className="space-y-2.5">
                  {details.notes.map((note: { title: string; desc: string }, idx: number) => (
                    <div key={idx}>
                      <dt className={`text-[11px] font-bold tracking-widest uppercase ${dark ? 'text-mustard-500' : 'text-mustard-600'}`}>
                        {note.title}
                      </dt>
                      <dd className={`text-sm leading-snug ${muted}`}>{note.desc}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Sticky buy bar */}
            <div
              className={`shrink-0 p-3 md:p-6 border-t flex gap-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${
                dark ? 'bg-[#261810] border-white/10' : 'bg-white border-neutral-100'
              }`}
            >
              {available && (
                <div className={`flex items-center rounded-full border ${dark ? 'border-white/20' : 'border-neutral-200'}`}>
                  <button
                    aria-label="Menos"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-11 h-12 flex items-center justify-center"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center font-semibold">{qty}</span>
                  <button
                    aria-label="Más"
                    onClick={() => setQty((q) => Math.min(Math.max(1, maxQty), q + 1))}
                    className="w-11 h-12 flex items-center justify-center disabled:opacity-30"
                    disabled={qty >= maxQty}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}
              <button
                onClick={() => {
                  addToCart(product, variant, qty);
                  closeProduct();
                }}
                disabled={!available || maxQty < 1}
                className={`flex-1 h-12 rounded-full font-semibold uppercase tracking-wider text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-colors ${
                  dark ? 'bg-mustard-500 text-neutral-900 hover:bg-mustard-400' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                }`}
              >
                <ShoppingBag size={18} />
                {!available ? 'Agotado' : maxQty < 1 ? 'Máximo en carrito' : `Agregar · ${formatCLP(variant.price * qty)}`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
