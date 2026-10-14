import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ADMIN_SESSION_COOKIE = 'praos_admin_session';
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

type PasswordVerifier = {
  version: 1;
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  parameters: { N: 131072; r: 8; p: 1; keyLength: 32 | 64 };
};
type PasswordSource = { kind: 'override'; password: string } | { kind: 'verifier'; verifier: PasswordVerifier };

export interface AdminAuth {
  configurationIssues(): string[];
  passwordConfigured(): boolean;
  sessionConfigured(): boolean;
  checkPassword(password: unknown): Promise<boolean>;
  createSession(): string;
  verifySession(token: string): boolean;
}

export interface AdminAuthOptions {
  /** An isolated verifier for tests; null explicitly disables the shipped verifier. */
  credentials?: unknown;
  /** A private deployment artifact, never a file beneath the public build directory. */
  keyFile?: string;
  /** A valid password override is optional; malformed legacy settings are ignored. */
  passwordOverride?: () => string | undefined;
}

const PASSWORD_ISSUE = 'El administrador no tiene una contraseña válida preparada. Ejecuta la configuración de acceso y vuelve a desplegar.';
const SESSION_ISSUE = 'Falta el archivo privado de sesión del administrador. Vuelve a desplegar usando el comando de compilación del proyecto.';

function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}

/** Reject malformed encodings instead of accepting Buffer's permissive decoding. */
function decodeBase64url(value: unknown, minBytes: number, maxBytes = minBytes): Buffer | null {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length >= minBytes && decoded.length <= maxBytes && decoded.toString('base64url') === value ? decoded : null;
}

function readJson(file: string): unknown {
  try {
    // Neither configuration errors nor logs may include contents of private files.
    if (fs.statSync(file).size > 4096) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function parseVerifier(value: unknown): PasswordVerifier | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, any>;
  const params = data.parameters;
  // Pin the cost so neither weak verifiers nor unbounded memory requirements are accepted.
  if (data.version !== 1 || data.algorithm !== 'scrypt' || !params ||
      params.N !== 131072 || params.r !== 8 || params.p !== 1 || ![32, 64].includes(params.keyLength) ||
      !decodeBase64url(data.salt, 16, 64) || !decodeBase64url(data.hash, params.keyLength)) return null;
  return { version: 1, algorithm: 'scrypt', salt: data.salt, hash: data.hash,
    parameters: { N: 131072, r: 8, p: 1, keyLength: params.keyLength } };
}

function readSessionKey(file: string): Buffer | null {
  const data = readJson(file) as Record<string, unknown> | null;
  if (!data || data.version !== 1 || data.kind !== 'praos-admin-session-key') return null;
  return decodeBase64url(data.key, 48);
}

// Bound per-process memory use when many requests arrive together. Scrypt stays off the event loop.
let activeDerivations = 0;
const derivationWaiters: Array<() => void> = [];
async function derivePassword(password: string, verifier: PasswordVerifier): Promise<Buffer> {
  if (activeDerivations >= 2) {
    if (derivationWaiters.length >= 16) throw new Error('Password verification capacity reached.');
    await new Promise<void>((resolve) => derivationWaiters.push(resolve));
  }
  else activeDerivations++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, Buffer.from(verifier.salt, 'base64url'), verifier.parameters.keyLength,
        { N: verifier.parameters.N, r: verifier.parameters.r, p: verifier.parameters.p, maxmem: 256 * 1024 * 1024 },
        (error, derived) => error ? reject(error) : resolve(derived));
    });
  } finally {
    const next = derivationWaiters.shift();
    if (next) next(); else activeDerivations--;
  }
}

function sourceIdentity(source: PasswordSource): string {
  return source.kind === 'override' ? `override:${source.password}` : `scrypt:${JSON.stringify(source.verifier)}`;
}

