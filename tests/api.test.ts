import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';

const temporary = await mkdtemp(join(tmpdir(), 'praos-api-'));
const password = randomBytes(24).toString('base64url');
process.env.NODE_ENV = 'test';
process.env.SQLITE_FILE = join(temporary, 'shop.sqlite');
process.env.ADMIN_PASSWORD = password;
process.env.ADMIN_SESSION_SECRET = randomBytes(48).toString('base64url');
process.env.WEBPAY_ENV = 'integration';
const postgres = process.env.PRAOS_TEST_POSTGRES === '1';
const postgresUrl = postgres ? process.env.DATABASE_URL : undefined;
const postgresSchema = `praos_api_${randomBytes(8).toString('hex')}`;
let schemaPool: Pool | undefined;
if (!postgres) delete process.env.DATABASE_URL;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

let createApp: typeof import('../server/app.js').createApp;
let closeDatabase: (() => Promise<void> | void) | undefined;
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
  ({ createApp } = await import('../server/app.js'));
  const database = await import('../server/database.js');
  closeDatabase = database.closeDatabase;
});

after(async () => {
  await closeDatabase?.();
  if (schemaPool) {
    await schemaPool.query(`DROP SCHEMA ${postgresSchema} CASCADE`);
    await schemaPool.end();
  }
  await rm(temporary, { recursive: true, force: true });
});

type Transaction = {
  buy_order: string;
  session_id: string;
  amount: number;
  status: string;
  response_code: number;
  authorization_code: string;
  payment_type_code: string;
  installments_number: number;
  card_detail: { card_number: string };
  transaction_date: string;
};

class FakeWebpay {
  transactions = new Map<string, Transaction>();
  createFails = false;
  commitCalls = 0;

  async create(buyOrder: string, sessionId: string, amount: number, returnUrl: string) {
    if (this.createFails) throw new Error('Simulated payment service outage');
    assert.match(returnUrl, /^http:\/\/127\.0\.0\.1:\d+\/api\/webpay\/commit$/);
    const token = randomBytes(32).toString('hex');
    this.transactions.set(token, {
      buy_order: buyOrder, session_id: sessionId, amount,
      status: 'AUTHORIZED', response_code: 0, authorization_code: 'TESTONLY',
      payment_type_code: 'VD', installments_number: 0,
      card_detail: { card_number: '1234' }, transaction_date: new Date().toISOString(),
    });
    return { token, url: 'https://payment.example.test' };
  }

  async commit(token: string) {
    this.commitCalls++;
    const transaction = this.transactions.get(token);
    if (!transaction) throw new Error('Unknown simulated token');
    return transaction;
  }

  async status(token: string) {
    const transaction = this.transactions.get(token);
    if (!transaction) throw new Error('Unknown simulated token');
    return transaction;
  }
}

type ApiResponse = { status: number; data: any; headers: Headers };
type Harness = {
  url: string;
  cookie: string;
  webpay: FakeWebpay;
  request: (path: string, options?: { method?: string; body?: unknown; admin?: boolean; origin?: string | null; raw?: string }) => Promise<ApiResponse>;
  close: () => Promise<void>;
};

