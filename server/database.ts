import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool, type PoolClient } from 'pg';
import { products as initialProducts } from '../src/data/products.js';
import type { Order, Product } from '../src/lib/catalog.js';

export class ConfigurationError extends Error { readonly status = 503; }
export class ValidationError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export class InventoryConflictError extends ValidationError {
  constructor(public readonly productId: string, public readonly available: number, message: string) {
    super(message, 409);
  }
}
type Row = Record<string, any>;
export interface Connection { query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>; }
let pool: Pool | null = null;
let sqlite: DatabaseSync | null = null;
let initializing: Promise<void> | null = null;
let sqliteQueue: Promise<unknown> = Promise.resolve();
const INVENTORY_LOCK = 1741936192;

function postgresConnectionUrl() {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
}

export function storageConfiguration() {
  if (postgresConnectionUrl()) return { mode: 'postgres' as const, configured: true, persistent: true };
  if (process.env.VERCEL || (process.env.NODE_ENV === 'production' &&
    !(process.env.ALLOW_SQLITE_PRODUCTION === 'true' && process.env.SQLITE_FILE &&
      path.isAbsolute(process.env.SQLITE_FILE) && !process.env.SQLITE_FILE.startsWith('/tmp/')))) {
    return { mode: 'unconfigured' as const, configured: false, persistent: false,
      error: 'Conecta PostgreSQL (por ejemplo Neon) mediante DATABASE_URL o POSTGRES_URL. Vercel necesita almacenamiento persistente.' };
  }
  return { mode: 'sqlite' as const, configured: true, persistent: true };
}
function sqliteConnection(db: DatabaseSync): Connection {
  return { query: async <T extends Row>(sql: string, params: unknown[] = []) => {
    const stmt = db.prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return stmt.all(...params as any[]) as T[];
    stmt.run(...params as any[]); return [];
  } };
}
function postgresConnection(client: PoolClient): Connection {
  return { query: async <T extends Row>(sql: string, params: unknown[] = []) => {
    let n = 0;
    const result = await client.query(sql.replace(/\?/g, () => `$${++n}`), params);
    return result.rows as T[];
  } };
}
async function schema(db: Connection) {
  await db.query('CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL, stock INTEGER NOT NULL CHECK (stock >= 0))');
  await db.query('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, payment_token TEXT)');
  await db.query('CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_token ON orders(payment_token)');
  await db.query('CREATE INDEX IF NOT EXISTS orders_created_at ON orders(created_at)');
  await db.query('CREATE TABLE IF NOT EXISTS reservations (order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK (quantity > 0), expires_at BIGINT NOT NULL, PRIMARY KEY (order_id, product_id))');
  await db.query('CREATE INDEX IF NOT EXISTS reservations_expiry ON reservations(expires_at)');
  // One round trip per seed, rather than one per product on every cold instance.
  // Existing rows retain the owner's catalog and current inventory.
  const seedValues = initialProducts.flatMap((product) => {
    const stock = product.stockCount ?? (product.stock === 'DISPONIBLE' ? 1 : 0);
    return [product.id, JSON.stringify(product), stock];
  });
  if (seedValues.length) {
    const placeholders = initialProducts.map(() => '(?, ?, ?)').join(', ');
    await db.query(`INSERT INTO products(id, data, stock) VALUES ${placeholders} ON CONFLICT(id) DO NOTHING`, seedValues);
  }
}
async function initialize() {
  const configuration = storageConfiguration();
  if (!configuration.configured) throw new ConfigurationError(configuration.error);
  if (configuration.mode === 'postgres') {
    const url = new URL(postgresConnectionUrl()!);
    const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    // Connection-string SSL options can override pg's SSL object. Require
    // certificate verification for remote PostgreSQL hosts.
    const wantsTls = !loopback || (url.searchParams.get('sslmode') !== 'disable' && url.searchParams.has('sslmode'));
    for (const key of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
    const ca = process.env.DATABASE_SSL_CA || (process.env.PGSSLROOTCERT ? fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8') : undefined);
    pool = new Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10_000,
      ssl: wantsTls ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false });
    pool.on('error', (error) => console.error('[database] Error de conexión PostgreSQL:', error.message));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [INVENTORY_LOCK]);
      await schema(postgresConnection(client));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } else {
    const file = process.env.SQLITE_FILE || path.join(process.cwd(), 'data', 'praos.sqlite');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    sqlite = new DatabaseSync(file);
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;');
    sqlite.exec('BEGIN IMMEDIATE');
    try { await schema(sqliteConnection(sqlite)); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
}
export async function ensureDatabase() {
  if (!initializing) initializing = initialize().catch(async (error) => {
    if (pool) { await pool.end().catch(() => {}); pool = null; }
    if (sqlite) { sqlite.close(); sqlite = null; }
    initializing = null; throw error;
  });
  await initializing;
}

/** Report connectivity separately from configuration presence. */
export async function storageStatus() {
  const config = storageConfiguration();
  if (!config.configured) return { ...config, ready: false };
  try {
    await transaction(async (db) => { await db.query('SELECT 1 AS ready'); });
    return { ...config, ready: true };
  } catch (error) {
    console.error('[database] La comprobación de conexión falló:', (error as Error).message);
    return { ...config, ready: false, error: 'La base de datos no está disponible. Revisa la conexión y los certificados del servidor.' };
  }
}
/** All operations share a database-level lock. PostgreSQL coordinates separate
 * serverless instances; BEGIN IMMEDIATE coordinates local SQLite processes. */
export async function transaction<T>(fn: (db: Connection) => Promise<T>): Promise<T> {
  await ensureDatabase();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [INVENTORY_LOCK]);
      const result = await fn(postgresConnection(client));
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const run = sqliteQueue.then(async () => {
    const db = sqlite!;
    db.exec('BEGIN IMMEDIATE');
    try { const result = await fn(sqliteConnection(db)); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  sqliteQueue = run.catch(() => {}); return run;
}
export async function closeDatabase() {
  await sqliteQueue;
  if (pool) await pool.end();
  if (sqlite) sqlite.close();
  pool = null; sqlite = null; initializing = null; sqliteQueue = Promise.resolve();
}
export async function readOrder(db: Connection, id: string): Promise<Order | null> {
  const [row] = await db.query('SELECT data FROM orders WHERE id = ?', [id]);
  return row ? JSON.parse(row.data) as Order : null;
}
export async function writeOrder(db: Connection, order: Order) {
  await db.query('INSERT INTO orders(id, data, created_at, payment_token) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, payment_token = excluded.payment_token',
    [order.id, JSON.stringify(order), order.createdAt, order.payment?.token ?? null]);
}
export async function expireReservations(db: Connection, now = Date.now()) {
  const rows = await db.query('SELECT DISTINCT order_id FROM reservations WHERE expires_at <= ?', [now]);
  await db.query('DELETE FROM reservations WHERE expires_at <= ?', [now]);
  for (const row of rows) {
    const order = await readOrder(db, row.order_id);
    if (order && order.reservationStatus === 'active') {
      order.reservationStatus = 'expired'; order.updatedAt = new Date(now).toISOString(); await writeOrder(db, order);
    }
  }
}
export async function readProducts(db: Connection): Promise<Product[]> {
  const rows = await db.query('SELECT p.id, p.data, p.stock, COALESCE(SUM(r.quantity), 0) AS reserved FROM products p LEFT JOIN reservations r ON r.product_id = p.id GROUP BY p.id, p.data, p.stock ORDER BY p.id');
  return rows.map((row) => {
    const stockCount = Number(row.stock), reservedCount = Number(row.reserved);
    const availableCount = Math.max(0, stockCount - reservedCount);
    return { ...JSON.parse(row.data), id: row.id, stockCount, reservedCount, availableCount,
      stock: availableCount > 0 ? 'DISPONIBLE' : 'AGOTADO' } as Product;
  });
}
export async function writeProduct(db: Connection, product: Product) {
  const stored = { ...product }; delete stored.reservedCount; delete stored.availableCount;
  await db.query('INSERT INTO products(id, data, stock) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, stock = excluded.stock', [product.id, JSON.stringify(stored), product.stockCount ?? 0]);
}
