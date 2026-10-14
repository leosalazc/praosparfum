import { motion } from 'motion/react';
import { Droplet, Truck, Sparkles } from 'lucide-react';

const benefits = [
  {
    icon: Droplet,
    title: "Elaboración Propia",
    desc: "Nuestras fórmulas son creadas de forma artesanal y meticulosa, garantizando una excelente fijación y proyección."
  },
  {
    icon: Sparkles,
    title: "Formato 60ml",
    desc: "Inspiraciones de diseñador a $15.000 y de nicho a $18.000. Perfumería de autor en 60ml y 100ml."
  },
  {
    icon: Truck,
    title: "Envíos desde el Sur",
    desc: "Despachamos desde Concepción a todo Chile, con empaques seguros para que tu pedido llegue en perfectas condiciones."
  }
];

export function Benefits() {
  return (
    <section className="py-14 md:py-24 bg-neutral-900 text-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ delay: i * 0.1, duration: 0.6 }}
              className="flex flex-col items-center text-center max-w-sm mx-auto"
            >
              <div className="w-16 h-16 bg-neutral-800 text-mustard-500 rounded-full flex items-center justify-center mb-6">
                <b.icon className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-display tracking-wide mb-4 text-mustard-400">{b.title}</h3>
              <p className="text-neutral-400 font-light leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
