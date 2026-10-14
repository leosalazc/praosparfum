import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ADMIN_SESSION_COOKIE, adminConfigurationIssues, adminPasswordConfigured, adminSessionConfigured, checkPassword, createSession, sessionFromCookie, verifySession } from '../server/auth.js';

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
  withEnvironment({ NODE_ENV: 'test', VERCEL: undefined, ADMIN_PASSWORD: undefined }, () => {
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
  withEnvironment({ NODE_ENV: 'test', VERCEL: undefined, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: secret }, () => {
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
  withEnvironment({ NODE_ENV: 'production', VERCEL: undefined, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: undefined }, () => {
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

test('configuration diagnostics distinguish password failures without blaming a valid session secret', () => {
  const cases = [
    { value: undefined, reason: /Falta configurar ADMIN_PASSWORD/ },
    { value: '', reason: /ADMIN_PASSWORD está vacía/ },
    { value: 'short', reason: /ADMIN_PASSWORD debe tener al menos 12 caracteres/ },
    { value: 'x'.repeat(201), reason: /ADMIN_PASSWORD debe tener como máximo 200 caracteres/ },
  ];
  for (const { value, reason } of cases) {
    withEnvironment({ NODE_ENV: 'production', VERCEL: undefined, ADMIN_PASSWORD: value, ADMIN_SESSION_SECRET: secret }, () => {
      const issues = adminConfigurationIssues();
      assert.equal(issues.length, 1);
      assert.match(issues[0], reason);
      assert.doesNotMatch(issues[0], /ADMIN_SESSION_SECRET/);
      assert.equal(adminPasswordConfigured(), false);
      assert.equal(adminSessionConfigured(), true);
      assert.throws(() => createSession(), reason);
    });
  }
});

test('configuration diagnostics distinguish session failures without blaming a valid password', () => {
  const cases = [
    { value: undefined, reason: /Falta configurar ADMIN_SESSION_SECRET/ },
    { value: '', reason: /ADMIN_SESSION_SECRET está vacía/ },
    { value: 'x'.repeat(31), reason: /ADMIN_SESSION_SECRET debe tener al menos 32 caracteres/ },
  ];
  for (const { value, reason } of cases) {
    withEnvironment({ NODE_ENV: 'production', VERCEL: undefined, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: value }, () => {
      const issues = adminConfigurationIssues();
      assert.equal(issues.length, 1);
      assert.match(issues[0], reason);
      assert.doesNotMatch(issues[0], /ADMIN_PASSWORD/);
      assert.equal(adminPasswordConfigured(), true);
      assert.equal(adminSessionConfigured(), false);
      assert.throws(() => createSession(), reason);
      assert.equal(verifySession('token'), false);
    });
  }
});

test('Vercel requires a stable session secret even outside NODE_ENV production', () => {
  withEnvironment({ NODE_ENV: 'test', VERCEL: '1', ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: undefined }, () => {
    assert.equal(adminPasswordConfigured(), true);
    assert.equal(adminSessionConfigured(), false);
    assert.equal(adminConfigurationIssues().length, 1);
    assert.match(adminConfigurationIssues()[0], /ADMIN_SESSION_SECRET/);
    assert.throws(() => createSession(), /ADMIN_SESSION_SECRET/);
    assert.equal(verifySession('token'), false);
    process.env.ADMIN_SESSION_SECRET = secret;
    assert.deepEqual(adminConfigurationIssues(), []);
    assert.equal(verifySession(createSession()), true);
  });
});

test('valid configuration accepts documented boundaries and does not return secret values', () => {
  for (const validPassword of ['x'.repeat(12), 'x'.repeat(200)]) {
    withEnvironment({ NODE_ENV: 'production', VERCEL: '1', ADMIN_PASSWORD: validPassword, ADMIN_SESSION_SECRET: 's'.repeat(32) }, () => {
      assert.deepEqual(adminConfigurationIssues(), []);
      assert.equal(checkPassword(validPassword), true);
      assert.equal(verifySession(createSession()), true);
    });
  }
  withEnvironment({ NODE_ENV: 'production', VERCEL: '1', ADMIN_PASSWORD: 'sensitive!', ADMIN_SESSION_SECRET: 'sensitive-session-key' }, () => {
    const diagnostic = JSON.stringify(adminConfigurationIssues());
    assert.doesNotMatch(diagnostic, /sensitive!/);
    assert.doesNotMatch(diagnostic, /sensitive-session-key/);
    assert.equal(adminConfigurationIssues().length, 2);
  });
});

test('local development uses a process-stable session key only when the variable is absent', () => {
  withEnvironment({ NODE_ENV: 'test', VERCEL: undefined, ADMIN_PASSWORD: password, ADMIN_SESSION_SECRET: undefined }, () => {
    assert.deepEqual(adminConfigurationIssues(), []);
    const first = createSession();
    const second = createSession();
    assert.equal(verifySession(first), true);
    assert.equal(verifySession(second), true);
    process.env.ADMIN_SESSION_SECRET = '';
    assert.equal(adminSessionConfigured(), false);
    assert.match(adminConfigurationIssues()[0], /ADMIN_SESSION_SECRET está vacía/);
    assert.throws(() => createSession(), /ADMIN_SESSION_SECRET está vacía/);
    assert.equal(verifySession(first), false);
  });
});
