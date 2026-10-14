import { getVariants, shippingCost, stockOf, ORDER_STATUSES, type Order, type OrderStatus } from '../src/lib/catalog.js';
import {
  ConfigurationError, InventoryConflictError, ValidationError,
  expireReservations, readOrder, readProducts, storageConfiguration,
  transaction, writeOrder, writeProduct, type Connection,
} from './database.js';

export const storageMode = () => storageConfiguration().mode;
const PAID: OrderStatus[] = ['pagado', 'preparando', 'enviado', 'entregado'];
const isPaid = (order: Order) => !!order.paidAt || PAID.includes(order.status);

function quantitiesOf(order: Order) {
  if (!Array.isArray(order.items) || !order.items.length || order.items.length > 50) throw new ValidationError('El carrito es inválido.');
  const quantities = new Map<string, number>();
  for (const item of order.items) {
    if (!item || typeof item.productId !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new ValidationError('La cantidad debe ser un entero entre 1 y 20.');
    }
    const quantity = (quantities.get(item.productId) || 0) + item.quantity;
    if (quantity > 20) throw new ValidationError('El máximo es 20 unidades por producto.');
    quantities.set(item.productId, quantity);
  }
  return quantities;
}

function reservationTtl() {
  const minutes = Number(process.env.RESERVATION_TTL_MINUTES || 30);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw new ConfigurationError('RESERVATION_TTL_MINUTES debe ser mayor a 0 y menor o igual a 1440.');
  return minutes * 60_000;
}

export async function reserveOrder(order: Order): Promise<Order> {
  if (!order || !/^[a-zA-Z0-9_-]{1,80}$/.test(order.id) || !order.accessKey || order.status !== 'pendiente_pago') throw new ValidationError('Pedido inválido.');
  const quantities = quantitiesOf(order);
  const expiresAt = Date.now() + reservationTtl();
  return transaction(async (db) => {
    await expireReservations(db);
    if (await readOrder(db, order.id)) throw new ValidationError('El pedido ya existe.', 409);
    const catalog = new Map((await readProducts(db)).map((product) => [product.id, product]));
    for (const [id, quantity] of quantities) {
      const product = catalog.get(id);
      if (!product || product.hidden) throw new InventoryConflictError(id, 0, 'Un producto del carrito ya no está disponible.');
      const available = stockOf(product);
      if (available < quantity) throw new InventoryConflictError(id, available, `Solo quedan ${available} unidades de ${product.name}.`);
    }
    for (const item of order.items) {
      const variant = getVariants(catalog.get(item.productId)!).find((entry) => entry.size === item.size);
      if (!variant || !Number.isSafeInteger(item.unitPrice) || item.unitPrice <= 0 || variant.price !== item.unitPrice) {
        throw new InventoryConflictError(item.productId, stockOf(catalog.get(item.productId)!), 'El precio o tamaño cambió. Actualiza el carrito para continuar.');
      }
    }
    const subtotal = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const shipping = shippingCost(order.delivery.method, order.delivery.region || '');
    if (![order.subtotal, order.shipping, order.total].every(Number.isSafeInteger) || order.subtotal !== subtotal || order.shipping !== shipping || order.total !== subtotal + shipping) {
      throw new ValidationError('El total del pedido es inválido.');
    }
    const stored: Order = { ...order, stockApplied: false, reservationStatus: 'active', reservationExpiresAt: new Date(expiresAt).toISOString() };
    delete stored.stockIssue; delete stored.paidAt;
    await writeOrder(db, stored);
    for (const [id, quantity] of quantities) {
      await db.query('INSERT INTO reservations(order_id, product_id, quantity, expires_at) VALUES (?, ?, ?, ?)', [order.id, id, quantity, expiresAt]);
    }
    return stored;
  });
}

/** Compatibility helper for new checkout orders. Existing records are immutable. */
export async function saveOrder(order: Order) { return reserveOrder(order); }

export async function getOrder(id: string): Promise<Order | null> {
  return transaction(async (db) => { await expireReservations(db); return readOrder(db, id); });
}

