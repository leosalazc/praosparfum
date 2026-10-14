import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ADMIN_SESSION_COOKIE } from '../server/auth.js';
import { createApp } from '../server/app.js';
import { storageConfiguration, storageDiagnostics, storageStatus } from '../server/database.js';
import { adminAuthFixture } from './helpers/adminAuthFixture.js';

const diagnosticVariables = [
  'DATABASE_URL', 'POSTGRES_URL', 'VERCEL_TARGET_ENV', 'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_SHA', 'VERCEL', 'NODE_ENV', 'ALLOW_SQLITE_PRODUCTION', 'SQLITE_FILE',
];
const prefixedConnectionName = /^[A-Z][A-Z0-9_]{0,99}_(DATABASE_URL|POSTGRES_URL)$/;

/** Isolate diagnostics from injected deployment credentials; restore in memory. */
async function withEnvironment<T>(values: Record<string, string | undefined>, check: () => T | Promise<T>) {
  const names = new Set([
    ...diagnosticVariables,
    ...Object.keys(process.env).filter((name) => prefixedConnectionName.test(name)),
    ...Object.keys(values),
  ]);
  const previous = new Map([...names].map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) process.env[name] = value;
    }
    return await check();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test('database diagnostics distinguish missing, blank and present connections without exposing values or changing configuration', async () => {
  await withEnvironment({}, () => {
    assert.deepEqual(storageDiagnostics().variables, [
      { name: 'DATABASE_URL', status: 'missing' }, { name: 'POSTGRES_URL', status: 'missing' },
    ]);
  });
  await withEnvironment({ DATABASE_URL: ' \n\t ', POSTGRES_URL: '\t' }, () => {
    assert.deepEqual(storageDiagnostics().variables, [
      { name: 'DATABASE_URL', status: 'empty' }, { name: 'POSTGRES_URL', status: 'empty' },
    ]);
  });
  const syntheticUrl = '  postgresql://diagnostic_user:synthetic_password@secret-host.example.invalid/shop  ';
  await withEnvironment({ DATABASE_URL: syntheticUrl, POSTGRES_URL: '\t' }, () => {
    const configuration = storageConfiguration();
    const diagnostics = storageDiagnostics();
    assert.deepEqual(diagnostics.variables, [
      { name: 'DATABASE_URL', status: 'present' }, { name: 'POSTGRES_URL', status: 'empty' },
    ]);
    assert.deepEqual(storageConfiguration(), configuration);
    assert.equal(process.env.DATABASE_URL, syntheticUrl);
    assert.equal(process.env.POSTGRES_URL, '\t');
    assert.doesNotMatch(JSON.stringify(diagnostics), /synthetic_password|diagnostic_user|secret-host|postgresql:\/\//);
  });
});

test('database diagnostics report only bounded, sorted PostgreSQL integration variable names', async () => {
  const valid = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
    `DIAGNOSTIC_${String(index).padStart(2, '0')}_${index % 2 ? 'POSTGRES_URL' : 'DATABASE_URL'}`,
    index % 2 ? ' \t ' : 'postgresql://synthetic_private_value@private-host.example.invalid/shop',
  ]));
  await withEnvironment({
    ...valid, VERCEL: '1',
    DIAGNOSTIC_TEST_SECRET: 'unrelated_private_value',
    DATABASE_URL_UNPOOLED: 'unpooled_private_value',
    diagnostic_DATABASE_URL: 'lowercase_private_value',
    'DIAGNOSTIC-BAD_DATABASE_URL': 'invalid_name_private_value',
    [`${'X'.repeat(101)}_DATABASE_URL`]: 'long_name_private_value',
  }, () => {
    const diagnostics = storageDiagnostics();
    assert.deepEqual(diagnostics.additionalVariables, Object.keys(valid).sort().slice(0, 10).map((name) => ({
      name, status: valid[name].trim() ? 'present' : 'empty',
    })));
    assert.equal(storageConfiguration().configured, false, 'Prefixed variables require an explicit supported connection name');
    assert.doesNotMatch(JSON.stringify(diagnostics), /private_value|private-host|UNPOOLED|diagnostic_DATABASE_URL|DIAGNOSTIC-BAD/);
  });
});

