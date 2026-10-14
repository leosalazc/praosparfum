import { useState } from 'react';
import { motion } from 'motion/react';
import { Instagram, Play } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import { CASTAGNA_ID, formatCLP, getVariants, isAvailable } from '../lib/catalog';

const NOTES = [
  { title: 'Salida', desc: 'La castaña dulce y tostada se mezcla con la elegancia amarga del chocolate negro.', img: '/castagna-salida.webp' },
  { title: 'Corazón', desc: 'Un café aromático aporta intensidad y calidez.', img: '/castagna-corazon.webp' },
  { title: 'Base', desc: 'El cuero, el sándalo y el ámbar brindan carácter, cremosidad y una estela profunda y duradera.', img: '/castagna-base.webp' },
];

export function CastagnaLanding() {
  const { addToCart } = useCart();
  const { allProducts } = useProducts();
  const castagna = allProducts.find((p) => p.id === CASTAGNA_ID);
  const available = !!castagna && isAvailable(castagna);
  const [showReel, setShowReel] = useState(false);

  return (
    <section id="castagna" className="py-12 md:py-24 bg-[#261810] scroll-mt-14 text-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-mustard-600/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-orange-900/20 blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 lg:items-center">
          {/* Concept, logo and buy buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <span className="h-px w-10 bg-mustard-500" />
              <span className="text-mustard-500 font-bold tracking-[0.2em] uppercase text-[10px] md:text-xs">Nueva fragancia de autor</span>
            </div>
            <img
              src="/castagna-logo.webp"
              alt="Castagna del bosco"
              width="806"
              height="270"
              className="w-full max-w-[240px] md:max-w-sm mb-4 md:mb-6 object-contain h-auto"
            />
            <p className="text-base md:text-xl text-neutral-300 font-light leading-relaxed mb-6">
              Luego de un largo recorrido en busca de las notas que armonizaran con la esencia cálida de la castaña, nació una
              fragancia única que rinde homenaje a la tradicional <strong className="text-white font-medium">Fiesta de la Castaña</strong> que
              se celebra en <strong className="text-white font-medium">Chiguayante</strong>.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {(castagna ? getVariants(castagna) : []).map((v) => (
                <button
                  key={v.size}
                  disabled={!available}
                  onClick={() => addToCart(castagna, v)}
                  className="rounded-xl bg-mustard-500 text-neutral-900 hover:bg-mustard-400 active:scale-95 transition py-3 px-2 disabled:opacity-40"
                >
                  <span className="block text-xs font-bold uppercase tracking-widest">
                    {available ? 'Agregar' : 'Agotado'} {v.size}
                  </span>
                  <span className="block text-xl font-semibold">{formatCLP(v.price)}</span>
                </button>
              ))}
              {!castagna && <p className="col-span-2 text-sm text-neutral-300">Esta fragancia no está disponible para comprar.</p>}
            </div>
          </motion.div>

          {/* Bottle */}
          <div className="relative w-full aspect-[16/10] lg:aspect-square rounded-2xl overflow-hidden bg-neutral-900">
            <img src="/castagna-principal.webp" alt="Castagna del bosco" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        </div>

        {/* Olfactory pyramid — directly on the background, no boxes */}
        <div className="mt-10 md:mt-16">
          <div className="flex items-center gap-4 mb-5 md:mb-8">
            <h3 className="text-xl md:text-3xl font-display tracking-widest">La pirámide olfativa</h3>
            <span className="h-px flex-grow bg-white/10" />
          </div>
          <div className="grid md:grid-cols-3 gap-5 md:gap-10">
            {NOTES.map((n) => (
              <div key={n.title} className="flex md:flex-col items-center md:items-start gap-4">
                <img
                  src={n.img}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-14 h-14 md:w-20 md:h-20 rounded-full object-cover shrink-0 ring-1 ring-white/15"
                />
                <div>
                  <h4 className="font-display text-xl md:text-2xl text-mustard-500 leading-none mb-1">{n.title}</h4>
                  <p className="text-neutral-300 font-light leading-snug text-sm md:text-base">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Instagram reel: loaded only on demand so it doesn't take over the scroll */}
        <div className="mt-10 md:mt-16 pt-8 border-t border-white/10 flex flex-col items-center">
          {showReel ? (
            <div className="w-full max-w-sm rounded-2xl overflow-hidden">
              <iframe
                src="https://www.instagram.com/reel/DSQjFduDBE7/embed"
                className="w-full h-[560px] border-none"
                scrolling="no"
                title="Reacciones a Castagna en Instagram"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowReel(true)}
              className="flex items-center gap-3 h-12 px-5 rounded-full border border-white/20 text-sm font-semibold uppercase tracking-wider hover:bg-white/10 transition-colors"
            >
              <Play className="w-4 h-4 text-mustard-500" />
              Ver reacciones a Castagna
              <Instagram className="w-4 h-4 text-neutral-400" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
