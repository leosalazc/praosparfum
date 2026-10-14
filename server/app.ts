import express from 'express';
import crypto from 'crypto';
import compression from 'compression';
import pkg from 'transbank-sdk';
import { CHILE_REGIONS, Order, OrderItem, OrderStatus, ORDER_STATUSES, getVariants, shippingCost, stockOf } from '../src/lib/catalog.js';
import { getCatalog, invalidateCatalog } from './catalog.js';
import { confirmPaidOrder, getOrder, getOrderByPaymentToken, listOrders, reserveOrder, updateOrder } from './orders.js';
import { NOTIFY_EMAIL, sendCustomerConfirmation, sendOrderEmails, sendPendingOrderEmail, sendTestEmail, smtpConfigured } from './mailer.js';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_SECONDS, adminPasswordConfigured, adminSessionConfigured, checkPassword, createSession, sessionFromCookie, verifySession } from './auth.js';
import * as adminProducts from './products.js';
import { storageStatus } from './database.js';
import { hasAllowedAdminOrigin } from './origin.js';

const { WebpayPlus, Environment, IntegrationApiKeys, IntegrationCommerceCodes, Options } = pkg;

export interface WebpayClient {
  create(buyOrder: string, sessionId: string, amount: number, returnUrl: string): Promise<{ token: string; url: string }>;
  commit(token: string): Promise<any>;
  status(token: string): Promise<any>;
}

function paymentConfiguration() {
  const env = process.env.WEBPAY_ENV || 'link';
  const production = env === 'production';
  const mode: 'link' | 'plus' = env === 'link' ? 'link' : 'plus';
  let error: string | undefined;
  if (!['link', 'integration', 'production'].includes(env)) error = 'WEBPAY_ENV debe ser link, integration o production.';
  if (mode === 'link' && !/^\d{1,20}$/.test(process.env.WEBPAY_FORM_ID || '')) error = 'Falta configurar WEBPAY_FORM_ID del comercio.';
  if (production && (!process.env.WEBPAY_COMMERCE_CODE || !process.env.WEBPAY_API_KEY)) error = 'Faltan las credenciales de Webpay Plus producción.';
  if (production && !validAppUrl(true)) error = 'Webpay producción requiere APP_URL con HTTPS.';
  return { mode, production, configured: !error, error, formId: process.env.WEBPAY_FORM_ID || '' };
}

