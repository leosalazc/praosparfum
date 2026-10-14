import { Product, Variant, formatCLP, pricingFields, stockOf } from '../src/lib/catalog.js';
import { products as baseProducts } from '../src/data/products.js';
import {
  ConfigurationError, InventoryConflictError, ValidationError,
  expireReservations, readProducts, transaction, writeProduct,
} from './database.js';

export { ConfigurationError as NoAdminDbError };
const str = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const validId = (id: string) => /^[MFU]\d{1,10}$/.test(id);

function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} debe ser un número entero entre ${min} y ${max}.`);
  }
  return value;
}

/** Whitelist editable fields and reject invalid values instead of silently coercing. */
export function sanitizeProduct(input: any, partial: boolean): Partial<Product> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Producto inválido.');
  const out: Partial<Product> = {};
  if (input.name !== undefined) {
    out.name = str(input.name, 120);
    if (!out.name) throw new ValidationError('El nombre es obligatorio.');
  }
  if (input.brand !== undefined) out.brand = str(input.brand, 120);
  if (input.type !== undefined) {
    if (!['DISEÑADOR', 'NICHO', 'AUTOR'].includes(input.type)) throw new ValidationError('Tipo de producto inválido.');
    out.type = input.type;
  }
  if (input.image !== undefined) {
    if (typeof input.image !== 'string') throw new ValidationError('Imagen inválida.');
    const image = input.image;
    if (image.length > 1_500_000) throw new ValidationError('La imagen es demasiado grande.');
    if (!(image === '' || /^https?:\/\//i.test(image) || /^\/(?!\/)/.test(image) || /^data:image\/(webp|jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(image))) {
      throw new ValidationError('Usa una imagen PNG, JPG o WebP, o una URL válida.');
    }
    out.image = image;
  }
  if (input.hidden !== undefined) {
    if (typeof input.hidden !== 'boolean') throw new ValidationError('La visibilidad debe ser verdadera o falsa.');
    out.hidden = input.hidden;
  }
  if (input.variants !== undefined) {
    if (!Array.isArray(input.variants) || !input.variants.length || input.variants.length > 6) throw new ValidationError('Agrega entre uno y seis tamaños con precio.');
    const seen = new Set<string>();
    const variants: Variant[] = input.variants.map((variant: any) => {
      const size = str(variant?.size, 20);
      if (!size || seen.has(size)) throw new ValidationError('Cada tamaño debe tener un nombre único.');
      seen.add(size);
      return { size, price: integer(variant?.price, 1, 9_999_999, 'El precio') };
    });
    const price = Math.min(...variants.map((variant) => variant.price));
    Object.assign(out, { variants, price, displayPrice: formatCLP(price), size: variants.map((variant) => variant.size).join(' / ') });
  }
  if (input.stockCount !== undefined) {
    const stockCount = integer(input.stockCount, 0, 9999, 'El stock');
    Object.assign(out, { stockCount, stock: stockCount > 0 ? 'DISPONIBLE' : 'AGOTADO' });
  }
  if (!partial) {
    if (!out.name) throw new ValidationError('El nombre es obligatorio.');
    if (!out.type) throw new ValidationError('Selecciona el tipo de producto.');
    if (!out.variants) throw new ValidationError('Agrega al menos un tamaño con precio.');
  }
  return out;
}

export async function updateProduct(id: string, input: any) {
  const changes = sanitizeProduct(input, true);
  const expectedStock = input.expectedStockCount === undefined ? undefined : integer(input.expectedStockCount, 0, 9999, 'El stock anterior');
  if (expectedStock !== undefined && changes.stockCount === undefined) throw new ValidationError('El stock anterior requiere un cambio de stock.');
  return transaction(async (db) => {
    await expireReservations(db);
    const product = (await readProducts(db)).find((entry) => entry.id === id);
    if (!product) throw new ValidationError('Producto no encontrado.', 404);
    if (expectedStock !== undefined && product.stockCount !== expectedStock) {
      throw new InventoryConflictError(id, stockOf(product), 'El stock cambió desde que abriste el producto. Actualiza el catálogo y vuelve a intentarlo.');
    }
    if (changes.stockCount !== undefined && changes.stockCount < (product.reservedCount || 0)) {
      throw new InventoryConflictError(id, stockOf(product), `Hay ${product.reservedCount} unidades reservadas. El stock físico no puede ser inferior.`);
    }
    await writeProduct(db, { ...product, ...changes });
  });
}

export async function createProduct(input: any) {
  const id = str(input?.id, 20).toUpperCase();
  if (!validId(id)) throw new ValidationError('Código inválido. Usa M, F o U + número, por ejemplo M120.');
  const data = sanitizeProduct(input, false);
  return transaction(async (db) => {
    if ((await db.query('SELECT id FROM products WHERE id = ?', [id])).length) throw new ValidationError('Ese código ya existe.', 409);
    await writeProduct(db, { id, stock: 'AGOTADO', stockCount: 0, ...data } as Product);
  });
}

/** Administrative inventory adjustment, kept separate from payment deductions. */
export async function decrementStock(items: { productId: string; quantity: number }[]) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new ValidationError('Selecciona los productos que quieres descontar.');
  const quantities = new Map<string, number>();
  for (const item of items) {
    const id = str(item?.productId, 20);
    if (!validId(id)) throw new ValidationError('Código de producto inválido.');
    quantities.set(id, (quantities.get(id) || 0) + integer(item?.quantity, 1, 9999, 'La cantidad'));
  }
  return transaction(async (db) => {
    await expireReservations(db);
    const catalog = new Map((await readProducts(db)).map((product) => [product.id, product]));
    for (const [id, quantity] of quantities) {
      const product = catalog.get(id);
      if (!product) throw new ValidationError('Producto no encontrado.', 404);
      if (stockOf(product) < quantity) throw new InventoryConflictError(id, stockOf(product), `Stock insuficiente de ${product.name}.`);
      const stockCount = product.stockCount! - quantity;
      await writeProduct(db, { ...product, stockCount, stock: stockCount > 0 ? 'DISPONIBLE' : 'AGOTADO' });
    }
  });
}

export async function seedProducts() {
  return transaction(async (db) => {
    const existing = new Set((await db.query('SELECT id FROM products')).map((row) => row.id));
    let changes = 0;
    for (const product of baseProducts) if (!existing.has(product.id)) { await writeProduct(db, product); changes++; }
    return changes;
  });
}

export async function applyPriceList() {
  return transaction(async (db) => {
    const catalog = await readProducts(db);
    for (const product of catalog) await writeProduct(db, { ...product, ...pricingFields(product) });
    return catalog.length;
  });
}
