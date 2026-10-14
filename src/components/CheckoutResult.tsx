import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, AlertCircle, Instagram, Loader2, Lock } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import { formatCLP } from '../lib/catalog';

type PublicOrder = {
  id: string;
  status: string;
  items: { name: string; size: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  delivery: { method: 'shipping' | 'pickup'; region?: string; comuna?: string };
  customerName: string;
  payment?: { authorizationCode?: string; paymentType?: string; installments?: number; cardLast4?: string };
  payForm?: { action: string; idFormulario: string; monto: number };
  customerEmail?: string;
  reservationExpiresAt?: string;
  reservationStatus?: string;
  stockIssue?: string;
};

const PAID = ['pagado', 'preparando', 'enviado', 'entregado'];

export function CheckoutResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const { refresh } = useProducts();
  const orderId = searchParams.get('order');
  const key = searchParams.get('key');
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    setOrder(null);
    setLoading(true);
    const load = async () => {
      if (!orderId || !key) {
        setError('No pudimos verificar el pedido. Si realizaste un pago, escríbenos con tu comprobante.');
        setLoading(false);
        return;
      }
      if (controller && !controller.signal.aborted) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(key)}`, { cache: 'no-store', signal });
        if (!res.ok) throw new Error(res.status === 404 ? 'No encontramos el pedido. Escríbenos si necesitas ayuda.' : 'No pudimos consultar el estado del pedido. Intenta nuevamente.');
        const data: PublicOrder = await res.json();
        if (!active || signal.aborted) return;
        setOrder(data);
        setError('');
      } catch (e) {
        if (!active || signal.aborted) return;
        setError(e instanceof Error ? e.message : 'No pudimos consultar el pedido.');
        setOrder(null);
      } finally {
        if (active && !signal.aborted) setLoading(false);
        if (controller?.signal === signal) controller = null;
      }
    };
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(onVisible, 5000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [orderId, key]);

  const paid = !!order && PAID.includes(order.status);
  useEffect(() => {
    if (paid) { clearCart(); void refresh(); }
  }, [paid, clearCart, refresh]);

  const pending = order?.status === 'pendiente_pago';
  const rejected = order?.status === 'rechazado';
  const canceled = order?.status === 'cancelado';
  const reservationExpired = !!order?.reservationExpiresAt && (new Date(order.reservationExpiresAt).getTime() <= Date.now() || order.reservationStatus === 'expired' || order.reservationStatus === 'released');
  const card = 'w-full max-w-lg bg-white p-6 md:p-10 rounded-2xl border border-neutral-100 text-center';

  return (
    <div className="min-h-screen bg-neutral-50 flex items-start md:items-center justify-center pt-20 pb-24 px-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={card}>
        {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" /> : error || !order ? (
          <>
            <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-3" />
            <h1 className="text-3xl font-display mb-2">No pudimos verificar el pedido</h1>
            <p role="alert" className="text-neutral-600 text-sm mb-6">{error || 'Escríbenos para revisar el estado de tu compra.'}</p>
          </>
        ) : (
          <>
            {paid ? <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" /> : rejected || canceled ? <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" /> : <p className="text-xs font-bold uppercase tracking-widest text-mustard-600">Pedido registrado</p>}
            <h1 className="text-3xl font-display mt-1 mb-2">{paid ? `¡Gracias, ${order.customerName}!` : pending ? 'Paga tu pedido' : rejected ? 'Pago rechazado' : canceled ? 'Pedido cancelado' : 'Estado de tu pedido'}</h1>
            <p className="text-sm text-neutral-500 mb-4">Pedido <strong className="text-neutral-900">{order.id}</strong></p>
            {paid && <p className="text-neutral-600 text-sm mb-5">Tu pago está confirmado. {order.stockIssue ? 'Estamos revisando la disponibilidad; te contactaremos para resolver tu pedido.' : 'Prepararemos tu pedido y te contactaremos para coordinar la entrega.'}</p>}
            {(rejected || canceled) && <p className="text-neutral-600 text-sm mb-5">{rejected ? 'El pago no fue aprobado.' : 'Este pedido fue cancelado.'} Si aparece un cargo en tu cuenta, escríbenos con tu comprobante para revisarlo.</p>}

            <div className="bg-neutral-50 rounded-xl p-4 text-left mb-5 text-sm space-y-1.5">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between gap-2">
                  <span className="text-neutral-700">{item.quantity} × {item.name} {item.size}</span>
                  <span>{formatCLP(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between text-neutral-500"><span>Envío</span><span>{order.shipping ? formatCLP(order.shipping) : 'Sin costo'}</span></div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold text-base"><span>{paid ? 'Total pagado' : 'Total del pedido'}</span><span>{formatCLP(order.total)}</span></div>
              {paid && order.payment?.authorizationCode && <p className="text-xs text-neutral-500">{order.payment.paymentType} · ****{order.payment.cardLast4} · Cód. autorización {order.payment.authorizationCode}</p>}
              {paid && <p className="text-xs text-neutral-500">{order.delivery.method === 'pickup' ? 'Retiro en Concepción: te contactaremos para coordinar.' : `Envío a ${order.delivery.comuna}, ${order.delivery.region}.`}</p>}
            </div>

            {pending && reservationExpired ? (
              <p className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg mb-5">La reserva de stock venció. Si ya pagaste, envíanos tu comprobante. Si aún no pagas, vuelve a la tienda para verificar disponibilidad y crear un nuevo pedido.</p>
            ) : pending && order.payForm ? (
              <>
                {order.reservationExpiresAt && <p className="text-xs text-neutral-500 mb-4">Stock reservado hasta {new Date(order.reservationExpiresAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.</p>}
                <ol className="text-left text-sm text-neutral-600 space-y-1.5 mb-6 list-decimal pl-5">
                  <li>Presiona <strong>Pagar con Webpay</strong>.</li>
                  <li>Usa el correo <strong>{order.customerEmail}</strong> y verifica que el importe sea <strong>{formatCLP(order.total)}</strong>.</li>
                  <li>La tienda revisará el pago y confirmará tu pedido. Este botón no confirma el pago automáticamente.</li>
                </ol>
                <form method="post" action={order.payForm.action}>
                  <input type="hidden" name="idFormulario" value={order.payForm.idFormulario} />
                  <input type="hidden" name="monto" value={order.payForm.monto} />
                  <button type="submit" className="w-full h-14 rounded-full bg-neutral-900 text-white font-semibold uppercase tracking-wider flex items-center justify-center gap-3"><Lock className="w-4 h-4" /> Pagar con Webpay</button>
                </form>
                <p className="text-xs text-neutral-400 mt-4 mb-5">Si ya pagaste, espera la confirmación de la tienda. No realices un segundo pago.</p>
              </>
            ) : pending ? <p className="text-sm text-neutral-600 mb-5">Tu pedido está pendiente de confirmación del pago. Si ya pagaste, espera la revisión de la tienda.</p> : null}
          </>
        )}
        {!loading && (
          <>
            <a href="https://instagram.com/praosparfum.cl" target="_blank" rel="noopener noreferrer" className="flex w-full justify-center items-center gap-2 border border-neutral-200 h-12 rounded-full text-sm font-semibold mb-3"><Instagram className="w-4 h-4" /> ¿Dudas? Escríbenos en Instagram</a>
            <button onClick={() => navigate('/')} className="w-full h-12 rounded-full bg-neutral-900 text-white text-sm font-semibold uppercase tracking-wider">Volver a la tienda</button>
          </>
        )}
      </motion.div>
    </div>
  );
}
