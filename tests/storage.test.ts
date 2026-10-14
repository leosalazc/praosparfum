import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import type { Order } from '../src/lib/catalog.js';

const temporary = await mkdtemp(join(tmpdir(), 'praos-storage-'));
const postgres = process.env.PRAOS_TEST_POSTGRES === '1';
const postgresUrl = postgres ? process.env.DATABASE_URL : undefined;
const postgresSchema = `praos_storage_${randomBytes(8).toString('hex')}`;
let schemaPool: Pool | undefined;
process.env.NODE_ENV = 'test';
process.env.SQLITE_FILE = join(temporary, 'shop.sqlite');
process.env.RESERVATION_TTL_MINUTES = '30';
if (!postgres) delete process.env.DATABASE_URL;

let database: typeof import('../server/database.js');
let catalog: typeof import('../server/catalog.js');
let products: typeof import('../server/products.js');
let orders: typeof import('../server/orders.js');
let sequence = 0;

before(async () => {
  if (postgres) {
    assert(postgresUrl, 'PostgreSQL tests need an injected DATABASE_URL');
    schemaPool = new Pool({ connectionString: postgresUrl });
    await schemaPool.query(`CREATE SCHEMA ${postgresSchema}`);
    const isolated = new URL(postgresUrl);
    isolated.searchParams.set('options', `-csearch_path=${postgresSchema}`);
    process.env.DATABASE_URL = isolated.toString();
  }
  database = await import('../server/database.js');
  catalog = await import('../server/catalog.js');
  products = await import('../server/products.js');
  orders = await import('../server/orders.js');
});

after(async () => {
  await database?.closeDatabase();
  if (schemaPool) {
    await schemaPool.query(`DROP SCHEMA ${postgresSchema} CASCADE`);
    await schemaPool.end();
  }
  await rm(temporary, { recursive: true, force: true });
});

async function product(stockCount = 1, changes: Record<string, unknown> = {}) {
  const id = `U${80000 + ++sequence}`;
  const input = { id, name: `Storage perfume ${sequence}`, type: 'AUTOR', brand: 'Prueba', stockCount, variants: [{ size: '60ml', price: 15000 }], ...changes };
  await products.createProduct(input);
  return input;
}

function makeOrder(productId: string, changes: Partial<Order> = {}): Order {
  const createdAt = new Date().toISOString();
  const items = changes.items || [{ productId, name: 'Storage perfume', type: 'AUTOR', size: '60ml', unitPrice: 15000, quantity: 1 }];
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return {
    id: `STORAGE_${randomBytes(16).toString('hex')}`, accessKey: randomBytes(32).toString('hex'),
    status: 'pendiente_pago', createdAt, updatedAt: createdAt,
    customer: { name: 'Cliente de Prueba', email: 'customer@example.test', phone: '+56912345678' },
    delivery: { method: 'pickup' }, items, subtotal, shipping: 0, total: subtotal, ...changes,
  };
}

async function storedProduct(id: string) {
  const found = (await catalog.getCatalog()).find((entry) => entry.id === id);
  assert(found);
  return found;
}

async function expireAllReservations() {
  await database.transaction((connection) => database.expireReservations(connection, Date.now() + 31 * 60_000));
}

test('atomic reservations serialize concurrent buyers and recover after a rejected transaction', async () => {
  const item = await product(1);
  const attempts = Array.from({ length: 8 }, () => makeOrder(item.id));
  const results = await Promise.allSettled(attempts.map((order) => orders.reserveOrder(order)));
  const successful = results.filter((result) => result.status === 'fulfilled');
  assert.equal(successful.length, 1);
  for (const rejected of results.filter((result) => result.status === 'rejected')) {
    assert.equal((rejected as PromiseRejectedResult).reason.status, 409);
  }
  const winner = (successful[0] as PromiseFulfilledResult<Order>).value;
  const physical = await storedProduct(item.id);
  assert.equal(physical.stockCount, 1);
  assert.equal(physical.reservedCount, 1);
  assert.equal(physical.availableCount, 0);
  await assert.rejects(orders.reserveOrder(winner), { status: 409 });
  await orders.updateOrder(winner.id, { status: 'cancelado' });
  assert.equal((await storedProduct(item.id)).availableCount, 1);
  const retry = await orders.reserveOrder(makeOrder(item.id));
  assert.equal(retry.reservationStatus, 'active');
  await orders.updateOrder(retry.id, { status: 'cancelado' });
});

test('variants share inventory and concurrent confirmations consume each order exactly once', async () => {
  const item = await product(2, { variants: [{ size: '60ml', price: 15000 }, { size: '100ml', price: 20000 }] });
  const pending = await orders.reserveOrder(makeOrder(item.id, { items: [
    { productId: item.id, name: item.name, type: 'AUTOR', size: '60ml', unitPrice: 15000, quantity: 1 },
    { productId: item.id, name: item.name, type: 'AUTOR', size: '100ml', unitPrice: 20000, quantity: 1 },
  ] }));
  assert.equal((await storedProduct(item.id)).reservedCount, 2);
  const confirmations = await Promise.all(Array.from({ length: 10 }, () => orders.confirmPaidOrder(pending.id)));
  assert.equal(confirmations.filter((value) => value.newlyPaid).length, 1);
  for (const confirmation of confirmations) assert.equal(confirmation.order.stockApplied, true);
  const physical = await storedProduct(item.id);
  assert.equal(physical.stockCount, 0);
  assert.equal(physical.availableCount, 0);
  assert.equal(physical.reservedCount, 0);
  const paid = await orders.getOrder(pending.id);
  assert.equal(paid?.status, 'pagado');
  assert.equal(paid?.reservationStatus, 'consumed');
  assert(paid?.paidAt);
});