async function harness(): Promise<Harness> {
  const webpay = new FakeWebpay();
  const server: Server = createServer(createApp({ webpay }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  process.env.APP_URL = url;
  let cookie = '';
  const request: Harness['request'] = async (path, options = {}) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined || options.raw !== undefined) headers['Content-Type'] = 'application/json';
    if (options.admin && cookie) headers.Cookie = cookie;
    if (options.origin !== null) headers.Origin = options.origin ?? url;
    const response = await fetch(url + path, {
      method: options.method || 'GET', headers,
      body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      redirect: 'manual', signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
    return { status: response.status, data, headers: response.headers };
  };
  const login = await request('/api/admin/login', { method: 'POST', body: { password } });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  assert(cookie, 'Successful login must issue a cookie');
  return {
    url, cookie, webpay, request,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

async function product(h: Harness, stockCount = 3, changes: Record<string, unknown> = {}) {
  const id = `M${90000 + ++sequence}`;
  const input = { id, name: `Test perfume ${sequence}`, brand: 'Test brand', type: 'DISEÑADOR', stockCount, variants: [{ size: '60ml', price: 15000 }], ...changes };
  const created = await h.request('/api/admin/products', { method: 'POST', body: input, admin: true });
  assert([200, 201].includes(created.status), JSON.stringify(created.data));
  return input;
}

function checkoutBody(id: string, quantity: unknown = 1, changes: Record<string, unknown> = {}) {
  return {
    customer: { name: 'Cliente de Prueba', email: 'customer@example.test', phone: '+56912345678' },
    delivery: { method: 'pickup' },
    items: [{ productId: id, size: '60ml', quantity }],
    ...changes,
  };
}

async function order(h: Harness, id: string) {
  const orders = await h.request('/api/admin/orders', { admin: true });
  assert.equal(orders.status, 200);
  const value = orders.data.find((candidate: any) => candidate.id === id);
  assert(value, `Order ${id} must persist`);
  return value;
}

async function catalogProduct(h: Harness, id: string, admin = false) {
  const response = await h.request(admin ? '/api/admin/products' : '/api/products', { admin });
  assert.equal(response.status, 200);
  return response.data.find((candidate: any) => candidate.id === id);
}

test('administrator uses an HttpOnly session cookie and enforces authorization and request origin', async () => {
  const h = await harness();
  try {
    assert.equal((await h.request('/api/admin/products')).status, 401);
    assert.equal((await h.request('/api/admin/products', { method: 'POST', body: {} })).status, 401);
    const wrong = await h.request('/api/admin/login', { method: 'POST', body: { password: 'incorrect-password' } });
    assert.equal(wrong.status, 401);
    const login = await h.request('/api/admin/login', { method: 'POST', body: { password } });
    assert.equal(login.status, 200);
    assert.equal(login.data.token, undefined);
    assert(!JSON.stringify(login.data).includes(password));
    const setCookie = login.headers.get('set-cookie') || '';
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert(!setCookie.includes(password));
    assert.equal((await h.request('/api/admin/session', { admin: true })).status, 200);
    const item = await product(h);
    const hostile = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, origin: 'https://attacker.example.test', body: { stockCount: 100 } });
    assert.equal(hostile.status, 403);
    const absent = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, origin: null, body: { stockCount: 100 } });
    assert.equal(absent.status, 403);
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 3);
    const logout = await h.request('/api/admin/logout', { method: 'POST', admin: true });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  } finally { await h.close(); }
});

test('product edits persist across application restart and hidden products stay private', async () => {
  let h = await harness();
  try {
    const item = await product(h);
    const edited = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, body: { name: 'Nombre actualizado', variants: [{ size: '60ml', price: 32100 }], stockCount: 7 } });
    assert.equal(edited.status, 200);
    const published = await catalogProduct(h, item.id);
    assert.equal(published.name, 'Nombre actualizado');
    assert.equal(published.variants[0].price, 32100);
    assert.equal(published.stockCount, 7);
    const hide = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, body: { hidden: true } });
    assert.equal(hide.status, 200);
    assert.equal(await catalogProduct(h, item.id), undefined);
    assert.equal((await catalogProduct(h, item.id, true)).hidden, true);
    assert.equal((await h.request('/api/products')).headers.get('cache-control')?.includes('no-store'), true);
    await h.close();
    await closeDatabase?.();
    h = await harness();
    const reloaded = await catalogProduct(h, item.id, true);
    assert.equal(reloaded.name, 'Nombre actualizado');
    assert.equal(reloaded.variants[0].price, 32100);
    assert.equal(reloaded.stockCount, 7);
    assert.equal(reloaded.hidden, true);
  } finally { await h.close(); }
});

test('admin rejects invalid prices, inventory quantities and duplicate variants', async () => {
  const h = await harness();
  try {
    const item = await product(h);
    for (const price of [0, -1, 15000.5, null, '15000']) {
      const response = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, body: { variants: [{ size: '60ml', price }] } });
      assert.equal(response.status, 400, `Invalid price ${JSON.stringify(price)} must fail`);
      assert.equal(typeof response.data.error, 'string');
    }
    for (const stockCount of [-1, 1.5, null, '3']) {
      const response = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, body: { stockCount } });
      assert.equal(response.status, 400, `Invalid stock ${JSON.stringify(stockCount)} must fail`);
    }
    const duplicate = await h.request(`/api/admin/products/${item.id}`, { method: 'PATCH', admin: true, body: { variants: [{ size: '60ml', price: 15000 }, { size: '60ml', price: 16000 }] } });
    assert.equal(duplicate.status, 400);
    assert.equal((await catalogProduct(h, item.id, true)).variants[0].price, 15000);
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 3);
  } finally { await h.close(); }
});

