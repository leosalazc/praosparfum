import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import type { Request } from 'express';
import { hasAllowedAdminOrigin } from '../server/origin.js';
import { type AdminAuth } from '../server/auth.js';
import { adminAuthFixture } from './helpers/adminAuthFixture.js';

const authFixture = adminAuthFixture({ passwordOverride: () => process.env.ADMIN_PASSWORD });
after(() => authFixture.cleanup());

function requestHeaders(headers: Record<string, string | undefined>): Pick<Request, 'get'> {
  const values = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: ((name: string) => values[name.toLowerCase()]) as Request['get'] };
}

async function withEnvironment(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('admin accepts the served host despite a stale canonical URL and TLS termination', () => {
  for (const [origin, host] of [
    ['https://shop.example.test', 'shop.example.test'],
    ['https://shop-preview.example.test', 'shop-preview.example.test'],
    ['https://shop.example.test', 'SHOP.EXAMPLE.TEST:443'],
    ['https://shop.example.test:8443', 'shop.example.test:8443'],
    ['https://[::1]:8443', '[::1]:8443'],
  ]) {
    assert.equal(hasAllowedAdminOrigin(requestHeaders({ Origin: origin, Host: host, 'Sec-Fetch-Site': 'same-origin' }), {
      canonicalOrigin: 'http://localhost:3000', httpsOnly: true,
    }), true, origin);
  }
  assert.equal(hasAllowedAdminOrigin(requestHeaders({ Origin: 'http://localhost:3000', Host: 'localhost:3000' }), {
    canonicalOrigin: 'https://shop.example.test', httpsOnly: false,
  }), true);
});

test('admin rejects missing, opaque and malformed origins', () => {
  for (const origin of [
    undefined, '', 'null', 'https://shop.example.test/', 'https://shop.example.test/admin',
    'https://shop.example.test?query=1', 'https://shop.example.test#fragment',
    'https://user:password@shop.example.test', 'https://shop.example.test, https://attacker.example.test',
    'https://SHOP.EXAMPLE.TEST', 'file://shop.example.test', 'ftp://shop.example.test',
    'data:text/plain,example', 'javascript:alert(1)',
  ]) {
    assert.equal(hasAllowedAdminOrigin(requestHeaders({ Origin: origin, Host: 'shop.example.test' }), { httpsOnly: false }), false, String(origin));
  }
});

test('admin rejects different hosts, ports and malformed destination authorities', () => {
  for (const origin of [
    'https://attacker.example.test', 'https://shop.example.test.attacker.example.test',
    'https://sub.shop.example.test', 'https://shop.example.test:8443',
  ]) {
    assert.equal(hasAllowedAdminOrigin(requestHeaders({ Origin: origin, Host: 'shop.example.test' }), { httpsOnly: true }), false, origin);
  }
  for (const host of [undefined, 'shop.example.test/path', 'user@shop.example.test', 'shop.example.test?query=1', 'shop.example.test#fragment', 'shop.example.test invalid']) {
    assert.equal(hasAllowedAdminOrigin(requestHeaders({ Origin: 'https://shop.example.test', Host: host }), { httpsOnly: true }), false, String(host));
  }
});

test('an explicitly configured canonical origin supports proxies with internal Host', () => {
  const headers = { Origin: 'https://shop.example.test', Host: '127.0.0.1:3000' };
  assert.equal(hasAllowedAdminOrigin(requestHeaders(headers), { canonicalOrigin: 'https://shop.example.test', httpsOnly: true }), true);
  assert.equal(hasAllowedAdminOrigin(requestHeaders(headers), { canonicalOrigin: 'https://other.example.test', httpsOnly: true }), false);
  assert.equal(hasAllowedAdminOrigin(requestHeaders({ ...headers, Origin: 'https://shop.example.test.attacker.example.test' }), {
    canonicalOrigin: 'https://shop.example.test', httpsOnly: true,
  }), false);
});

test('Fetch Metadata rejects requests from another site even when Origin matches', () => {
  for (const fetchSite of ['cross-site', 'same-site', 'none']) {
    const headers = { Origin: 'https://shop.example.test', Host: 'shop.example.test', 'Sec-Fetch-Site': fetchSite };
    assert.equal(hasAllowedAdminOrigin(requestHeaders(headers), { httpsOnly: true }), false, fetchSite);
    assert.equal(hasAllowedAdminOrigin(requestHeaders({ ...headers, Host: '127.0.0.1:3000' }), {
      canonicalOrigin: 'https://shop.example.test', httpsOnly: true,
    }), false, `Canonical fallback with ${fetchSite}`);
  }
});

test('forwarded headers cannot authorize an external origin', () => {
  assert.equal(hasAllowedAdminOrigin(requestHeaders({
    Origin: 'https://attacker.example.test', Host: 'shop.example.test',
    'X-Forwarded-Host': 'attacker.example.test', 'X-Forwarded-Proto': 'https',
    Forwarded: 'host=attacker.example.test;proto=https', 'Sec-Fetch-Site': 'same-origin',
  }), { httpsOnly: true }), false);
});

test('production and Vercel require HTTPS origins, including canonical fallback', async () => {
  const httpHeaders = requestHeaders({ Origin: 'http://shop.example.test', Host: 'shop.example.test' });
  assert.equal(hasAllowedAdminOrigin(httpHeaders, { canonicalOrigin: 'http://shop.example.test', httpsOnly: true }), false);
  for (const env of [{ NODE_ENV: 'production', VERCEL: undefined }, { NODE_ENV: 'test', VERCEL: '1' }]) {
    await withEnvironment(env, () => {
      assert.equal(hasAllowedAdminOrigin(httpHeaders), false);
      assert.equal(hasAllowedAdminOrigin(requestHeaders({ Origin: 'https://shop.example.test', Host: 'shop.example.test' })), true);
    });
  }
});

type Response = { status: number; data: any; setCookie: string[] };

async function serve(run: (send: (path: string, options: {
  method?: string; headers?: Record<string, string>; body?: unknown;
}) => Promise<Response>) => Promise<void>, auth: AdminAuth = authFixture.auth) {
  const { createApp } = await import('../server/app.js');
  const server = createServer(createApp({ auth }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  const send = (path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
    new Promise<Response>((resolve, reject) => {
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      const request = httpRequest({
        hostname: '127.0.0.1', port, path, method: options.method || 'GET',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
      }, (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => {
          try { resolve({ status: response.statusCode || 0, data: JSON.parse(text), setCookie: response.headers['set-cookie'] || [] }); }
          catch (error) { reject(error); }
        });
      });
      request.on('error', reject);
      request.setTimeout(5000, () => request.destroy(new Error('Admin origin regression request timed out')));
      request.end(body);
    });
  try { await run(send); }
  finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
}

test('admin can log in and edit products over a public HTTPS proxy despite APP_URL localhost', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'praos-origin-'));
  const password = randomBytes(24).toString('base64url');
  try {
    await withEnvironment({
      NODE_ENV: 'test', VERCEL: undefined, DATABASE_URL: undefined, POSTGRES_URL: undefined, SQLITE_FILE: join(temporary, 'shop.sqlite'),
      ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: randomBytes(48).toString('base64url'),
      APP_URL: 'http://localhost:3000', WEBPAY_ENV: 'link', WEBPAY_FORM_ID: '123456', TRUST_PROXY: undefined,
    }, async () => {
      try {
        await serve(async (send) => {
          const headers = { Host: 'shop-preview.example.test', Origin: 'https://shop-preview.example.test', 'Sec-Fetch-Site': 'same-origin' };
          const login = await send('/api/admin/login', { method: 'POST', headers, body: { password } });
          assert.equal(login.status, 200);
          assert.equal(login.data.ok, true);
          assert.match(login.setCookie[0] || '', /HttpOnly/i);
          assert.match(login.setCookie[0] || '', /SameSite=Strict/i);
          const Cookie = login.setCookie[0]?.split(';')[0];
          assert(Cookie);
          const authenticated = { ...headers, Cookie };
          assert.equal((await send('/api/admin/session', { headers: authenticated })).status, 200);
          assert.equal((await send('/api/admin/products', {
            method: 'POST', headers: authenticated,
            body: { id: 'M987654321', name: 'Origin regression perfume', brand: 'Test brand', type: 'DISEÑADOR', stockCount: 3, variants: [{ size: '60ml', price: 15000 }] },
          })).status, 200);
          assert.equal((await send('/api/admin/products/M987654321', {
            method: 'PATCH', headers: authenticated, body: { stockCount: 7 },
          })).status, 200);
          const hostile = await send('/api/admin/products/M987654321', {
            method: 'PATCH', headers: { ...authenticated, Origin: 'https://attacker.example.test', 'X-Forwarded-Host': 'attacker.example.test' }, body: { stockCount: 100 },
          });
          assert.equal(hostile.status, 403);
          const products = await send('/api/admin/products', { headers: authenticated });
          assert.equal(products.status, 200);
          assert.equal(products.data.find((item: any) => item.id === 'M987654321').stockCount, 7);
        });
      } finally {
        const { closeDatabase } = await import('../server/database.js');
        await closeDatabase();
      }
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('production Vercel login accepts HTTPS Host through internal HTTP and rejects HTTP origins', async () => {
  const password = randomBytes(24).toString('base64url');
  await withEnvironment({
    NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: undefined,
    ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: randomBytes(48).toString('base64url'),
    APP_URL: 'https://canonical.example.test', WEBPAY_ENV: 'link', WEBPAY_FORM_ID: '123456', TRUST_PROXY: undefined,
  }, async () => {
    await serve(async (send) => {
      const headers = { Host: 'shop.example.test', Origin: 'https://shop.example.test', 'Sec-Fetch-Site': 'same-origin' };
      const login = await send('/api/admin/login', { method: 'POST', headers, body: { password } });
      assert.equal(login.status, 200);
      assert.match(login.setCookie[0] || '', /Secure/i);
      const Cookie = login.setCookie[0]?.split(';')[0];
      assert(Cookie);
      assert.equal((await send('/api/admin/session', { headers: { ...headers, Cookie } })).status, 200);
      for (const Origin of ['http://shop.example.test', 'https://attacker.example.test']) {
        assert.equal((await send('/api/admin/login', { method: 'POST', headers: { ...headers, Origin }, body: { password } })).status, 403);
      }
      assert.equal((await send('/api/admin/login', {
        method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' }, body: { password },
      })).status, 403);
    });
  });
});

test('Vercel with packaged credentials accepts HTTPS login without admin variables and still enforces cross-site protection', async () => {
  const fixture = adminAuthFixture();
  try {
    await withEnvironment({
      NODE_ENV: 'test', VERCEL: '1', ADMIN_PASSWORD: undefined, ADMIN_SESSION_SECRET: undefined,
      APP_URL: 'http://localhost:3000', WEBPAY_ENV: 'link', WEBPAY_FORM_ID: '123456', TRUST_PROXY: undefined,
    }, async () => {
      await serve(async (send) => {
        const headers = { Host: 'praosparfum-drab.vercel.app', Origin: 'https://praosparfum-drab.vercel.app', 'Sec-Fetch-Site': 'same-origin' };
        const login = await send('/api/admin/login', { method: 'POST', headers, body: { password: fixture.password } });
        assert.equal(login.status, 200);
        assert.deepEqual(login.data, { ok: true });
        assert.match(login.setCookie[0] || '', /Secure/i);
        assert.match(login.setCookie[0] || '', /HttpOnly/i);
        const Cookie = login.setCookie[0]?.split(';')[0];
        assert(Cookie);
        assert.equal((await send('/api/admin/session', { headers: { ...headers, Cookie } })).status, 200);
        const wrong = await send('/api/admin/login', { method: 'POST', headers, body: { password: 'incorrect-password' } });
        assert.equal(wrong.status, 401);
        assert.equal((await send('/api/admin/login', {
          method: 'POST', headers: { ...headers, Origin: 'https://attacker.example.test' }, body: { password: fixture.password },
        })).status, 403);
        assert.equal((await send('/api/admin/login', {
          method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' }, body: { password: fixture.password },
        })).status, 403);
        for (const response of [login, wrong]) {
          assert.equal(JSON.stringify(response.data).includes(fixture.credentials.hash), false);
          assert.equal(JSON.stringify(response.data).includes(fixture.keyDocument.key), false);
        }
      }, fixture.auth);
    });
  } finally { fixture.cleanup(); }
});
