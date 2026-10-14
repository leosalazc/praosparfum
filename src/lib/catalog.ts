// Shared catalog logic — imported by both the storefront and the server,
// so prices and shipping are always computed the same way.

export interface Variant {
  size: string;
  price: number;
}

export interface Product {
  id: string;
  type: string; // 'DISEÑADOR' | 'NICHO' | 'AUTOR'
  name: string;
  brand?: string;
  displayPrice: string;
  price: number;
  originalPrice?: string;
  size: string;
  variants?: Variant[];
  stock: string; // 'DISPONIBLE' | 'AGOTADO'
  stockCount?: number;
  /** Physical inventory, reserved units, and units available for checkout. */
  reservedCount?: number;
  availableCount?: number;
  image?: string;
  hidden?: boolean;
}

export const ADMIN_EMAIL = 'leo.salaz14@gmail.com';

export const CASTAGNA_ID = 'U115';
export const MONLEY_ID = 'U103';

/** Price list (CLP). Edit here to change the default catalog pricing. */
export const PRICE_RULES = {
  NICHO: [{ size: '60ml', price: 18000 }],
  DISEÑADOR: [{ size: '60ml', price: 15000 }],
  [CASTAGNA_ID]: [
    { size: '60ml', price: 25000 },
    { size: '100ml', price: 35000 },
  ],
  [MONLEY_ID]: [
    { size: '60ml', price: 18000 },
    { size: '100ml', price: 24000 },
  ],
} as Record<string, Variant[]>;

export const SHIPPING = {
  PICKUP_ADDRESS: 'La Marina 622, Concepción',
  LOCAL_REGION: 'Región del Biobío',
  LOCAL_COST: 4000,
  NATIONAL_COST: 7000,
};

export const CHILE_REGIONS = [
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región Metropolitana de Santiago',
  "Región del Libertador General Bernardo O'Higgins",
  'Región del Maule',
  'Región de Ñuble',
  'Región del Biobío',
  'Región de La Araucanía',
  'Región de Los Ríos',
  'Región de Los Lagos',
  'Región Aysén del General Carlos Ibáñez del Campo',
  'Región de Magallanes y de la Antártica Chilena',
];

const clpFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
export const formatCLP = (n: number) => '$' + clpFormatter.format(Math.round(n || 0));

/** Default variants for a product according to the current price list. */
export function defaultVariants(p: Pick<Product, 'id' | 'type' | 'price' | 'size'>): Variant[] {
  const byId = PRICE_RULES[p.id];
  if (byId) return byId;
  const byType = PRICE_RULES[(p.type || '').toUpperCase()];
  if (byType) return byType;
  return [{ size: p.size || '60ml', price: p.price || 0 }];
}

/**
 * Variants that apply to a product. Explicit variants saved from the admin
 * panel win; otherwise the price list above is used (so old database records
 * with the previous 100ml pricing automatically show the new prices).
 */
export function getVariants(p: Product): Variant[] {
  const v = (p.variants || []).filter((x) => x && x.size && x.price > 0);
  return v.length ? [...v].sort((a, b) => a.price - b.price) : defaultVariants(p);
}

export function minPrice(p: Product) {
  return Math.min(...getVariants(p).map((v) => v.price));
}

export function priceLabel(p: Product) {
  const v = getVariants(p);
  return v.length > 1 ? `Desde ${formatCLP(minPrice(p))}` : formatCLP(v[0].price);
}

export function sizesLabel(p: Product) {
  return getVariants(p).map((v) => v.size).join(' / ');
}

export function stockOf(p: Product) {
  return Math.max(0, p.availableCount ?? ((p.stockCount ?? (p.stock === 'DISPONIBLE' ? 1 : 0)) - (p.reservedCount ?? 0)));
}

export function isAvailable(p: Product) {
  return stockOf(p) > 0;
}

export type Gender = 'MASCULINO' | 'FEMENINO' | 'UNISEX';
export function genderOf(p: Pick<Product, 'id'>): Gender {
  const c = (p.id || '').charAt(0).toUpperCase();
  return c === 'M' ? 'MASCULINO' : c === 'F' ? 'FEMENINO' : 'UNISEX';
}

/** Fields to persist when applying the price list to a stored product. */
export function pricingFields(p: Product): Partial<Product> {
  const variants = defaultVariants({ ...p, size: '60ml' });
  const min = Math.min(...variants.map((v) => v.price));
  return {
    variants,
    price: min,
    displayPrice: formatCLP(min),
    size: variants.map((v) => v.size).join(' / '),
    originalPrice: '',
  };
}

export function shippingCost(method: 'shipping' | 'pickup', region: string) {
  if (method === 'pickup') return 0;
  if (!region) return 0;
  return region === SHIPPING.LOCAL_REGION ? SHIPPING.LOCAL_COST : SHIPPING.NATIONAL_COST;
}

export const ORDER_STATUSES = {
  pendiente_pago: { label: 'Pago pendiente', color: 'bg-neutral-100 text-neutral-600' },
  pagado: { label: 'Pagado', color: 'bg-green-100 text-green-800' },
  preparando: { label: 'Preparando', color: 'bg-amber-100 text-amber-800' },
  enviado: { label: 'Enviado', color: 'bg-blue-100 text-blue-800' },
  entregado: { label: 'Entregado', color: 'bg-emerald-100 text-emerald-900' },
  rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  cancelado: { label: 'Cancelado', color: 'bg-neutral-200 text-neutral-500' },
} as const;
export type OrderStatus = keyof typeof ORDER_STATUSES;

export interface OrderItem {
  productId: string;
  name: string;
  brand?: string;
  type: string;
  size: string;
  unitPrice: number;
  quantity: number;
  image?: string;
}

export interface Order {
  id: string;
  accessKey: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  customer: { name: string; email: string; phone: string };
  delivery: {
    method: 'shipping' | 'pickup';
    region?: string;
    comuna?: string;
    address?: string;
    notes?: string;
  };
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  payment?: {
    token?: string;
    sessionId?: string;
    authorizationCode?: string;
    paymentType?: string;
    installments?: number;
    cardLast4?: string;
    responseCode?: number;
    transactionDate?: string;
  };
  stockApplied?: boolean;
  reservationExpiresAt?: string;
  reservationStatus?: 'active' | 'released' | 'expired' | 'consumed';
  /** Captured payment awaiting inventory reconciliation by the admin. */
  stockIssue?: string;
  emailStatus?: 'enviado' | 'error' | 'no_configurado';
  tracking?: string;
  adminNotes?: string;
}