test('checkout recalculates trusted prices and rejects invalid quantities, unavailable products and lookup keys', async () => {
  const h = await harness();
  try {
    const item = await product(h, 20);
    const response = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id, 2, { amount: 1, total: 1, subtotal: 1, items: [{ productId: item.id, size: '60ml', quantity: 2, price: 1, unitPrice: 1 }] }) });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const saved = await order(h, response.data.orderId);
    assert.equal(saved.total, 30000);
    assert.equal(saved.subtotal, 30000);
    assert.equal(saved.items[0].unitPrice, 15000);
    assert.equal(h.webpay.transactions.get(response.data.token)?.amount, 30000);
    const publicLookup = await h.request(`/api/orders/${saved.id}?key=${saved.accessKey}`);
    assert.equal(publicLookup.status, 200);
    assert.equal(publicLookup.data.accessKey, undefined);
    assert.equal(publicLookup.data.customer?.phone, undefined);
    assert.equal((await h.request(`/api/orders/${saved.id}?key=incorrect`)).status, 404);
    assert.equal((await h.request(`/api/orders/${saved.id}`)).status, 404);
    for (const quantity of [-1, 0, 1.5, '1', 21, null]) {
      const invalid = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id, quantity) });
      assert.equal(invalid.status, 400, `Invalid checkout quantity ${JSON.stringify(quantity)} must fail`);
    }
    const hidden = await product(h, 2, { hidden: true });
    assert.equal((await h.request('/api/checkout', { method: 'POST', body: checkoutBody(hidden.id) })).status, 400);
    assert.equal((await h.request('/api/checkout', { method: 'POST', body: checkoutBody('M9999999') })).status, 400);
  } finally { await h.close(); }
});

test('two simultaneous buyers cannot reserve the same last unit and payment confirmation decrements once', async () => {
  const h = await harness();
  try {
    const item = await product(h, 1);
    const responses = await Promise.all([1, 2].map(() => h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const successful = responses.find((response) => response.status === 200)!;
    const reserved = await catalogProduct(h, item.id, true);
    assert.equal(reserved.stockCount, 1);
    assert.equal(reserved.reservedCount, 1);
    assert.equal(reserved.availableCount, 0);
    const callbackPath = `/api/webpay/commit?token_ws=${successful.data.token}`;
    const callbacks = await Promise.all([h.request(callbackPath), h.request(callbackPath)]);
    for (const callback of callbacks) {
      assert.equal(callback.status, 303);
      assert.match(callback.headers.get('location') || '', /status=success/);
    }
    const paid = await order(h, successful.data.orderId);
    assert.equal(paid.status, 'pagado');
    assert.equal(paid.stockApplied, true);
    const remaining = await catalogProduct(h, item.id, true);
    assert.equal(remaining.stockCount, 0);
    assert.equal(remaining.reservedCount, 0);
    assert.equal(remaining.availableCount, 0);
    const tampered = await h.request(`/api/admin/orders/${paid.id}`, { method: 'PATCH', admin: true, body: { status: 'pagado', stockApplied: false } });
    assert.equal(tampered.status, 400);
    const manualRetry = await h.request(`/api/admin/orders/${paid.id}`, { method: 'PATCH', admin: true, body: { status: 'pagado' } });
    assert.equal(manualRetry.status, 200);
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 0);
    assert.equal((await order(h, paid.id)).stockApplied, true);
  } finally { await h.close(); }
});

test('cancellation and rejection release reservations while forged callbacks cannot cancel or disclose orders', async () => {
  const h = await harness();
  try {
    const item = await product(h, 1);
    const first = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) });
    assert.equal(first.status, 200);
    const original = await order(h, first.data.orderId);
    const forged = await h.request(`/api/webpay/commit?TBK_ORDEN_COMPRA=${original.id}&TBK_TOKEN=incorrect`);
    assert.equal(forged.status, 303);
    assert(!(forged.headers.get('location') || '').includes(original.accessKey));
    assert.equal((await order(h, original.id)).status, 'pendiente_pago');
    const missingToken = await h.request(`/api/webpay/commit?TBK_ORDEN_COMPRA=${original.id}`);
    assert(!(missingToken.headers.get('location') || '').includes(original.accessKey));
    assert.equal((await order(h, original.id)).status, 'pendiente_pago');
    const cancel = await h.request(`/api/webpay/commit?TBK_ORDEN_COMPRA=${original.id}&TBK_TOKEN=${first.data.token}&TBK_ID_SESION=${original.payment.sessionId}`);
    assert.equal(cancel.status, 303);
    assert.equal((await order(h, original.id)).status, 'cancelado');
    assert.equal((await catalogProduct(h, item.id, true)).availableCount, 1);
    const second = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) });
    assert.equal(second.status, 200);
    Object.assign(h.webpay.transactions.get(second.data.token)!, { status: 'FAILED', response_code: -1 });
    const rejected = await h.request(`/api/webpay/commit?token_ws=${second.data.token}`);
    assert.equal(rejected.status, 303);
    assert.match(rejected.headers.get('location') || '', /status=rejected/);
    assert.equal((await order(h, second.data.orderId)).status, 'rechazado');
    assert.equal((await catalogProduct(h, item.id, true)).availableCount, 1);
  } finally { await h.close(); }
});

