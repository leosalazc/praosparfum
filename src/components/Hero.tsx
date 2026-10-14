import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import { formatCLP, PRICE_RULES } from '../lib/catalog';

export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[68svh] md:min-h-screen flex items-center justify-center pt-16 md:pt-20 overflow-hidden">
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-neutral-50 to-white" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-neutral-100/50 rounded-full blur-3xl opacity-50 z-0" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 flex flex-col items-center text-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="mb-5 md:mb-8 px-4 py-1.5 border border-mustard-500/30 rounded-full text-[10px] md:text-sm tracking-[0.2em] text-mustard-600 uppercase font-medium bg-mustard-400/10"
        >
          Desde Concepción, Sur de Chile
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-[4.25rem] sm:text-8xl md:text-[8rem] lg:text-[10rem] text-neutral-900 mb-4 md:mb-6 max-w-6xl leading-[0.85] tracking-tight"
        >
          NUESTRA PROPIA ESENCIA
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-base md:text-xl text-neutral-600 max-w-2xl mb-8 md:mb-12 font-light leading-relaxed"
        >
          Perfumería de autor e inspiraciones elaboradas artesanalmente por nosotros. Formatos de 60ml desde{' '}
          <strong className="font-semibold text-neutral-900">{formatCLP(PRICE_RULES.DISEÑADOR[0].price)}</strong>.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
        >
          <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/coleccion#inspiraciones')}>
            Ver catálogo
          </Button>
          <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/coleccion#de-autor')}>
            Perfumería de autor
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
