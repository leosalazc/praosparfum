import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageConfiguration } from '../server/database.js';

function withConfiguration(values: Record<string, string | undefined>, check: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    check();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('Vercel recognizes the PostgreSQL connection supplied by a Neon integration', () => {
  for (const variable of ['DATABASE_URL', 'POSTGRES_URL']) {
    withConfiguration({ VERCEL: '1', NODE_ENV: 'production', DATABASE_URL: undefined, POSTGRES_URL: undefined,
      [variable]: 'postgresql://test.example.invalid/shop?sslmode=require' }, () => {
      assert.deepEqual(storageConfiguration(), { mode: 'postgres', configured: true, persistent: true });
    });
  }
});

test('blank PostgreSQL connection variables fail closed in Vercel instead of using local SQLite', () => {
  withConfiguration({ VERCEL: '1', NODE_ENV: 'production', DATABASE_URL: '  ', POSTGRES_URL: '\t' }, () => {
    const config = storageConfiguration();
    assert.equal(config.configured, false);
    assert.equal(config.persistent, false);
    assert.equal(config.mode, 'unconfigured');
    assert.match(config.error!, /Neon/);
    assert.doesNotMatch(config.error!, /postgresql:\/\//);
  });
});