export async function getOrderByPaymentToken(token: string): Promise<Order | null> {
  if (!token || typeof token !== 'string') return null;
  return transaction(async (db) => {
    await expireReservations(db);
    const [row] = await db.query('SELECT data FROM orders WHERE payment_token = ?', [token]);
    return row ? JSON.parse(row.data) as Order : null;
  });
}

async function releaseReservation(db: Connection, order: Order) {
  await db.query('DELETE FROM reservations WHERE order_id = ?', [order.id]);
  if (order.reservationStatus === 'active') order.reservationStatus = 'released';
}

function allowedChanges(updates: Partial<Order>): Partial<Order> {
  const allowed = new Set(['status', 'tracking', 'adminNotes', 'emailStatus', 'payment']);
  for (const key of Object.keys(updates)) if (!allowed.has(key)) throw new ValidationError(`El campo ${key} no puede modificarse directamente.`);
  const out: Partial<Order> = {};
  if (updates.tracking !== undefined) {
    if (typeof updates.tracking !== 'string') throw new ValidationError('Seguimiento inválido.');
    out.tracking = updates.tracking.trim().slice(0, 120);
  }
  if (updates.adminNotes !== undefined) {
    if (typeof updates.adminNotes !== 'string') throw new ValidationError('Notas inválidas.');
    out.adminNotes = updates.adminNotes.trim().slice(0, 1000);
  }
  if (updates.emailStatus !== undefined) {
    if (!['enviado', 'error', 'no_configurado'].includes(updates.emailStatus)) throw new ValidationError('Estado de correo inválido.');
    out.emailStatus = updates.emailStatus;
  }
  if (updates.status !== undefined) {
    if (!Object.hasOwn(ORDER_STATUSES, updates.status)) throw new ValidationError('Estado de pedido inválido.');
    out.status = updates.status;
  }
  if (updates.payment !== undefined) {
    if (!updates.payment || typeof updates.payment !== 'object' || Array.isArray(updates.payment)) throw new ValidationError('Datos de pago inválidos.');
    out.payment = updates.payment;
  }
  return out;
}

function validateTransition(order: Order, next: OrderStatus) {
  if (next === order.status) return;
  if (order.status === 'pendiente_pago' && ['cancelado', 'rechazado'].includes(next)) return;
  if (PAID.includes(order.status) && PAID.includes(next) && PAID.indexOf(next) > PAID.indexOf(order.status)) {
    if (order.stockIssue || !order.stockApplied) throw new ValidationError('Resuelve primero el problema de stock del pago confirmado.', 409);
    return;
  }
  throw new ValidationError('Ese cambio de estado no está permitido. Confirma los pagos mediante la operación de pago.', 409);
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
  const changes = allowedChanges(updates);
  return transaction(async (db) => {
    await expireReservations(db);
    const order = await readOrder(db, id);
    if (!order) return null;
    if (changes.status) validateTransition(order, changes.status);
    if (changes.payment && isPaid(order)) throw new ValidationError('Los datos de un pago confirmado no pueden cambiarse.', 409);
    if (changes.payment?.token && order.payment?.token && changes.payment.token !== order.payment.token) throw new ValidationError('El token de pago del pedido no puede reemplazarse.', 409);
    const next: Order = { ...order, ...changes, updatedAt: new Date().toISOString() };
    if (changes.payment) next.payment = { ...order.payment, ...changes.payment };
    if (next.status === 'cancelado' || next.status === 'rechazado') await releaseReservation(db, next);
    await writeOrder(db, next);
    return next;
  });
}

export async function listOrders(limit = 300): Promise<Order[]> {
  const count = Math.max(1, Math.min(1000, Number.isInteger(limit) ? limit : 300));
  return transaction(async (db) => {
    await expireReservations(db);
    const rows = await db.query('SELECT data FROM orders ORDER BY created_at DESC LIMIT ?', [count]);
    return rows.map((row) => JSON.parse(row.data) as Order);
  });
}

/** Confirms payment, physical inventory and stockApplied in one transaction.
 * A late automatic capture is recorded even if its expired reservation was
 * consumed by another buyer. Manual confirmations fail before making changes. */
