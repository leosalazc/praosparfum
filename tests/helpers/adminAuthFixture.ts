import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdminAuth } from '../../server/auth.js';

export const fixturePassword = 'only-for-tests-admin-password';

export function passwordCredentials(password = fixturePassword) {
  const salt = randomBytes(24);
  const parameters = { N: 131072, r: 8, p: 1, keyLength: 32 };
  const hash = scryptSync(password, salt, parameters.keyLength, { ...parameters, maxmem: 192 * 1024 * 1024 });
  return { version: 1, algorithm: 'scrypt', salt: salt.toString('base64url'), hash: hash.toString('base64url'), parameters };
}

const credentials = passwordCredentials();

/** Every test uses synthetic credentials and its own disposable signing key. */
export function adminAuthFixture(options: { passwordOverride?: () => string | undefined } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'praos-test-auth-'));
  const keyFile = join(directory, 'admin-session-key.json');
  const key = randomBytes(48);
  const keyDocument = { version: 1, kind: 'praos-admin-session-key', key: key.toString('base64url') };
  writeFileSync(keyFile, JSON.stringify(keyDocument), { mode: 0o600 });
  const verifier = structuredClone(credentials);
  return {
    directory, keyFile, key, keyDocument, credentials: verifier, password: fixturePassword,
    auth: createAdminAuth({ credentials: verifier, keyFile, passwordOverride: options.passwordOverride || (() => undefined) }),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
