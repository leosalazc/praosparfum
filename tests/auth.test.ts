import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_SESSION_COOKIE, createAdminAuth, sessionFromCookie } from '../server/auth.js';
import { adminAuthFixture, passwordCredentials } from './helpers/adminAuthFixture.js';

async function withEnvironment(values: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test('compiled password verifier and private deployment key work in production without admin environment variables', async () => {
  const fixture = adminAuthFixture();
  try {
    await withEnvironment({ NODE_ENV: 'production', VERCEL: '1', ADMIN_PASSWORD: undefined, ADMIN_SESSION_SECRET: undefined }, async () => {
      assert.deepEqual(fixture.auth.configurationIssues(), []);
      assert.equal(fixture.auth.passwordConfigured(), true);
      assert.equal(fixture.auth.sessionConfigured(), true);
      assert.equal(await fixture.auth.checkPassword(fixture.password), true);
      for (const input of ['incorrect-password', undefined, null, 123, {}, 'x'.repeat(201)]) {
        assert.equal(await fixture.auth.checkPassword(input), false);
      }
      assert.equal(fixture.auth.verifySession(fixture.auth.createSession()), true);
    });
  } finally { fixture.cleanup(); }
});

test('unusable legacy environment variables do not block the packaged credentials', async () => {
  const fixture = adminAuthFixture({ passwordOverride: () => process.env.ADMIN_PASSWORD });
  try {
    for (const value of [undefined, '', 'short', 'x'.repeat(201)]) {
      await withEnvironment({ NODE_ENV: 'production', VERCEL: '1', ADMIN_PASSWORD: value, ADMIN_SESSION_SECRET: 'obsolete-short-key' }, async () => {
        assert.deepEqual(fixture.auth.configurationIssues(), []);
        assert.equal(await fixture.auth.checkPassword(fixture.password), true);
        assert.equal(fixture.auth.verifySession(fixture.auth.createSession()), true);
      });
    }
  } finally { fixture.cleanup(); }
});

test('sessions stay valid across auth factories and a separate cold process using the same deployment artifacts', () => {
  const fixture = adminAuthFixture();
  try {
    const token = fixture.auth.createSession();
    const restarted = createAdminAuth({ credentials: fixture.credentials, keyFile: fixture.keyFile, passwordOverride: () => undefined });
    assert.equal(restarted.verifySession(token), true);
    const verifierFile = join(fixture.directory, 'synthetic-verifier.json');
    writeFileSync(verifierFile, JSON.stringify(fixture.credentials), { mode: 0o600 });
    const source = `
      import { readFileSync } from 'node:fs';
      import { createAdminAuth } from './server/auth.ts';
      const auth = createAdminAuth({ credentials: JSON.parse(readFileSync(process.argv[2], 'utf8')), keyFile: process.argv[1], passwordOverride: () => undefined });
      process.stdout.write(String(auth.verifySession(process.argv[3])));
    `;
    const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', VERCEL: '1' };
    delete environment.ADMIN_PASSWORD;
    delete environment.ADMIN_SESSION_SECRET;
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source, fixture.keyFile, verifierFile, token], {
      cwd: new URL('..', import.meta.url), env: environment, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0);
    assert.equal(child.stdout, 'true');
    assert.equal(child.stdout.includes(fixture.keyDocument.key), false);
  } finally { fixture.cleanup(); }
});

