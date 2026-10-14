import type { Product } from '../src/lib/catalog.js';
import { expireReservations, readProducts, transaction } from './database.js';

/** Read authoritative prices and inventory on every request. */
export async function getCatalog(_opts: { fresh?: boolean } = {}): Promise<Product[]> {
  return transaction(async (db) => {
    await expireReservations(db);
    return readProducts(db);
  });
}

/** Compatibility hook; persistent catalog reads need no invalidation. */
export function invalidateCatalog() {}
