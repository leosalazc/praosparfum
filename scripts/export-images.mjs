// Exporta las fotos actuales de la base SQL como archivos estáticos opcionales.
// Ejecutar desde la raíz: npm run export-images
import 'dotenv/config';
import { getCatalog } from '../server/catalog.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'public', 'products');
fs.mkdirSync(outDir, { recursive: true });
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const images = {};
for (const product of await getCatalog()) {
  const match = product.image?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match || !/^[MFU]\d+$/.test(product.id)) continue;
  const version = crypto.createHash('sha256').update(product.image).digest('hex').slice(0, 16);
  const filename = `${product.id}-${version}.${extensions[match[1]]}`;
  fs.writeFileSync(path.join(outDir, filename), Buffer.from(match[2], 'base64'));
  images[product.id] = { src: `/products/${filename}`, v: version };
}
fs.writeFileSync(path.join(process.cwd(), 'src', 'data', 'productImages.ts'),
  `// Generado por scripts/export-images.mjs.\nexport const productImages: Record<string, { src: string; v: string }> = ${JSON.stringify(images, null, 2)};\n`);
console.log(`Fotos exportadas: ${Object.keys(images).length}.`);
process.exit(0);
