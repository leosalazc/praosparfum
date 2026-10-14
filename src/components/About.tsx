import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

export function About() {
  const [activeTab, setActiveTab] = useState<'historia' | 'comunidad'>('historia');

  return (
    <section id="nosotros" className="py-16 md:py-32 bg-neutral-50 scroll-mt-14">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center mb-8 md:mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }}
            className="text-xs tracking-[0.2em] text-mustard-600 uppercase font-bold mb-6 block"
          >
            Nosotros
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl mb-6 md:mb-10 text-neutral-900"
          >
            NUESTRA ESENCIA
          </motion.h2>

          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => setActiveTab('historia')}
              className={`px-4 md:px-6 py-2 rounded-full text-sm font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'historia'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-500 hover:text-neutral-900 shadow-sm'
              }`}
            >
              Nuestra Historia
            </button>
            <button
              onClick={() => setActiveTab('comunidad')}
              className={`px-4 md:px-6 py-2 rounded-full text-sm font-semibold tracking-wider uppercase transition-colors ${
                activeTab === 'comunidad'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-500 hover:text-neutral-900 shadow-sm'
              }`}
            >
              Comunidad
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 md:p-12 shadow-sm md:min-h-[500px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {activeTab === 'historia' && (
              <motion.div
                key="historia"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="max-w-3xl text-center mx-auto"
              >
                <p className="text-lg md:text-2xl text-neutral-600 leading-relaxed font-light">
                  Nacimos el año 2022 en <strong className="font-medium text-neutral-900">Concepción, Región del BioBio</strong>.
                  En <strong className="font-medium text-neutral-900">Práos Parfum</strong> creamos perfumes elaborados por nosotros mismos, dedicando tiempo y precisión a cada fórmula.
                  Desarrollamos una colección excepcional de fragancias de autor e inspiraciones en la mejor perfumería de diseñador y nicho del mundo.
                  Nuestro compromiso es entregar máxima calidad, duración y una presentación impecable en cada botella.
                </p>
              </motion.div>
            )}

            {activeTab === 'comunidad' && (
              <motion.div
                key="comunidad"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center"
              >
                <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl shadow-sm bg-neutral-100">
                  <iframe
                    src="https://www.instagram.com/reel/DDxjQLcys4d/embed"
                    className="w-full h-[650px] border-none"
                    frameBorder="0"
                    scrolling="no"
                    loading="lazy"
                    title="Publicación en Instagram"
                  ></iframe>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
