import { Link } from 'react-router-dom';
import { Logo } from './ui/Logo';
import { SHIPPING, formatCLP } from '../lib/catalog';

export function Footer() {
  return (
    <footer className="bg-white pt-14 md:pt-24 pb-8 md:pb-12 border-t border-neutral-100">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-12 md:mb-20">
          <div className="col-span-2">
            <Link to="/" className="inline-block mb-6" aria-label="Inicio">
              <Logo className="h-10 md:h-12 w-auto" />
            </Link>
            <p className="text-neutral-500 max-w-sm font-light leading-relaxed mb-6 text-sm md:text-base">
              Perfumería de autor e inspiraciones elaboradas con dedicación desde Concepción, Región del Biobío, Chile.
            </p>
            <a
              href="https://www.instagram.com/praosparfum.cl/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 h-10 px-4 border border-neutral-200 rounded-full text-sm text-neutral-700 hover:bg-mustard-500 hover:border-mustard-500 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" /></svg>
              @praosparfum.cl
            </a>
          </div>

          <div>
            <h4 className="font-sans font-semibold tracking-[0.15em] uppercase text-xs mb-4 text-neutral-900">Tienda</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/coleccion#inspiraciones" className="text-neutral-500 hover:text-mustard-500">Inspiraciones</Link></li>
              <li><Link to="/coleccion#de-autor" className="text-neutral-500 hover:text-mustard-500">De autor</Link></li>
              <li><Link to="/#castagna" className="text-neutral-500 hover:text-mustard-500">Castagna</Link></li>
              <li><Link to="/#nosotros" className="text-neutral-500 hover:text-mustard-500">Nosotros</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-sans font-semibold tracking-[0.15em] uppercase text-xs mb-4 text-neutral-900">Envíos</h4>
            <ul className="space-y-3 text-sm text-neutral-500">
              <li>Biobío: {formatCLP(SHIPPING.LOCAL_COST)}</li>
              <li>Resto de Chile: {formatCLP(SHIPPING.NATIONAL_COST)}</li>
              <li>Retiro gratis en Concepción</li>
              <li>Pago seguro con Webpay</li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-neutral-100 flex flex-col md:flex-row justify-between items-center gap-3 text-neutral-400 text-xs md:text-sm">
          <p>&copy; {new Date().getFullYear()} Práos Parfum. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6">
            <Link to="/admin" className="hover:text-mustard-500">Administración</Link>
            <span>Hecho en Concepción, Chile</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
