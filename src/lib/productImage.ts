import { productImages } from '../data/productImages';

/**
 * Picks the best URL for a product photo. Photos exported to public/products/ are served
 * as static files (cached by the CDN, no database reads); a newer photo uploaded from the
 * admin panel (different version hash) is still served from the API.
 */
export function resolveImage(id: string, image?: string): string | undefined {
  const local = productImages[id];
  if (!image) return local?.src;
  const v = image.match(/^\/api\/products\/[^/]+\/image\?v=([a-f0-9]+)/)?.[1];
  if (v && local && local.v === v) return local.src;
  return image;
}

export const localImage = (id: string) => productImages[id]?.src;
