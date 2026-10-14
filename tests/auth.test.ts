import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ADMIN_SESSION_COOKIE, adminPasswordConfigured, adminSessionConfigured, checkPassword, createSession, sessionFromCookie, verifySession } from '../server/auth.js';

function withEnvironment(values: Record<string, string | undefined>, fn: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

const password = 'only-for-tests-admin-password';
const secret = crypto.randomBytes(32).toString('hex');

test('admin access fails closed without an explicitly configured password', () => {
  withEnvironment({ NODE_ENV: 'test', ADMIN_PASSWORD: undefined }, () => {
    assert.equal(adminPasswordConfigured(), false);
    assert.equal(checkPassword(password), false);
    assert.equal(verifySession(password), false);
    assert.throws(() => createSession());
    process.env.ADMIN_PASSWORD = 'short';
    assert.equal(adminPasswordConfigured(), false);
    process.env.ADMIN_PASSWORD = 'x'.repeat(201);
    assert.equal(adminPasswordConfigured(), false);
  });
});

test('sessions are signed credentials instead of reusable passwords', () => {
  withEnvironment({ NODE_ENV: 'test', ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret }, () => {
    assert.equal(checkPassword(password), true);
    assert.equal(checkPassword('incorrect-password'), false);
    const token = createSession();
    assert.notEqual(token, password);
    assert.equal(token.includes(password), false);
    assert.equal(verifySession(token), true);
    assert.equal(verifySession(password), false);
    assert.equal(verifySession(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), false);
    assert.equal(sessionFromCookie(`unrelated=value; ${ADMIN_SESSION_COOKIE}=${token}; after=value`), token);
    assert.equal(sessionFromCookie(`${ADMIN_SESSION_COOKIE}=%broken`), '');
    const [payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.exp = Math.floor(Date.now() / 1000) - 1;
    const expiredPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(expiredPayload).digest('base64url');
    assert.equal(verifySession(`${expiredPayload}.${signature}`), false);
    process.env.ADMIN_PASSWORD = 'a-new-rotated-admin-password';
    assert.equal(verifySession(token), false);
  });
});

test('production requires a stable session secret and short secrets are rejected', () => {
  withEnvironment({ NODE_ENV: 'production', ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: undefined }, () => {
    assert.equal(adminSessionConfigured(), false);
    assert.equal(verifySession('token'), false);
    assert.throws(() => createSession());
    process.env.ADMIN_SESSION_SECRET = 'too-short';
    assert.equal(adminSessionConfigured(), false);
    process.env.ADMIN_SESSION_SECRET = secret;
    assert.equal(adminSessionConfigured(), true);
    assert.equal(verifySession(createSession()), true);
  });
});
