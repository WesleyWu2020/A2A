import { Scheme } from '@/types';
import { normalizeImageList, normalizeImageUrl } from '@/lib/image-url';

function hasPrimaryImage(images?: string[]): boolean {
  return Array.isArray(images) && images.length > 0 && Boolean(images[0]);
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getLookupIds(scheme: Scheme): string[] {
  const ids: string[] = [];
  for (const item of scheme.products) {
    if (hasPrimaryImage(item.product.images)) continue;
    const sku = (item.product.sku || '').trim();
    const id = (item.product.id || '').trim();
    if (sku) ids.push(sku);
    if (id) ids.push(id);
  }
  return ids;
}

async function loadProductImagesByIds(baseUrl: string, ids: string[]): Promise<Map<string, string[]>> {
  const uniqIds = Array.from(new Set(ids));
  const imageMap = new Map<string, string[]>();

  await Promise.all(
    uniqIds.map(async (id) => {
      try {
        const resp = await fetch(`${baseUrl}/api/products/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        const raw = await resp.json();
        if (raw?.code !== 200 || !raw?.data) return;
        const images = Array.isArray(raw.data.images)
          ? normalizeImageList(raw.data.images.filter((url: unknown) => typeof url === 'string' && Boolean(url)))
          : [];
        if (!images.length) return;

        imageMap.set(id, images);
        const returnedSpu = typeof raw.data.spu_id === 'string' ? raw.data.spu_id : '';
        if (returnedSpu) imageMap.set(returnedSpu, images);
      } catch {
        // Keep silent and leave unresolved items as-is.
      }
    })
  );

  return imageMap;
}

export async function enrichSchemesWithResolvedImages(
  schemes: Scheme[],
  baseUrl: string
): Promise<Scheme[]> {
  if (schemes.length === 0) return schemes;

  const lookupIds = schemes.flatMap(getLookupIds);
  if (lookupIds.length === 0) return schemes;

  const imageMap = await loadProductImagesByIds(baseUrl, lookupIds);
  if (imageMap.size === 0) return schemes;

  return schemes.map((scheme) => {
    const nextProducts = scheme.products.map((item) => {
      const normalizedCurrentImages = normalizeImageList(item.product.images || []);
      if (hasPrimaryImage(normalizedCurrentImages)) {
        if (sameStringArray(normalizedCurrentImages, item.product.images || [])) return item;
        return {
          ...item,
          product: {
            ...item.product,
            images: normalizedCurrentImages,
          },
        };
      }

      const sku = (item.product.sku || '').trim();
      const id = (item.product.id || '').trim();
      const resolved = (sku && imageMap.get(sku)) || (id && imageMap.get(id));
      if (!resolved || resolved.length === 0) return item;

      return {
        ...item,
        product: {
          ...item.product,
          images: resolved,
        },
      };
    });

    const firstProductImage = nextProducts.find((p) => hasPrimaryImage(p.product.images))?.product.images[0];

    return {
      ...scheme,
      coverImage: normalizeImageUrl(scheme.coverImage || firstProductImage || ''),
      products: nextProducts,
    };
  });
}