function validAppUrl(httpsOnly = false) {
  try {
    const url = new URL(process.env.APP_URL || '');
    if (!(httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

const PAYMENT_TYPES: Record<string, string> = { VD: 'Débito', VP: 'Prepago', VN: 'Crédito', VC: 'Crédito en cuotas', SI: '3 cuotas sin interés', S2: '2 cuotas sin interés', NC: 'N cuotas' };
const PAID_STATUSES = ['pagado', 'preparando', 'enviado', 'entregado'];
const WEBPAY_FORM_ACTION = 'https://www.webpay.cl/backpub/external/form-pay';
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const safeEqual = (a: string, b: string) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
const newOrderId = () => `PP${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

/** Per-process abuse protection. A shared limiter is needed for multiple replicas. */
class RateLimiter {
  private buckets = new Map<string, { count: number; until: number }>();
  limited(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (bucket && bucket.until > now) {
      bucket.count = Math.min(bucket.count + 1, max + 1);
      return bucket.count > max;
    }
    this.buckets.delete(key);
    if (this.buckets.size >= 10_000) {
      for (const [id, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(id);
      if (this.buckets.size >= 10_000) return true;
    }
    this.buckets.set(key, { count: 1, until: now + windowMs });
    return false;
  }
}

const asyncRoute = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res, next) => { Promise.resolve().then(() => fn(req, res)).catch(next); };

function publicOrder(order: Order, payment: ReturnType<typeof paymentConfiguration>) {
  return {
    payForm: payment.mode === 'link' && payment.configured && order.status === 'pendiente_pago'
      ? { action: WEBPAY_FORM_ACTION, idFormulario: payment.formId, monto: order.total } : undefined,
    customerEmail: order.customer.email,
    id: order.id, status: order.status, createdAt: order.createdAt, items: order.items,
    reservationExpiresAt: order.reservationExpiresAt, reservationStatus: order.reservationStatus, stockIssue: order.stockIssue,
    subtotal: order.subtotal, shipping: order.shipping, total: order.total,
    delivery: { method: order.delivery.method, region: order.delivery.region, comuna: order.delivery.comuna },
    customerName: order.customer.name.split(' ')[0],
    payment: order.payment ? { authorizationCode: order.payment.authorizationCode, paymentType: order.payment.paymentType, installments: order.payment.installments, cardLast4: order.payment.cardLast4 } : undefined,
  };
}

/** The public and admin API, used by both the Node server and Vercel. */
export function createApp(options: { webpay?: WebpayClient } = {}) {
  const app = express();
  const payment = paymentConfiguration();
  const webpay: WebpayClient | null = options.webpay || (payment.mode === 'plus' && payment.configured ? new WebpayPlus.Transaction(payment.production
    ? new Options(process.env.WEBPAY_COMMERCE_CODE!, process.env.WEBPAY_API_KEY!, Environment.Production)
    : new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration)) : null);
  const rate = new RateLimiter();
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.disable('x-powered-by');
  app.disable('etag');
  app.use(compression());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/api/admin', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  const baseUrl = (req: express.Request) => validAppUrl() || `${req.protocol}://${req.get('host')}`;
  const requireOrigin: express.RequestHandler = (req, res, next) => {
    if (!hasAllowedAdminOrigin(req, { canonicalOrigin: validAppUrl() })) {
      return res.status(403).json({ error: 'Origen de la solicitud no permitido.' });
    }
    next();
  };
  app.use('/api/admin', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return requireOrigin(req, res, next);
    next();
  });
  const requireAdmin: express.RequestHandler = (req, res, next) => {
    if (!verifySession(sessionFromCookie(req.get('cookie')))) {
      if (rate.limited(`auth:${req.ip}`, 20, 10 * 60_000)) return res.status(429).json({ error: 'Demasiados intentos. Espera 10 minutos.' });
      return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    }
    next();
  };
  const cookieOptions = (req: express.Request) => ({ httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production' || req.secure, path: '/api/admin' });
  const imageHash = (data: string) => crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  const imageUrl = (product: { id: string; image?: string }) => product.image?.startsWith('data:')
    ? `/api/products/${encodeURIComponent(product.id)}/image?v=${imageHash(product.image)}` : product.image;

  app.get('/api/products', asyncRoute(async (_req, res) => {
    res.json((await getCatalog({ fresh: true })).filter((product) => !product.hidden).map((product) => ({ ...product, image: imageUrl(product) })));
  }));
  app.get('/api/products/:id/image', asyncRoute(async (req, res) => {
    const product = (await getCatalog({ fresh: true })).find((p) => p.id === req.params.id && !p.hidden);
    const match = product?.image?.match(/^data:(image\/(?:webp|jpeg|png));base64,([\w+/=]+)$/);
    if (!match || req.query.v !== imageHash(product!.image!)) return res.status(404).end();
    res.setHeader('Content-Type', match[1]);
    res.end(Buffer.from(match[2], 'base64'));
  }));

  app.post('/api/checkout', asyncRoute(async (req, res) => {
    if (rate.limited(`checkout:${req.ip}`, 12, 60_000)) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' });
    if (!payment.configured) return res.status(503).json({ error: 'El pago aún no está configurado. Contacta a la tienda.' });
    const body = req.body || {};
    const customer = { name: str(body.customer?.name, 100), email: str(body.customer?.email, 120).toLowerCase(), phone: str(body.customer?.phone, 30) };
    if (customer.name.length < 3) return res.status(400).json({ error: 'Ingresa tu nombre completo.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return res.status(400).json({ error: 'Correo electrónico inválido.' });
    if (customer.phone.replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Teléfono inválido.' });
    const method = body.delivery?.method === 'pickup' ? 'pickup' : 'shipping';
    const delivery: Order['delivery'] = { method, notes: str(body.delivery?.notes, 300) };
    if (method === 'shipping') {
      Object.assign(delivery, { region: str(body.delivery?.region, 80), comuna: str(body.delivery?.comuna, 80), address: str(body.delivery?.address, 200) });
      if (!CHILE_REGIONS.includes(delivery.region!)) return res.status(400).json({ error: 'Selecciona una región válida.' });
      if (!delivery.comuna) return res.status(400).json({ error: 'Ingresa tu comuna.' });
      if (delivery.address!.length < 5) return res.status(400).json({ error: 'Ingresa tu dirección.' });
    }
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > 50) return res.status(400).json({ error: 'El carrito debe tener entre 1 y 50 productos.' });
    const catalog = await getCatalog({ fresh: true });
    const byId = new Map(catalog.map((product) => [product.id, product]));
    const wanted = new Map<string, number>();
    const items: OrderItem[] = [];
    for (const raw of rawItems) {
      const product = byId.get(str(raw?.productId, 40));
      const quantity = Number(raw?.quantity);
      if (!product || product.hidden) return res.status(400).json({ error: 'Un producto de tu carrito ya no está disponible.' });
      if (typeof raw?.quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: 'Cantidad inválida.' });
      const variant = getVariants(product).find((v) => v.size === str(raw?.size, 20));
      if (!variant) return res.status(400).json({ error: `El tamaño elegido de ${product.name} ya no existe. Vuelve a agregarlo.` });
      wanted.set(product.id, (wanted.get(product.id) || 0) + quantity);
      items.push({ productId: product.id, name: product.name, brand: product.brand, type: product.type, size: variant.size, unitPrice: variant.price, quantity, image: product.image && !product.image.startsWith('data:') ? product.image : undefined });
    }
    for (const [id, quantity] of wanted) {
      const product = byId.get(id)!;
      const available = stockOf(product);
      if (available < quantity) return res.status(409).json({ error: available > 0 ? `Solo quedan ${available} unidades de ${product.name}.` : `${product.name} se agotó.`, productId: id, available });
    }
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shipping = shippingCost(method, delivery.region || '');
    const now = new Date().toISOString();
    let order = await reserveOrder({ id: newOrderId(), accessKey: crypto.randomBytes(32).toString('hex'), status: 'pendiente_pago', createdAt: now, updatedAt: now, customer, delivery, items, subtotal, shipping, total: subtotal + shipping });
    if (payment.mode === 'link') {
      const emailStatus = await sendPendingOrderEmail(order);
      try { await updateOrder(order.id, { emailStatus }); } catch { console.error('[checkout] No se pudo guardar el estado del correo.'); }
      return res.json({ mode: 'link', orderId: order.id, key: order.accessKey });
    }
    try {
      const sessionId = crypto.randomBytes(16).toString('hex');
      const tx = await webpay!.create(order.id, sessionId, order.total, `${baseUrl(req)}/api/webpay/commit`);
      if (typeof tx.token !== 'string' || !tx.token || tx.token.length > 1024 || !/^https:\/\//.test(tx.url)) throw new Error('Invalid payment initialization');
      order = (await updateOrder(order.id, { payment: { token: tx.token, sessionId } }))!;
      return res.json({ mode: 'plus', url: tx.url, token: tx.token, orderId: order.id });
    } catch {
      try { await updateOrder(order.id, { status: 'cancelado' }); } catch { console.error('[checkout] No se pudo liberar la reserva del pago fallido.'); }
      return res.status(502).json({ error: 'No pudimos iniciar el pago. Intenta nuevamente en unos minutos.' });
    }
  }));

  const commitHandler = asyncRoute(async (req, res) => {
    const params = { ...req.query, ...req.body };
    const token = typeof params.token_ws === 'string' ? params.token_ws : '';
    const result = (status: string, order?: Order | null) => res.redirect(303, `/checkout/result?status=${status}${order ? `&order=${encodeURIComponent(order.id)}&key=${encodeURIComponent(order.accessKey)}` : ''}`);
    if (!webpay || payment.mode !== 'plus' || !payment.configured) return result('error');
    try {
      if (!token || params.TBK_TOKEN) {
        const orderId = typeof params.TBK_ORDEN_COMPRA === 'string' ? params.TBK_ORDEN_COMPRA : '';
        const abortToken = typeof params.TBK_TOKEN === 'string' ? params.TBK_TOKEN : '';
        const sessionId = typeof params.TBK_ID_SESION === 'string' ? params.TBK_ID_SESION : '';
        const order = orderId ? await getOrder(orderId) : null;
        if (!order || !abortToken || !sessionId || !order.payment?.token || !order.payment.sessionId || !safeEqual(abortToken, order.payment.token) || !safeEqual(sessionId, order.payment.sessionId)) return result('aborted');
        if (order.status === 'pendiente_pago') await updateOrder(order.id, { status: 'cancelado' });
        const current = await getOrder(order.id);
        return result(current && PAID_STATUSES.includes(current.status) ? 'success' : 'aborted', current);
      }
      const expected = token.length <= 1024 ? await getOrderByPaymentToken(token) : null;
      if (!expected || !expected.payment?.sessionId) return result('error');
      let response: any;
      try { response = await webpay.commit(token); } catch { response = await webpay.status(token); }
      if (response.buy_order !== expected.id || Number(response.amount) !== expected.total || response.session_id !== expected.payment.sessionId || !safeEqual(token, expected.payment.token!)) return result('error');
      if (response.status !== 'AUTHORIZED' || response.response_code !== 0) {
        if (expected.status === 'pendiente_pago') await updateOrder(expected.id, { status: 'rechazado', payment: { ...expected.payment, responseCode: response.response_code } });
        const current = await getOrder(expected.id);
        return result(current && PAID_STATUSES.includes(current.status) ? 'success' : 'rejected', current);
      }
      const { order, newlyPaid } = await confirmPaidOrder(expected.id, {
        status: 'pagado',
        payment: { token, sessionId: expected.payment.sessionId, authorizationCode: str(response.authorization_code, 30), paymentType: PAYMENT_TYPES[response.payment_type_code] || str(response.payment_type_code, 40), installments: Number(response.installments_number) || 0, cardLast4: str(response.card_detail?.card_number, 32).slice(-4), responseCode: response.response_code, transactionDate: str(response.transaction_date, 80) },
      }, { automatic: true });
      if (newlyPaid) {
        const emailStatus = await sendOrderEmails(order);
        try { await updateOrder(order.id, { emailStatus }); } catch { console.error('[webpay] No se pudo guardar el estado del correo.'); }
      }
      return result('success', order);
    } catch {
      console.error('[webpay] No se pudo procesar el retorno de pago.');
      return result('error');
    }
  });
  app.get('/api/webpay/commit', commitHandler);
  app.post('/api/webpay/commit', commitHandler);

  app.get('/api/orders/:id', asyncRoute(async (req, res) => {
    const order = await getOrder(str(req.params.id, 40));
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!order || !key || key.length > 128 || !safeEqual(key, order.accessKey)) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(publicOrder(order, payment));
  }));

  app.post('/api/admin/login', (req, res) => {
    if (rate.limited(`login:${req.ip}`, 8, 10 * 60_000)) return res.status(429).json({ error: 'Demasiados intentos. Espera 10 minutos.' });
    if (!adminPasswordConfigured() || !adminSessionConfigured()) return res.status(503).json({ error: 'Falta configurar ADMIN_PASSWORD (12 a 200 caracteres) y ADMIN_SESSION_SECRET (mínimo 32 en producción).' });
    if (!checkPassword(req.body?.password)) return res.status(401).json({ error: 'Contraseña incorrecta.' });
    res.cookie(ADMIN_SESSION_COOKIE, createSession(), { ...cookieOptions(req), maxAge: ADMIN_SESSION_SECONDS * 1000 });
    res.json({ ok: true });
  });
  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions(_req));
    res.json({ ok: true });
  });
  app.get('/api/admin/session', requireAdmin, (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/products', requireAdmin, asyncRoute(async (_req, res) => res.json(await getCatalog({ fresh: true }))));
  app.patch('/api/admin/products/:id', requireAdmin, asyncRoute(async (req, res) => res.json((await adminProducts.updateProduct(req.params.id, req.body || {})) ?? { ok: true })));
  app.post('/api/admin/products', requireAdmin, asyncRoute(async (req, res) => res.json((await adminProducts.createProduct(req.body || {})) ?? { ok: true })));
  app.post('/api/admin/products/seed', requireAdmin, asyncRoute(async (_req, res) => res.json({ changes: await adminProducts.seedProducts() })));
  app.post('/api/admin/products/apply-prices', requireAdmin, asyncRoute(async (_req, res) => res.json({ updated: await adminProducts.applyPriceList() })));
  app.get('/api/admin/status', requireAdmin, asyncRoute(async (_req, res) => {
    res.json({ email: { configured: smtpConfigured(), notifyTo: NOTIFY_EMAIL }, webpay: { mode: payment.mode === 'link' ? 'boton' : payment.production ? 'produccion' : 'integracion', formId: payment.formId, configured: payment.configured, error: payment.error }, storage: await storageStatus(), adminConfigured: adminPasswordConfigured(), sessionConfigured: adminSessionConfigured() });
  }));
  app.get('/api/admin/orders', requireAdmin, asyncRoute(async (_req, res) => res.json(await listOrders())));
  app.patch('/api/admin/orders/:id', requireAdmin, asyncRoute(async (req, res) => {
    if (req.body?.stockApplied !== undefined) return res.status(400).json({ error: 'El descuento de stock lo controla el servidor.' });
    const updates: Partial<Order> = {};
    if (req.body?.status !== undefined) {
      if (!Object.hasOwn(ORDER_STATUSES, req.body.status)) return res.status(400).json({ error: 'Estado inválido.' });
      updates.status = req.body.status as OrderStatus;
    }
    if (typeof req.body?.tracking === 'string') updates.tracking = str(req.body.tracking, 120);
    if (typeof req.body?.adminNotes === 'string') updates.adminNotes = str(req.body.adminNotes, 1000);
    if (updates.status && PAID_STATUSES.includes(updates.status)) {
      const { order, newlyPaid } = await confirmPaidOrder(req.params.id, updates);
      if (newlyPaid) {
        const emailStatus = await sendCustomerConfirmation(order);
        try { return res.json((await updateOrder(order.id, { emailStatus })) || { ...order, emailStatus }); }
        catch { console.error('[admin] No se pudo guardar el estado del correo de confirmación.'); return res.json({ ...order, emailStatus }); }
      }
      return res.json(order);
    }
    const order = await updateOrder(req.params.id, updates);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(order);
  }));
  app.post('/api/admin/orders/:id/resend', requireAdmin, asyncRoute(async (req, res) => {
    const order = await getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!PAID_STATUSES.includes(order.status)) return res.status(409).json({ error: 'Solo puedes reenviar la confirmación de un pedido pagado.' });
    const emailStatus = await sendOrderEmails(order);
    await updateOrder(order.id, { emailStatus });
    res.json({ emailStatus });
  }));
  app.post('/api/admin/test-email', requireAdmin, asyncRoute(async (_req, res) => { await sendTestEmail(); res.json({ ok: true }); }));
  app.post('/api/admin/catalog/refresh', requireAdmin, (_req, res) => { invalidateCatalog(); res.json({ ok: true }); });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));
  app.use('/api', (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return _next(error);
    const status = [400, 404, 409, 413, 503].includes(error?.status) ? error.status : 500;
    if (status === 500) console.error('[api] Falló una operación del servidor.');
    const message = status === 500 ? 'No pudimos completar la operación. Intenta nuevamente.' : status === 413 ? 'La solicitud es demasiado grande.' : error.type === 'entity.parse.failed' ? 'Solicitud inválida.' : error.message;
    res.status(status).json({ error: message, ...(status === 409 ? { productId: error.productId, available: error.available } : {}) });
  });
  return app;
}

export function paymentSummary() {
  const config = paymentConfiguration();
  if (!config.configured) return `NO configurado: ${config.error}`;
  return config.mode === 'link' ? `botón Webpay.cl (confirmación manual)` : config.production ? 'Webpay Plus PRODUCCIÓN' : 'Webpay Plus integración (pruebas)';
}