test('signed sessions reject forged, expired and overlong tokens and never contain the password or signing key', async () => {
  const fixture = adminAuthFixture();
  try {
    const token = fixture.auth.createSession();
    assert.equal(token.includes(fixture.password), false);
    assert.equal(token.includes(fixture.keyDocument.key), false);
    assert.equal(fixture.auth.verifySession(fixture.password), false);
    assert.equal(fixture.auth.verifySession(fixture.credentials.hash), false);
    assert.equal(await fixture.auth.checkPassword(fixture.credentials.hash), false);
    assert.equal(fixture.auth.verifySession('x'.repeat(2049)), false);
    assert.equal(fixture.auth.verifySession(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')), false);
    const [payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    for (const sensitive of [fixture.password, fixture.credentials.hash, fixture.keyDocument.key]) {
      assert.equal(JSON.stringify(decoded).includes(sensitive), false);
    }
    decoded.exp += 1;
    const altered = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    assert.equal(fixture.auth.verifySession(`${altered}.${signature}`), false);
    decoded.exp = Math.floor(Date.now() / 1000) - 1;
    const expired = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const expiredSignature = crypto.createHmac('sha256', fixture.key).update(expired).digest('base64url');
    assert.equal(fixture.auth.verifySession(`${expired}.${expiredSignature}`), false);
    assert.equal(sessionFromCookie(`unrelated=value; ${ADMIN_SESSION_COOKIE}=${token}; after=value`), token);
    assert.equal(sessionFromCookie(`${ADMIN_SESSION_COOKIE}=%broken`), '');
  } finally { fixture.cleanup(); }
});

test('credential rotation invalidates existing sessions and accepts only the new password', async () => {
  const fixture = adminAuthFixture();
  try {
    const token = fixture.auth.createSession();
    const nextPassword = 'a-different-test-admin-password';
    Object.assign(fixture.credentials, passwordCredentials(nextPassword));
    assert.equal(fixture.auth.verifySession(token), false);
    assert.equal(await fixture.auth.checkPassword(fixture.password), false);
    assert.equal(await fixture.auth.checkPassword(nextPassword), true);
    assert.equal(fixture.auth.verifySession(fixture.auth.createSession()), true);
  } finally { fixture.cleanup(); }
});

test('private signing key rotation invalidates old sessions across existing factories', () => {
  const fixture = adminAuthFixture();
  try {
    const token = fixture.auth.createSession();
    writeFileSync(fixture.keyFile, JSON.stringify({ ...fixture.keyDocument, key: crypto.randomBytes(48).toString('base64url') }), { mode: 0o600 });
    assert.equal(fixture.auth.verifySession(token), false);
    assert.equal(fixture.auth.verifySession(fixture.auth.createSession()), true);
  } finally { fixture.cleanup(); }
});

test('absent or corrupt private key artifacts fail closed without asking for legacy environment configuration', () => {
  const fixture = adminAuthFixture();
  try {
    const token = fixture.auth.createSession();
    for (const document of [undefined, '{broken', JSON.stringify({ ...fixture.keyDocument, key: 'short' }), JSON.stringify({ ...fixture.keyDocument, version: 2 })]) {
      if (document === undefined) rmSync(fixture.keyFile); else writeFileSync(fixture.keyFile, document, { mode: 0o600 });
      assert.equal(fixture.auth.sessionConfigured(), false);
      assert.equal(fixture.auth.verifySession(token), false);
      assert.throws(() => fixture.auth.createSession());
      const issues = fixture.auth.configurationIssues();
      assert.equal(issues.length, 1);
      assert.doesNotMatch(issues.join(' '), /ADMIN_PASSWORD|ADMIN_SESSION_SECRET/);
      assert.equal(issues.join(' ').includes(fixture.keyDocument.key), false);
    }
  } finally { fixture.cleanup(); }
});

test('missing and malformed password verifiers fail closed without leaking fixture values', async () => {
  const fixture = adminAuthFixture();
  try {
    for (const credentials of [null, {}, { ...fixture.credentials, algorithm: 'unknown' }, { ...fixture.credentials, salt: 'short' },
      { ...fixture.credentials, hash: 'short' }, { ...fixture.credentials, parameters: { ...fixture.credentials.parameters, N: 1 } }]) {
      const auth = createAdminAuth({ credentials, keyFile: fixture.keyFile, passwordOverride: () => undefined });
      assert.equal(auth.passwordConfigured(), false);
      assert.equal(await auth.checkPassword(fixture.password), false);
      assert.equal(auth.verifySession(fixture.auth.createSession()), false);
      assert.throws(() => auth.createSession());
      assert.equal(auth.configurationIssues().length, 1);
      assert.equal(auth.configurationIssues().join(' ').includes(fixture.credentials.hash), false);
      assert.equal(auth.configurationIssues().join(' ').includes(fixture.password), false);
    }
  } finally { fixture.cleanup(); }
});

test('an optional valid environment password overrides packaged credentials and rotating it invalidates sessions', async () => {
  const fixture = adminAuthFixture({ passwordOverride: () => process.env.ADMIN_PASSWORD });
  try {
    await withEnvironment({ ADMIN_PASSWORD: 'a-valid-test-environment-password', ADMIN_SESSION_SECRET: undefined }, async () => {
      assert.equal(await fixture.auth.checkPassword(process.env.ADMIN_PASSWORD), true);
      assert.equal(await fixture.auth.checkPassword(fixture.password), false);
      const token = fixture.auth.createSession();
      process.env.ADMIN_PASSWORD = 'a-new-test-environment-password';
      assert.equal(fixture.auth.verifySession(token), false);
      assert.equal(await fixture.auth.checkPassword(process.env.ADMIN_PASSWORD), true);
      assert.equal(fixture.auth.verifySession(fixture.auth.createSession()), true);
    });
  } finally { fixture.cleanup(); }
});

test('password derivation has bounded concurrency and recovers after an over-capacity login attempt', async () => {
  const fixture = adminAuthFixture();
  try {
    const accepted = Array.from({ length: 18 }, () => fixture.auth.checkPassword(fixture.password));
    assert.equal(await fixture.auth.checkPassword(fixture.password), false);
    assert.deepEqual(await Promise.all(accepted), Array.from({ length: 18 }, () => true));
    assert.equal(await fixture.auth.checkPassword(fixture.password), true);
  } finally { fixture.cleanup(); }
});
