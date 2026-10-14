import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mail, MessageCircle, RefreshCw, Send, Store, Truck } from 'lucide-react';
import { Order, OrderStatus, ORDER_STATUSES, formatCLP } from '../../lib/catalog';
import { useProducts } from '../../context/ProductContext';
import { adminFetch } from './api';

const FILTERS: { id: string; label: string; statuses: OrderStatus[] | null }[] = [
  { id: 'confirmar', label: 'Por confirmar pago', statuses: ['pendiente_pago'] },
  { id: 'despachar', label: 'Por despachar', statuses: ['pagado', 'preparando'] },
  { id: 'enviados', label: 'Enviados', statuses: ['enviado', 'entregado'] },
  { id: 'todos', label: 'Todos', statuses: null },
  { id: 'cancelados', label: 'Cancelados', statuses: ['rechazado', 'cancelado'] },
];
const PAID: OrderStatus[] = ['pagado', 'preparando', 'enviado', 'entregado'];
const dayKey = (date: string | Date) => new Date(date).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

function Badge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUSES[status] || ORDER_STATUSES.pendiente_pago;
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${s.color}`}>{s.label}</span>;
}

export function OrdersTab() {
  const { refresh } = useProducts();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('confirmar');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (activeRequest.current && !activeRequest.current.signal.aborted) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const list = await adminFetch<Order[]>('/api/admin/orders', { signal: controller.signal });
      if (controller.signal.aborted) return;
      setOrders(list);
      setError('');
    } catch (e: any) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const t = window.setInterval(onVisible, 5000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(t); activeRequest.current?.abort(); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const patch = async (id: string, body: Partial<Order>) => {
    const current = orders.find((o) => o.id === id);
    if (body.status === 'pagado' && current?.status === 'pendiente_pago' && !confirm(`Confirma que verificaste en Webpay el pago de ${formatCLP(current.total)} correspondiente al pedido ${id}. El stock se descontará una sola vez. ¿Registrar el pago recibido?`)) return;
    if (body.status === 'cancelado' && current?.status !== 'cancelado' && !confirm(`¿Cancelar el pedido ${id}? Verifica cualquier devolución de pago directamente con Webpay.`)) return;
    setBusy(id);
    activeRequest.current?.abort();
    try {
      const updated = await adminFetch<Order>(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setOrders((list) => list.map((o) => (o.id === id ? updated : o)));
      await refresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const resend = async (id: string) => {
    setBusy(id);
    try {
      const r = await adminFetch<{ emailStatus: string }>(`/api/admin/orders/${id}/resend`, { method: 'POST' });
      alert(r.emailStatus === 'enviado' ? 'Correo reenviado.' : `Estado del correo: ${r.emailStatus}`);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const paid = orders.filter((o) => PAID.includes(o.status));
    const todayKey = dayKey(now);
    const month = paid.filter((o) => dayKey(o.paidAt || o.createdAt).slice(0, 7) === todayKey.slice(0, 7));
    const today = month.filter((o) => dayKey(o.paidAt || o.createdAt) === todayKey);
    return {
      monthTotal: month.reduce((s, o) => s + o.total, 0),
      monthCount: month.length,
      todayTotal: today.reduce((s, o) => s + o.total, 0),
      pending: orders.filter((o) => o.status === 'pagado' || o.status === 'preparando').length,
      toConfirm: orders.filter((o) => o.status === 'pendiente_pago').length,
      units: month.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0),
    };
  }, [orders]);

  const statuses = FILTERS.find((f) => f.id === filter)?.statuses;
  const visible = statuses ? orders.filter((o) => statuses.includes(o.status)) : orders;

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">Los pedidos se actualizan cada 5 segundos mientras esta pestaña está visible. Verifica el pago en Webpay antes de confirmarlo; el servidor descuenta el stock una sola vez.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Ventas del mes', value: formatCLP(stats.monthTotal), sub: `${stats.monthCount} pedidos` },
          { label: 'Hoy', value: formatCLP(stats.todayTotal) },
          { label: 'Por despachar', value: String(stats.pending), highlight: stats.pending > 0 },
          { label: 'Unidades del mes', value: String(stats.units) },
        ].map((k) => (
          <div key={k.label} className={`rounded-xl p-4 border ${k.highlight ? 'bg-mustard-400/15 border-mustard-400' : 'bg-white border-neutral-200'}`}>
            <p className="text-xs text-neutral-500">{k.label}</p>
            <p className="text-xl md:text-2xl font-semibold mt-1">{k.value}</p>
            {k.sub && <p className="text-xs text-neutral-400">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 h-9 px-4 rounded-full text-xs font-semibold border ${
                filter === f.id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'
              }`}
            >
              {f.label}
              {f.id === 'despachar' && stats.pending > 0 ? ` (${stats.pending})` : ''}
              {f.id === 'confirmar' && stats.toConfirm > 0 ? ` (${stats.toConfirm})` : ''}
            </button>
          ))}
        </div>
        <button onClick={load} aria-label="Actualizar" className="w-9 h-9 rounded-full border border-neutral-200 bg-white flex items-center justify-center">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
      {!loading && visible.length === 0 && (
        <p className="text-center text-neutral-400 py-12 bg-white rounded-xl border border-neutral-200">No hay pedidos en esta vista.</p>
      )}

      <div className="space-y-2">
        {visible.map((o) => {
          const isOpen = open === o.id;
          const phone = o.customer.phone.replace(/\D/g, '');
          const transitions = PAID.includes(o.status) ? PAID.filter((status) => PAID.indexOf(status) >= PAID.indexOf(o.status)) : o.status === 'pendiente_pago' ? ['pagado', 'cancelado'] as OrderStatus[] : [o.status];
          return (
            <div key={o.id} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : o.id)} className="w-full text-left p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge status={o.status} />
                    <span className="text-xs text-neutral-400">{fmtDate(o.paidAt || o.createdAt)}</span>
                    {o.delivery.method === 'pickup' ? (
                      <Store className="w-3.5 h-3.5 text-neutral-400" />
                    ) : (
                      <Truck className="w-3.5 h-3.5 text-neutral-400" />
                    )}
                  </div>
                  <p className="font-semibold mt-1 truncate">{o.customer.name}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {o.items.map((i) => `${i.quantity}× ${i.name} ${i.size}`).join(' · ')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{formatCLP(o.total)}</p>
                  <p className="text-[10px] text-neutral-400 font-mono">{o.id}</p>
                  <ChevronDown className={`w-4 h-4 ml-auto mt-1 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-neutral-100 p-4 grid md:grid-cols-2 gap-4 text-sm bg-neutral-50/50">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Cliente</p>
                      <p>{o.customer.name}</p>
                      <div className="flex gap-2 mt-2">
                        <a
                          href={`https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${o.customer.name.split(' ')[0]}, te escribimos de Práos Parfum por tu pedido ${o.id}.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="h-9 px-3 rounded-full bg-green-600 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <MessageCircle className="w-4 h-4" /> {o.customer.phone}
                        </a>
                        <a href={`mailto:${o.customer.email}?subject=Pedido ${o.id}`} className="h-9 px-3 rounded-full border border-neutral-300 text-xs font-semibold flex items-center gap-1.5 min-w-0">
                          <Mail className="w-4 h-4 shrink-0" /> <span className="truncate">{o.customer.email}</span>
                        </a>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Entrega</p>
                      {o.delivery.method === 'pickup' ? (
                        <p>Retiro en tienda</p>
                      ) : (
                        <p>
                          {o.delivery.address}, {o.delivery.comuna}
                          <br />
                          {o.delivery.region}
                        </p>
                      )}
                      {o.delivery.notes && <p className="text-neutral-500 italic mt-1">“{o.delivery.notes}”</p>}
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Productos</p>
                      {o.items.map((i, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {i.quantity}× {i.name} <span className="text-neutral-400">{i.size}</span>
                          </span>
                          <span>{formatCLP(i.unitPrice * i.quantity)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-neutral-500">
                        <span>Envío</span>
                        <span>{formatCLP(o.shipping)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t border-neutral-200 mt-1 pt-1">
                        <span>Total</span>
                        <span>{formatCLP(o.total)}</span>
                      </div>
                    </div>
                    {o.payment?.authorizationCode && (
                      <p className="text-xs text-neutral-500">
                        Webpay: {o.payment.paymentType} · ****{o.payment.cardLast4} · Aut. {o.payment.authorizationCode}
                        {o.payment.installments ? ` · ${o.payment.installments} cuotas` : ''}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500">
                      Correo: {o.emailStatus === 'enviado' ? '✅ enviado' : o.emailStatus === 'error' ? '⚠️ error' : o.emailStatus === 'no_configurado' ? '⚠️ SMTP no configurado' : '—'} ·
                      Stock: {o.stockApplied ? '✅ descontado' : '⏳ pendiente'}
                    </p>
                    {o.reservationExpiresAt && o.status === 'pendiente_pago' && <p className="text-xs text-neutral-500">Reserva de stock: {o.reservationStatus === 'active' ? `hasta ${fmtDate(o.reservationExpiresAt)}` : 'vencida o liberada; verificar disponibilidad antes de confirmar pago'}.</p>}
                    {o.stockIssue && <p role="alert" className="text-xs text-red-700 bg-red-50 p-3 rounded-lg">Pago registrado con una incidencia de inventario: {o.stockIssue}. Revisa el stock antes de preparar este pedido.</p>}
                  </div>

                  <div className="space-y-3">
                    {o.status === 'pendiente_pago' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 space-y-2">
                        <p>
                          Busca en tu correo el pago de Transbank por <strong>{formatCLP(o.total)}</strong> de{' '}
                          <strong>{o.customer.email}</strong>. Verifica el pedido y el importe en Webpay antes de confirmar. El stock se descuenta en el servidor y se intenta enviar el correo de confirmación.
                        </p>
                        <button
                          disabled={busy === o.id}
                          onClick={() => patch(o.id, { status: 'pagado' })}
                          className="h-9 px-4 rounded-full bg-green-700 text-white font-semibold"
                        >
                          Confirmar pago recibido
                        </button>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1">Estado</p>
                      <div className="flex flex-wrap gap-1.5">
                        {transitions.map((s) => (
                          <button
                            key={s}
                            disabled={busy === o.id || o.status === s || (!!o.stockIssue && s !== o.status)}
                            onClick={() => patch(o.id, { status: s })}
                            className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                              o.status === s ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200'
                            } disabled:cursor-default`}
                          >
                            {ORDER_STATUSES[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">N° de seguimiento</span>
                      <input
                        defaultValue={o.tracking || ''}
                        onBlur={(e) => e.target.value !== (o.tracking || '') && patch(o.id, { tracking: e.target.value })}
                        placeholder="Ej: Starken 123456"
                        className="mt-1 w-full h-10 px-3 rounded-lg border border-neutral-200 text-base md:text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Notas internas</span>
                      <textarea
                        defaultValue={o.adminNotes || ''}
                        onBlur={(e) => e.target.value !== (o.adminNotes || '') && patch(o.id, { adminNotes: e.target.value })}
                        rows={2}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-200 text-base md:text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PAID.includes(o.status) && !o.stockApplied && (
                        <button disabled={busy === o.id} onClick={() => patch(o.id, { status: o.status })} className="h-9 px-3 rounded-full bg-amber-900 text-white text-xs font-semibold">Reintentar descuento de stock en el servidor</button>
                      )}
                      {PAID.includes(o.status) && (
                        <button
                          disabled={busy === o.id}
                          onClick={() => resend(o.id)}
                          className="h-9 px-3 rounded-full border border-neutral-300 text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Send className="w-4 h-4" /> Reenviar correos
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