test('duplicate product lines share stock and failed payment startup returns JSON and releases reservations', async () => {
  const h = await harness();
  try {
    const item = await product(h, 1, { variants: [{ size: '60ml', price: 15000 }, { size: '100ml', price: 20000 }] });
    const duplicate = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id, 1, { items: [{ productId: item.id, size: '60ml', quantity: 1 }, { productId: item.id, size: '100ml', quantity: 1 }] }) });
    assert.equal(duplicate.status, 409);
    h.webpay.createFails = true;
    const failure = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) });
    assert.equal(failure.status, 502);
    assert.equal(typeof failure.data.error, 'string');
    assert.equal((await catalogProduct(h, item.id, true)).availableCount, 1);
    const invalidJson = await h.request('/api/checkout', { method: 'POST', raw: '{invalid' });
    assert.equal(invalidJson.status, 400);
    assert.equal(typeof invalidJson.data.error, 'string');
    const notFound = await h.request('/api/nonexistent');
    assert.equal(notFound.status, 404);
    assert.equal(typeof notFound.data.error, 'string');
  } finally { await h.close(); }
});

test('a callback must match the saved payment session, amount and order before confirming inventory', async () => {
  const h = await harness();
  try {
    const item = await product(h, 1);
    const checkout = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) });
    assert.equal(checkout.status, 200);
    const transaction = h.webpay.transactions.get(checkout.data.token)!;
    const correct = { ...transaction };
    for (const modification of [{ amount: 1 }, { buy_order: 'OTHER_ORDER' }, { session_id: 'another-session' }]) {
      Object.assign(transaction, correct, modification);
      const callback = await h.request(`/api/webpay/commit?token_ws=${checkout.data.token}`);
      assert.equal(callback.status, 303);
      assert.match(callback.headers.get('location') || '', /status=error/);
      assert.equal((await order(h, checkout.data.orderId)).status, 'pendiente_pago');
      assert.equal((await catalogProduct(h, item.id, true)).stockCount, 1);
    }
    Object.assign(transaction, correct);
    const valid = await h.request(`/api/webpay/commit?token_ws=${checkout.data.token}`);
    assert.equal(valid.status, 303);
    assert.match(valid.headers.get('location') || '', /status=success/);
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 0);
  } finally { await h.close(); }
});

test('an unavailable production database returns bounded JSON failures for public and admin routes', async () => {
  const h = await harness();
  const previousUrl = process.env.DATABASE_URL;
  const previousVercel = process.env.VERCEL;
  try {
    await closeDatabase?.();
    delete process.env.DATABASE_URL;
    process.env.VERCEL = '1';
    for (const path of ['/api/products', '/api/orders/unknown?key=incorrect', '/api/admin/orders', '/api/admin/products']) {
      const failed = await h.request(path, { admin: path.startsWith('/api/admin') });
      assert.equal(failed.status, 503, path);
      assert.equal(typeof failed.data.error, 'string', path);
    }
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    await closeDatabase?.();
    await h.close();
  }
});

test('missing admin credentials and production payment credentials fail safely', async () => {
  const h = await harness();
  const existingPassword = process.env.ADMIN_PASSWORD;
  try {
    delete process.env.ADMIN_PASSWORD;
    const missing = await h.request('/api/admin/login', { method: 'POST', body: { password } });
    assert.equal(missing.status, 503);
    assert.equal(missing.data.code, 'ADMIN_CONFIGURATION_INCOMPLETE');
    assert.match(missing.data.error, /ADMIN_PASSWORD/);
    assert(!missing.data.error.includes('ADMIN_SESSION_SECRET'));
    assert(!missing.data.error.includes(password));
    assert.equal((await h.request('/api/admin/session', { admin: true })).status, 401);
  } finally {
    process.env.ADMIN_PASSWORD = existingPassword;
    await h.close();
  }

  process.env.WEBPAY_ENV = 'production';
  const priorCommerce = process.env.WEBPAY_COMMERCE_CODE;
  const priorKey = process.env.WEBPAY_API_KEY;
  delete process.env.WEBPAY_COMMERCE_CODE;
  delete process.env.WEBPAY_API_KEY;
  const unconfigured = await harness();
  try {
    const item = await product(unconfigured);
    const response = await unconfigured.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) });
    assert.equal(response.status, 503);
    assert.equal((await catalogProduct(unconfigured, item.id, true)).reservedCount, 0);
  } finally {
    process.env.WEBPAY_ENV = 'integration';
    if (priorCommerce === undefined) delete process.env.WEBPAY_COMMERCE_CODE; else process.env.WEBPAY_COMMERCE_CODE = priorCommerce;
    if (priorKey === undefined) delete process.env.WEBPAY_API_KEY; else process.env.WEBPAY_API_KEY = priorKey;
    await unconfigured.close();
  }
});