test('expired reservations release stock and late payment is recorded without stealing another buyer inventory', async () => {
  const item = await product(1);
  const expired = await orders.reserveOrder(makeOrder(item.id));
  await expireAllReservations();
  assert.equal((await orders.getOrder(expired.id))?.reservationStatus, 'expired');
  assert.equal((await storedProduct(item.id)).availableCount, 1);
  const later = await orders.reserveOrder(makeOrder(item.id));
  await assert.rejects(orders.confirmPaidOrder(expired.id), { status: 409 });
  const unchanged = await orders.getOrder(expired.id);
  assert.equal(unchanged?.status, 'pendiente_pago');
  assert.equal(unchanged?.paidAt, undefined);
  await orders.confirmPaidOrder(later.id);
  const captured = await orders.confirmPaidOrder(expired.id, {}, { automatic: true });
  assert.equal(captured.newlyPaid, true);
  assert.equal(captured.order.status, 'pagado');
  assert.equal(captured.order.stockApplied, false);
  assert(captured.order.stockIssue);
  assert.equal((await storedProduct(item.id)).stockCount, 0);
  const replay = await orders.confirmPaidOrder(expired.id, {}, { automatic: true });
  assert.equal(replay.newlyPaid, false);
  assert.equal(replay.order.stockApplied, false);
  assert.equal((await storedProduct(item.id)).stockCount, 0);
  await products.updateProduct(item.id, { stockCount: 1 });
  const reconciled = await orders.confirmPaidOrder(expired.id);
  assert.equal(reconciled.newlyPaid, false);
  assert.equal(reconciled.order.stockApplied, true);
  assert.equal(reconciled.order.stockIssue, undefined);
  assert.equal((await storedProduct(item.id)).stockCount, 0);
});

test('cancelled and rejected orders release reservations and cannot be manually promoted into paid orders', async () => {
  const item = await product(1);
  for (const status of ['cancelado', 'rechazado'] as const) {
    const pending = await orders.reserveOrder(makeOrder(item.id));
    const stopped = await orders.updateOrder(pending.id, { status });
    assert.equal(stopped?.reservationStatus, 'released');
    assert.equal((await storedProduct(item.id)).stockCount, 1);
    assert.equal((await storedProduct(item.id)).availableCount, 1);
    await assert.rejects(orders.confirmPaidOrder(pending.id), { status: 409 });
    assert.equal((await orders.getOrder(pending.id))?.status, status);
  }
});

test('pending orders protect reserved stock, trusted totals and internal inventory flags', async () => {
  const item = await product(2);
  const pending = await orders.reserveOrder(makeOrder(item.id));
  await assert.rejects(products.updateProduct(item.id, { stockCount: 0 }), { status: 409 });
  await assert.rejects(products.decrementStock([{ productId: item.id, quantity: 2 }]), { status: 409 });
  await assert.rejects(orders.updateOrder(pending.id, { stockApplied: true }), { status: 400 });
  await assert.rejects(orders.updateOrder(pending.id, { status: 'pagado' }), { status: 409 });
  const tampered = makeOrder(item.id, { total: 1 });
  await assert.rejects(orders.reserveOrder(tampered), { status: 400 });
  assert.equal(await orders.getOrder(tampered.id), null);
  assert.equal((await storedProduct(item.id)).reservedCount, 1);
  await orders.updateOrder(pending.id, { status: 'cancelado' });
  const stalePrice = makeOrder(item.id);
  await products.updateProduct(item.id, { variants: [{ size: '60ml', price: 18000 }] });
  await assert.rejects(orders.reserveOrder(stalePrice), { status: 409 });
  assert.equal((await storedProduct(item.id)).reservedCount, 0);
});

test('products, reservations and payment tokens survive database reconnect without reseeding stock', async () => {
  const item = await product(4);
  const pending = await orders.reserveOrder(makeOrder(item.id));
  const token = randomBytes(32).toString('hex');
  await orders.updateOrder(pending.id, { payment: { token, sessionId: randomBytes(16).toString('hex') } });
  await products.updateProduct(item.id, { name: 'Persisted name', hidden: true });
  await database.closeDatabase();
  const reloaded = await storedProduct(item.id);
  assert.equal(reloaded.name, 'Persisted name');
  assert.equal(reloaded.hidden, true);
  assert.equal(reloaded.stockCount, 4);
  assert.equal(reloaded.reservedCount, 1);
  assert.equal(reloaded.availableCount, 3);
  assert.equal((await orders.getOrderByPaymentToken(token))?.id, pending.id);
  assert.equal((await orders.getOrder(pending.id))?.customer.email, 'customer@example.test');
  assert.equal(await products.seedProducts(), 0);
  assert.equal((await storedProduct(item.id)).stockCount, 4);
});

test('a stale administrator stock edit cannot overwrite the inventory decrement of a new purchase', async () => {
  const item = await product(2);
  const snapshot = await storedProduct(item.id);
  const pending = await orders.reserveOrder(makeOrder(item.id));
  await orders.confirmPaidOrder(pending.id);
  assert.equal((await storedProduct(item.id)).stockCount, 1);
  await assert.rejects(products.updateProduct(item.id, { stockCount: 3, expectedStockCount: snapshot.stockCount }), { status: 409 });
  assert.equal((await storedProduct(item.id)).stockCount, 1);
  await products.updateProduct(item.id, { stockCount: 3, expectedStockCount: 1 });
  assert.equal((await storedProduct(item.id)).stockCount, 3);
});