/** Server-only password verification and deployment-stable signed sessions. */
export function createAdminAuth(options: AdminAuthOptions = {}): AdminAuth {
  const keyFile = options.keyFile ?? path.join(process.cwd(), '.private', 'admin-session-key.json');
  const passwordOverride = options.passwordOverride ?? (() => process.env.ADMIN_PASSWORD);
  const credentialsSupplied = Object.prototype.hasOwnProperty.call(options, 'credentials');
  const passwordSource = (): PasswordSource | null => {
    const override = passwordOverride();
    if (typeof override === 'string' && override.length >= 12 && override.length <= 200) return { kind: 'override', password: override };
    const verifier = parseVerifier(credentialsSupplied ? options.credentials : readJson(path.join(process.cwd(), 'server', 'admin-credentials.json')));
    return verifier ? { kind: 'verifier', verifier } : null;
  };
  const configurationIssues = () => [!passwordSource() ? PASSWORD_ISSUE : undefined, !readSessionKey(keyFile) ? SESSION_ISSUE : undefined]
    .filter((issue): issue is string => issue !== undefined);
  const revision = (source: PasswordSource, key: Buffer) => crypto.createHmac('sha256', key).update(sourceIdentity(source)).digest('base64url');

  return {
    configurationIssues,
    passwordConfigured: () => passwordSource() !== null,
    sessionConfigured: () => readSessionKey(keyFile) !== null,
    async checkPassword(password) {
      const source = passwordSource();
      if (!source || typeof password !== 'string' || password.length < 12 || password.length > 200) return false;
      if (source.kind === 'override') return safeEqual(password, source.password);
      try {
        const derived = await derivePassword(password, source.verifier);
        const current = passwordSource();
        // A password change during verification must not authenticate the previous credential.
        return current !== null && safeEqual(sourceIdentity(source), sourceIdentity(current)) &&
          crypto.timingSafeEqual(derived, Buffer.from(source.verifier.hash, 'base64url'));
      } catch { return false; }
    },
    createSession() {
      const source = passwordSource();
      const key = readSessionKey(keyFile);
      if (!source || !key) throw new Error(configurationIssues().join(' '));
      const payload = Buffer.from(JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS,
        nonce: crypto.randomBytes(16).toString('base64url'),
        revision: revision(source, key),
      })).toString('base64url');
      const signature = crypto.createHmac('sha256', key).update(payload).digest('base64url');
      return `${payload}.${signature}`;
    },
    verifySession(token) {
      const source = passwordSource();
      const key = readSessionKey(keyFile);
      if (!source || !key || typeof token !== 'string' || !token || token.length > 2048) return false;
      const parts = token.split('.');
      if (parts.length !== 2 || !decodeBase64url(parts[0], 1, 1024) || !decodeBase64url(parts[1], 32)) return false;
      const [payload, signature] = parts;
      const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
      if (!safeEqual(signature, expected)) return false;
      try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        const now = Math.floor(Date.now() / 1000);
        return Number.isInteger(data.exp) && data.exp > now && data.exp <= now + ADMIN_SESSION_SECONDS &&
          decodeBase64url(data.nonce, 16) !== null && decodeBase64url(data.revision, 32) !== null &&
          safeEqual(data.revision, revision(source, key));
      } catch { return false; }
    },
  };
}

const defaultAuth = createAdminAuth();
export const adminConfigurationIssues = () => defaultAuth.configurationIssues();
export const adminPasswordConfigured = () => defaultAuth.passwordConfigured();
export const adminSessionConfigured = () => defaultAuth.sessionConfigured();
export const checkPassword = (password: unknown) => defaultAuth.checkPassword(password);
export const createSession = () => defaultAuth.createSession();
export const verifySession = (token: string) => defaultAuth.verifySession(token);

export function sessionFromCookie(cookie: string | undefined) {
  for (const entry of (cookie || '').split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === ADMIN_SESSION_COOKIE) {
      try { return decodeURIComponent(entry.slice(separator + 1)); } catch { return ''; }
    }
  }
  return '';
}