test('a bad session key identifies only its own configuration and setup retries do not throttle corrected login', async () => {
  const h = await harness();
  const existingSecret = process.env.ADMIN_SESSION_SECRET;
  const existingNodeEnv = process.env.NODE_ENV;
  const existingVercel = process.env.VERCEL;
  try {
    process.env.VERCEL = '1';
    delete process.env.ADMIN_SESSION_SECRET;
    // Model an HTTPS edge ahead of the local test server without altering the browser destination.
    process.env.APP_URL = 'https://admin.example.test';
    for (let attempt = 0; attempt < 10; attempt++) {
      const missing = await h.request('/api/admin/login', { method: 'POST', body: { password }, origin: 'https://admin.example.test' });
      assert.equal(missing.status, 503);
      assert.equal(missing.data.code, 'ADMIN_CONFIGURATION_INCOMPLETE');
      assert.match(missing.data.error, /Falta configurar ADMIN_SESSION_SECRET/);
      assert(!missing.data.error.includes('ADMIN_PASSWORD'));
      assert(!missing.data.error.includes(password));
    }
    process.env.ADMIN_SESSION_SECRET = 'too-short-test-key';
    const short = await h.request('/api/admin/login', { method: 'POST', body: { password }, origin: 'https://admin.example.test' });
    assert.equal(short.status, 503);
    assert.match(short.data.error, /ADMIN_SESSION_SECRET.*32/);
    assert(!short.data.error.includes('too-short-test-key'));
    process.env.ADMIN_SESSION_SECRET = existingSecret;
    const valid = await h.request('/api/admin/login', { method: 'POST', body: { password }, origin: 'https://admin.example.test' });
    assert.equal(valid.status, 200);
    assert.deepEqual(valid.data, { ok: true });
  } finally {
    if (existingSecret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = existingSecret;
    if (existingVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = existingVercel;
    process.env.NODE_ENV = existingNodeEnv;
    await h.close();
  }
});

test('Webpay link orders remain pending until administrator confirmation, which consumes inventory once', async () => {
  process.env.WEBPAY_ENV = 'link';
  process.env.WEBPAY_FORM_ID = '123456';
  const h = await harness();
  try {
    const item = await product(h, 2);
    const checkout = await h.request('/api/checkout', { method: 'POST', body: checkoutBody(item.id) });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.data.mode, 'link');
    assert.equal(h.webpay.transactions.size, 0);
    const pending = await order(h, checkout.data.orderId);
    assert.equal(pending.status, 'pendiente_pago');
    assert.equal(pending.stockApplied, false);
    const publicResult = await h.request(`/api/orders/${pending.id}?key=${checkout.data.key}`);
    assert.equal(publicResult.data.payForm.monto, 15000);
    assert.equal(publicResult.data.payForm.idFormulario, '123456');
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 2);
    const paid = await h.request(`/api/admin/orders/${pending.id}`, { method: 'PATCH', admin: true, body: { status: 'pagado' } });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.stockApplied, true);
    assert.equal(paid.data.emailStatus, 'no_configurado');
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 1);
    const repeated = await h.request(`/api/admin/orders/${pending.id}`, { method: 'PATCH', admin: true, body: { status: 'preparando' } });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.status, 'preparando');
    const shipped = await h.request(`/api/admin/orders/${pending.id}`, { method: 'PATCH', admin: true, body: { status: 'enviado', tracking: 'TRACK-TEST-123', adminNotes: 'Seguimiento confirmado' } });
    assert.equal(shipped.status, 200);
    const persisted = await order(h, pending.id);
    assert.equal(persisted.status, 'enviado');
    assert.equal(persisted.tracking, 'TRACK-TEST-123');
    assert.equal(persisted.adminNotes, 'Seguimiento confirmado');
    const backward = await h.request(`/api/admin/orders/${pending.id}`, { method: 'PATCH', admin: true, body: { status: 'pagado' } });
    assert.equal(backward.status, 409);
    assert.equal((await catalogProduct(h, item.id, true)).stockCount, 1);
  } finally {
    process.env.WEBPAY_ENV = 'integration';
    delete process.env.WEBPAY_FORM_ID;
    await h.close();
  }
});