test('deployment diagnostics prefer the target environment and disclose only validated environment categories and abbreviated commits', async () => {
  const cases = [
    { target: ' production ', legacy: 'preview', sha: 'a'.repeat(40), environment: 'production', commit: 'aaaaaaa' },
    { target: 'preview', legacy: 'production', sha: ' ABCDEF1 ', environment: 'preview', commit: 'ABCDEF1' },
    { target: undefined, legacy: 'development', sha: undefined, environment: 'development', commit: null },
    { target: '', legacy: 'production', sha: '1234567', environment: 'production', commit: '1234567' },
    { target: 'staging-east', legacy: 'production', sha: 'invalid-commit', environment: 'custom', commit: null },
    { target: 'https://private.example.invalid', legacy: 'production', sha: 'f'.repeat(41), environment: 'unknown', commit: null },
    { target: undefined, legacy: undefined, sha: '123456', environment: 'unknown', commit: null },
    { target: 'production\nprivate-value', legacy: undefined, sha: 'abc1234\nprivate-value', environment: 'unknown', commit: null },
  ];
  for (const sample of cases) {
    await withEnvironment({ VERCEL_TARGET_ENV: sample.target, VERCEL_ENV: sample.legacy, VERCEL_GIT_COMMIT_SHA: sample.sha }, () => {
      assert.deepEqual(storageDiagnostics().deployment, { environment: sample.environment, commit: sample.commit });
    });
  }
});

test('Vercel storage status fails closed with safe diagnostics when no supported connection was injected', async () => {
  await withEnvironment({ VERCEL: '1', NODE_ENV: 'production', VERCEL_ENV: 'production', NEON_DATABASE_URL: 'synthetic_connection' }, async () => {
    const status = await storageStatus();
    assert.equal(status.mode, 'unconfigured');
    assert.equal(status.configured, false);
    assert.equal(status.ready, false);
    assert.equal(status.persistent, false);
    assert.deepEqual(status.diagnostics.variables, [
      { name: 'DATABASE_URL', status: 'missing' }, { name: 'POSTGRES_URL', status: 'missing' },
    ]);
    assert.deepEqual(status.diagnostics.additionalVariables, [{ name: 'NEON_DATABASE_URL', status: 'present' }]);
    assert.equal(status.diagnostics.deployment.environment, 'production');
    assert.doesNotMatch(JSON.stringify(status), /synthetic_connection/);
  });
});

test('admin status keeps storage diagnostics private and exposes them only after session verification', async () => {
  await withEnvironment({ VERCEL: '1', NODE_ENV: 'production', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: '7654321abcdef' }, async () => {
    const fixture = adminAuthFixture();
    const server = createServer(createApp({ auth: fixture.auth }));
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      assert(address && typeof address !== 'string');
      const endpoint = `http://127.0.0.1:${address.port}/api/admin/status`;
      for (const cookie of [undefined, `${ADMIN_SESSION_COOKIE}=forged-session`]) {
        const response = await fetch(endpoint, {
          headers: cookie ? { Cookie: cookie } : {}, signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 401);
        const body = await response.json();
        assert.deepEqual(Object.keys(body), ['error']);
        assert.doesNotMatch(JSON.stringify(body), /diagnostics|DATABASE_URL|POSTGRES_URL|7654321|preview/);
      }
      const authenticated = await fetch(endpoint, {
        headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${fixture.auth.createSession()}` }, signal: AbortSignal.timeout(5000),
      });
      assert.equal(authenticated.status, 200);
      assert.match(authenticated.headers.get('cache-control') || '', /private.*no-store/);
      const body = await authenticated.json();
      assert.equal(body.storage.ready, false);
      assert.deepEqual(body.storage.diagnostics.deployment, { environment: 'preview', commit: '7654321' });
      assert.deepEqual(body.storage.diagnostics.variables, [
        { name: 'DATABASE_URL', status: 'missing' }, { name: 'POSTGRES_URL', status: 'missing' },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      fixture.cleanup();
    }
  });
});
