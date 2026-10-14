import type { Request } from 'express';

/** Validate the browser's origin against the served host, including behind TLS
 * termination. APP_URL can also identify a public origin when a configured
 * reverse proxy replaces Host with its internal address. */
export function hasAllowedAdminOrigin(
  req: Pick<Request, 'get'>,
  options: { canonicalOrigin?: string | null; httpsOnly?: boolean } = {},
): boolean {
  const raw = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (!raw || (fetchSite && fetchSite !== 'same-origin')) return false;

  try {
    const origin = new URL(raw);
    const httpsOnly = options.httpsOnly ?? (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1');
    if (!['http:', 'https:'].includes(origin.protocol) || raw !== origin.origin ||
      (httpsOnly && origin.protocol !== 'https:')) return false;

    // Host is the request destination. Never authorize an origin from client
    // supplied X-Forwarded-Host/Proto, suffix matches or Vercel wildcards.
    const host = req.get('host');
    if (host && !/[\s/\\?#@]/.test(host)) {
      const destination = new URL(`${origin.protocol}//${host}`);
      if (destination.host === origin.host) return true;
    }
    return raw === options.canonicalOrigin;
  } catch {
    return false;
  }
}