export async function confirmPaidOrder(id: string, updates: Partial<Order> = {}, options: { automatic?: boolean } = {}): Promise<{ order: Order; newlyPaid: boolean }> {
  const changes = allowedChanges(updates);
  if (changes.status && !PAID.includes(changes.status)) throw new ValidationError('Estado de pago inválido.');
  return transaction(async (db) => {
    await expireReservations(db);
    const order = await readOrder(db, id);
    if (!order) throw new ValidationError('Pedido no encontrado.', 404);
    const previouslyPaid = isPaid(order);
    if (previouslyPaid && order.stockApplied) {
      // Automatic callbacks are immutable retries. Admin fulfillment edits
      // still need to persist, without applying stock or sending email again.
      if (options.automatic) return { order, newlyPaid: false };
      if (changes.payment) throw new ValidationError('Los datos de un pago confirmado no pueden cambiarse.', 409);
      if (changes.status) validateTransition(order, changes.status);
      const next = { ...order, ...changes, updatedAt: new Date().toISOString() };
      await writeOrder(db, next);
      return { order: next, newlyPaid: false };
    }
    if (previouslyPaid && order.stockIssue && options.automatic) return { order, newlyPaid: false };
    if (previouslyPaid && changes.payment) throw new ValidationError('Los datos de un pago confirmado no pueden cambiarse.', 409);
    if (changes.payment?.token && order.payment?.token && changes.payment.token !== order.payment.token) throw new ValidationError('El token de pago del pedido no puede reemplazarse.', 409);
    if (!options.automatic && !previouslyPaid && order.status !== 'pendiente_pago') throw new ValidationError('Un pedido cancelado o rechazado no puede confirmarse manualmente.', 409);
    const quantities = quantitiesOf(order);
    const catalog = new Map((await readProducts(db)).map((product) => [product.id, product]));
    const ownRows = await db.query('SELECT product_id, quantity FROM reservations WHERE order_id = ?', [id]);
    const own = new Map(ownRows.map((row) => [row.product_id, Number(row.quantity)]));
    let conflict: InventoryConflictError | null = null;
    for (const [productId, quantity] of quantities) {
      const product = catalog.get(productId);
      const available = product ? stockOf(product) + (own.get(productId) || 0) : 0;
      if (available < quantity) {
        conflict = new InventoryConflictError(productId, available, `La reserva venció o no hay stock suficiente de ${product?.name || productId}. Hay ${available} unidades; se necesitan ${quantity}. Repón el stock o resuelve el pago con el cliente.`);
        break;
      }
    }
    if (conflict && !options.automatic) throw conflict;
    const next: Order = {
      ...order, ...changes,
      status: previouslyPaid ? order.status : (changes.status || 'pagado'),
      paidAt: order.paidAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payment: changes.payment ? { ...order.payment, ...changes.payment } : order.payment,
    };
    if (conflict) {
      next.stockApplied = false; next.stockIssue = conflict.message;
      await releaseReservation(db, next);
    } else {
      for (const [productId, quantity] of quantities) {
        const product = catalog.get(productId)!;
        const stockCount = product.stockCount! - quantity;
        await writeProduct(db, { ...product, stockCount, stock: stockCount > 0 ? 'DISPONIBLE' : 'AGOTADO' });
      }
      await db.query('DELETE FROM reservations WHERE order_id = ?', [id]);
      next.stockApplied = true; next.reservationStatus = 'consumed'; delete next.stockIssue;
      if (previouslyPaid && changes.status) {
        validateTransition({ ...order, stockApplied: true, stockIssue: undefined }, changes.status);
        next.status = changes.status;
      }
    }
    await writeOrder(db, next);
    return { order: next, newlyPaid: !previouslyPaid };
  });
}

export const confirmOrderPayment = confirmPaidOrder;
export async function applyStock(order: Order): Promise<boolean> {
  if (order.stockApplied) return false;
  const result = await confirmPaidOrder(order.id);
  return !!result.order.stockApplied;
}
