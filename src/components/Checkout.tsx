import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Store, ChevronDown, Lock, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { CHILE_REGIONS, SHIPPING, formatCLP, shippingCost } from '../lib/catalog';
import { ProductImage } from './ui/ProductImage';

const SAVED_KEY = 'praos-checkout-data';

type Saved = {
  name: string;
  email: string;
  phone: string;
  method: 'shipping' | 'pickup';
  region: string;
  comuna: string;
  address: string;
};
const EMPTY: Saved = { name: '', email: '', phone: '', method: 'shipping', region: '', comuna: '', address: '' };

function loadSaved(): Saved {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(SAVED_KEY) || '{}') };
  } catch {
    return EMPTY;
  }
}

const input =
  'w-full h-12 border border-neutral-200 rounded-lg px-4 text-base bg-white focus:outline-none focus:border-mustard-500 focus:ring-2 focus:ring-mustard-500/20 transition';
const label = 'block text-sm font-medium text-neutral-700 mb-1.5';

export function Checkout() {
  const navigate = useNavigate();
  const { items, cartTotal, cartCount } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Saved>(loadSaved);
  const [notes, setNotes] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);

  const shipping = shippingCost(form.method, form.region);
  const total = cartTotal + shipping;
  const set = (k: keyof Saved) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (items.length === 0 && !loading) navigate('/coleccion', { replace: true });
  }, [items.length, loading, navigate]);

  // Coming back from Webpay with the browser "back" button restores this page from cache.
  useEffect(() => {
    const onShow = () => setLoading(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.method === 'shipping' && !form.region) {
      setError('Selecciona tu región para calcular el envío.');
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(form));
    } catch {
      /* ignore */
    }

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
          customer: { name: form.name, email: form.email, phone: form.phone },
          delivery: { method: form.method, region: form.region, comuna: form.comuna, address: form.address, notes },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No pudimos iniciar el pago.');

      // Webpay.cl payment button: show the order and the pay button.
      if (data.mode === 'link') {
        navigate(`/checkout/result?status=pending&order=${encodeURIComponent(data.orderId)}&key=${encodeURIComponent(data.key)}`);
        return;
      }
      if (!data.url || !data.token) throw new Error('Respuesta inválida de Webpay.');

      const f = document.createElement('form');
      f.method = 'POST';
      f.action = data.url;
      const t = document.createElement('input');
      t.type = 'hidden';
      t.name = 'token_ws';
      t.value = data.token;
      f.appendChild(t);
      document.body.appendChild(f);
      f.submit();
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al iniciar el pago.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const summary = (
    <>
      <div className="flex flex-col gap-3 mb-4">
        {items.map((item) => (
          <div key={item.key} className="flex gap-3 items-center">
            <div className="relative w-14 h-14 bg-neutral-100 rounded-md shrink-0 overflow-hidden">
              <ProductImage src={item.image} alt={item.name} className="w-full h-full object-cover" />
              <span className="absolute -top-0 -right-0 bg-neutral-900 text-white text-[10px] min-w-5 h-5 px-1 rounded-bl-md flex items-center justify-center font-bold">
                {item.quantity}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{item.name}</p>
              <p className="text-xs text-neutral-500">{item.size}</p>
            </div>
            <p className="text-sm font-semibold">{formatCLP(item.price * item.quantity)}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100 pt-3 space-y-2 text-sm">
        <div className="flex justify-between text-neutral-600">
          <span>Subtotal</span>
          <span>{formatCLP(cartTotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-600">
          <span>Envío</span>
          <span>{form.method === 'pickup' ? 'Gratis (retiro)' : form.region ? formatCLP(shipping) : 'Elige tu región'}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-display">{formatCLP(total)}</span>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-neutral-50 pt-16 md:pt-24 pb-32 lg:pb-16">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <Link to="/coleccion" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 py-3">
          <ArrowLeft className="w-4 h-4" /> Seguir comprando
        </Link>

        <h1 className="text-3xl md:text-4xl font-display text-neutral-900 mb-4">Finalizar compra</h1>

        {/* Mobile: collapsible summary */}
        <div className="lg:hidden bg-white rounded-xl border border-neutral-100 mb-4">
          <button
            type="button"
            onClick={() => setSummaryOpen((o) => !o)}
            aria-expanded={summaryOpen}
            className="w-full flex items-center justify-between p-4"
          >
            <span className="text-sm font-medium flex items-center gap-1">
              {summaryOpen ? 'Ocultar' : 'Ver'} resumen ({cartCount})
              <ChevronDown className={`w-4 h-4 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} />
            </span>
            <span className="font-semibold">{formatCLP(total)}</span>
          </button>
          {summaryOpen && <div className="px-4 pb-4">{summary}</div>}
        </div>

        {error && (
          <div role="alert" className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-100 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          <form id="checkout-form" onSubmit={handleSubmit} className="lg:w-3/5 space-y-4">
            <section className="bg-white p-4 md:p-6 rounded-xl border border-neutral-100">
              <h2 className="font-sans normal-case tracking-normal text-lg font-semibold mb-4">1. Tus datos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={label} htmlFor="name">Nombre y apellido</label>
                  <input id="name" required minLength={3} autoComplete="name" value={form.name} onChange={set('name')} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="email">Correo electrónico</label>
                  <input id="email" type="email" required autoComplete="email" inputMode="email" value={form.email} onChange={set('email')} className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="phone">Teléfono / WhatsApp</label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+56 9 1234 5678"
                    pattern="[\d\s\+\-\(\)]{8,}"
                    title="Ingresa un teléfono válido, ej: +56 9 1234 5678"
                    value={form.phone}
                    onChange={set('phone')}
                    className={input}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white p-4 md:p-6 rounded-xl border border-neutral-100">
              <h2 className="font-sans normal-case tracking-normal text-lg font-semibold mb-4">2. Entrega</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {(
                  [
                    { v: 'shipping', icon: MapPin, title: 'Envío', sub: 'A todo Chile' },
                    { v: 'pickup', icon: Store, title: 'Retiro', sub: 'Gratis · Concepción' },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.v}
                    className={`flex flex-col gap-1 p-3 md:p-4 border-2 rounded-xl cursor-pointer transition ${
                      form.method === o.v ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      value={o.v}
                      checked={form.method === o.v}
                      onChange={() => setForm((f) => ({ ...f, method: o.v }))}
                      className="sr-only"
                    />
                    <span className="font-semibold flex items-center gap-2">
                      <o.icon className="w-4 h-4" /> {o.title}
                    </span>
                    <span className="text-xs text-neutral-500">{o.sub}</span>
                  </label>
                ))}
              </div>

              {form.method === 'shipping' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={label} htmlFor="region">Región</label>
                    <select id="region" required value={form.region} onChange={set('region')} className={input}>
                      <option value="">Selecciona tu región…</option>
                      {CHILE_REGIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {form.region && (
                      <p className="text-xs text-neutral-500 mt-1.5">
                        Envío: <strong className="text-neutral-900">{formatCLP(shipping)}</strong>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={label} htmlFor="comuna">Comuna</label>
                    <input id="comuna" required autoComplete="address-level2" value={form.comuna} onChange={set('comuna')} className={input} />
                  </div>
                  <div>
                    <label className={label} htmlFor="address">Dirección</label>
                    <input
                      id="address"
                      required
                      minLength={5}
                      autoComplete="street-address"
                      placeholder="Calle, número, depto"
                      value={form.address}
                      onChange={set('address')}
                      className={input}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={label} htmlFor="notes">Indicaciones (opcional)</label>
                    <input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: dejar en conserjería" className={input} />
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm text-neutral-600">
                  Retiro sin costo en <strong className="text-neutral-900">{SHIPPING.PICKUP_ADDRESS}</strong>. Te contactaremos por
                  WhatsApp o Instagram para coordinar el día y la hora.
                </div>
              )}
            </section>

            <p className="text-xs text-neutral-500 flex items-start gap-2 px-1">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Pagas de forma segura con Webpay (débito, crédito o prepago). Recibirás la confirmación de tu pedido por correo.
            </p>

            {/* Desktop pay button */}
            <button
              type="submit"
              disabled={loading}
              className="hidden lg:flex w-full bg-neutral-900 text-white hover:bg-neutral-800 h-14 text-base tracking-wider uppercase font-semibold items-center justify-center gap-3 rounded-full disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? 'Conectando con Webpay…' : `Pagar ${formatCLP(total)}`}
            </button>
          </form>

          <aside className="hidden lg:block lg:w-2/5">
            <div className="bg-white p-6 rounded-xl border border-neutral-100 sticky top-24">
              <h2 className="font-sans normal-case tracking-normal text-lg font-semibold mb-4">Resumen del pedido</h2>
              {summary}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile sticky pay bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          type="submit"
          form="checkout-form"
          disabled={loading}
          className="w-full bg-neutral-900 text-white h-14 rounded-full font-semibold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-4 h-4" />}
          {loading ? 'Conectando con Webpay…' : `Pagar ${formatCLP(total)}`}
        </button>
      </div>
    </div>
  );
}
