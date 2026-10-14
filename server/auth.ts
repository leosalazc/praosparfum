import crypto from 'crypto';

export const ADMIN_SESSION_COOKIE = 'praos_admin_session';
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const developmentSecret = crypto.randomBytes(32).toString('base64url');

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const adminPasswordConfigured = () => !!process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12 && process.env.ADMIN_PASSWORD.length <= 200;

export function adminSessionConfigured() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret ? secret.length >= 32 : process.env.NODE_ENV !== 'production';
}

function sessionSecret() {
  if (!adminSessionConfigured()) throw new Error('ADMIN_SESSION_SECRET debe tener al menos 32 caracteres.');
  return process.env.ADMIN_SESSION_SECRET || developmentSecret;
}

export function checkPassword(password: unknown): boolean {
  return adminPasswordConfigured() && typeof password === 'string' && password.length <= 200 && safeEqual(password, process.env.ADMIN_PASSWORD!);
}

function passwordRevision() {
  return crypto.createHmac('sha256', sessionSecret()).update(process.env.ADMIN_PASSWORD || '').digest('base64url');
}

/** Signed, expiring credential; the password never leaves the server in a response. */
export function createSession() {
  if (!adminPasswordConfigured()) throw new Error('ADMIN_PASSWORD no configurado.');
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS,
    nonce: crypto.randomBytes(16).toString('base64url'),
    revision: passwordRevision(),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token: string) {
  if (!adminPasswordConfigured() || !adminSessionConfigured() || !token || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]+$/.test(parts[1])) return false;
  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    return typeof data.exp === 'number' && data.exp > now && data.exp <= now + ADMIN_SESSION_SECONDS &&
      typeof data.revision === 'string' && safeEqual(data.revision, passwordRevision());
  } catch {
    return false;
  }
}

export function sessionFromCookie(cookie: string | undefined) {
  for (const entry of (cookie || '').split(';')) {
    const separator = entry.indexOf('=');
    if (entry.slice(0, separator).trim() === ADMIN_SESSION_COOKIE) {
      try { return decodeURIComponent(entry.slice(separator + 1)); } catch { return ''; }
    }
  }
  return '';
}
