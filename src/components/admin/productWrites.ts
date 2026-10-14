import { Product } from '../../lib/catalog';
import { adminFetch } from './api';

// Catalog writes go through authenticated server endpoints.

export const updateProduct = (id: string, updates: Partial<Product> & { expectedStockCount?: number }) =>
  adminFetch(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(updates) });

export const addProduct = (product: Product) => adminFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(product) });

export const seedProducts = async () =>
  (await adminFetch<{ changes: number }>('/api/admin/products/seed', { method: 'POST' })).changes;

export const applyPriceList = async () =>
  (await adminFetch<{ updated: number }>('/api/admin/products/apply-prices', { method: 'POST' })).updated;
