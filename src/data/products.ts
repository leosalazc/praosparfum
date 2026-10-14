import { Product, pricingFields } from '../lib/catalog.js';
import { productImages } from './productImages.js';

// Catálogo inicial para poblar la base SQL una sola vez.
// No se usa como respaldo si falla la base. Precios y tamaños vienen de PRICE_RULES
// en src/lib/catalog.ts (inspiraciones 60ml; Castagna y Monley 60/100ml).
const base: Pick<Product, 'id' | 'type' | 'name' | 'brand' | 'stock'>[] = [
  { id: 'M94', type: 'DISEÑADOR', name: 'Le Beau', brand: 'Jean Paul Gaultier', stock: 'AGOTADO' },
  { id: 'M64', type: 'DISEÑADOR', name: 'Acqua di Gio Profumo', brand: 'Giorgio Armani', stock: 'DISPONIBLE' },
  { id: 'F48', type: 'DISEÑADOR', name: 'Light Blue', brand: 'Dolce & Gabbana', stock: 'AGOTADO' },
  { id: 'F21', type: 'DISEÑADOR', name: 'Good Girl', brand: 'Carolina Herrera', stock: 'AGOTADO' },
  { id: 'F59', type: 'DISEÑADOR', name: 'Black Opium', brand: 'Yves Saint Laurent', stock: 'DISPONIBLE' },
  { id: 'M100', type: 'NICHO', name: 'Santal 33', brand: 'Le Labo', stock: 'AGOTADO' },
  { id: 'M101', type: 'NICHO', name: 'Naxos', brand: 'Xerjoff', stock: 'AGOTADO' },
  { id: 'U100', type: 'NICHO', name: 'Erba Pura', brand: 'Xerjoff', stock: 'DISPONIBLE' },
  { id: 'M111', type: 'DISEÑADOR', name: 'Sauvage Elixir', brand: 'Dior', stock: 'AGOTADO' },
  { id: 'M44', type: 'DISEÑADOR', name: 'Herrera for men', brand: 'Carolina Herrera', stock: 'DISPONIBLE' },
  { id: 'M75', type: 'DISEÑADOR', name: 'Scandal pour homme', brand: 'Jean Paul Gaultier', stock: 'DISPONIBLE' },
  { id: 'M45', type: 'DISEÑADOR', name: 'Ultra Male', brand: 'Jean Paul Gaultier', stock: 'AGOTADO' },
  { id: 'M16', type: 'DISEÑADOR', name: 'Boss bottled night', brand: 'Hugo Boss', stock: 'AGOTADO' },
  { id: 'U103', type: 'AUTOR', name: 'Monley', brand: 'Práos', stock: 'DISPONIBLE' },
  { id: 'U3', type: 'NICHO', name: 'Neroli Portofino Acqua', brand: 'Tom Ford', stock: 'DISPONIBLE' },
  { id: 'F38', type: 'DISEÑADOR', name: 'Ultraviolet', brand: 'Paco Rabanne', stock: 'DISPONIBLE' },
  { id: 'F13', type: 'DISEÑADOR', name: 'Amor Amor', brand: 'Cacharel', stock: 'DISPONIBLE' },
  { id: 'F49', type: 'DISEÑADOR', name: 'Carolina Herrera', brand: 'Carolina Herrera', stock: 'DISPONIBLE' },
  { id: 'F71', type: 'DISEÑADOR', name: 'Eros pour femme', brand: 'Versace', stock: 'DISPONIBLE' },
  { id: 'F66', type: 'DISEÑADOR', name: '212 Heroes Forever Young Women', brand: 'Carolina Herrera', stock: 'AGOTADO' },
  { id: 'M110', type: 'NICHO', name: 'Tabacco Vanille', brand: 'Tom Ford', stock: 'DISPONIBLE' },
  { id: 'M57', type: 'DISEÑADOR', name: 'Stronger With You', brand: 'Emporio Armani', stock: 'AGOTADO' },
  { id: 'U104', type: 'NICHO', name: "L'immensité", brand: 'Louis Vuitton', stock: 'AGOTADO' },
  { id: 'M104', type: 'NICHO', name: 'Althair', brand: 'Marly', stock: 'AGOTADO' },
  { id: 'M105', type: 'NICHO', name: 'Aventus', brand: 'Creed', stock: 'AGOTADO' },
  { id: 'M106', type: 'DISEÑADOR', name: 'Stronger with you intensely', brand: 'Emporio Armani', stock: 'AGOTADO' },
  { id: 'M107', type: 'NICHO', name: 'Costa Azzurra', brand: 'Tom Ford', stock: 'AGOTADO' },
  { id: 'F100', type: 'DISEÑADOR', name: 'Miracle', brand: 'Lancôme', stock: 'DISPONIBLE' },
  { id: 'M55', type: 'DISEÑADOR', name: 'Sauvage', brand: 'Dior', stock: 'AGOTADO' },
  { id: 'M91', type: 'DISEÑADOR', name: 'Acqua di Gio Profondo', brand: 'Giorgio Armani', stock: 'AGOTADO' },
  { id: 'M108', type: 'NICHO', name: 'Layton', brand: 'Marly', stock: 'AGOTADO' },
  { id: 'M109', type: 'NICHO', name: 'Ombre Leather', brand: 'Tom Ford', stock: 'DISPONIBLE' },
  { id: 'M77', type: 'DISEÑADOR', name: 'Invictus Platinum', brand: 'Paco Rabanne', stock: 'AGOTADO' },
  { id: 'M47', type: 'DISEÑADOR', name: 'One Million Lucky', brand: 'Paco Rabanne', stock: 'AGOTADO' },
  { id: 'M50', type: 'DISEÑADOR', name: 'Bad Boy', brand: 'Carolina Herrera', stock: 'AGOTADO' },
  { id: 'M61', type: 'DISEÑADOR', name: 'Phantom', brand: 'Paco Rabanne', stock: 'DISPONIBLE' },
  { id: 'M102', type: 'DISEÑADOR', name: 'The Most Wanted', brand: 'Azzaro', stock: 'AGOTADO' },
  { id: 'M103', type: 'DISEÑADOR', name: 'Uomo Born in Roma', brand: 'Valentino', stock: 'AGOTADO' },
  { id: 'F12', type: 'DISEÑADOR', name: "J'adore", brand: 'Dior', stock: 'DISPONIBLE' },
  { id: 'F64', type: 'DISEÑADOR', name: 'Scandal pour femme', brand: 'Jean Paul Gaultier', stock: 'AGOTADO' },
  { id: 'F88', type: 'DISEÑADOR', name: 'My Way', brand: 'Armani', stock: 'DISPONIBLE' },
  { id: 'U115', type: 'AUTOR', name: 'Castagna del bosco', brand: 'Práos', stock: 'DISPONIBLE' },
  { id: 'M116', type: 'DISEÑADOR', name: 'Myself Le Parfum', brand: 'Yves Saint Laurent', stock: 'DISPONIBLE' },
  { id: 'M117', type: 'DISEÑADOR', name: 'Uomo Born in Roma Intense', brand: 'Valentino', stock: 'DISPONIBLE' },
  { id: 'U8', type: 'NICHO', name: 'Another 13', brand: 'Le Labo', stock: 'DISPONIBLE' },
  { id: 'F110', type: 'DISEÑADOR', name: 'Donna', brand: 'Valentino', stock: 'DISPONIBLE' },
];

export const products: Product[] = base.map((p) => {
  const draft = { ...p, price: 0, displayPrice: '', size: '60ml' } as Product;
  return {
    ...draft,
    ...pricingFields(draft),
    stockCount: p.stock === 'DISPONIBLE' ? 1 : 0,
    image: productImages[p.id]?.src || (p.id === 'U115' ? '/castagna-principal.webp' : undefined),
  } as Product;
});
