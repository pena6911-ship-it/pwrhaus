// Merch catalog is driven live by Printify — there is no hand-maintained product
// list. The storefront (src/_data/products.js) fetches products at build time and
// maps them with mapPrintifyProduct; checkout validates a variant at request time
// with findEnabledVariant and takes the price straight from Printify.

export function stripHtml(input = '') {
  return String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Raw Printify product -> the shape the storefront renders. Prices are integer
// cents (Printify's retail price, which Michelle sets in Printify).
export function mapPrintifyProduct(p) {
  const img = (p.images || []).find((i) => i.is_default) || (p.images || [])[0];
  const variants = (p.variants || [])
    .filter((v) => v.is_enabled)
    .map((v) => ({ id: v.id, label: v.title, priceCents: v.price }));
  return {
    productId: p.id,
    name: p.title,
    summary: stripHtml(p.description).slice(0, 160),
    image: img ? img.src : '',
    variants,
    priceCents: variants.length ? Math.min(...variants.map((v) => v.priceCents)) : 0,
    visible: p.visible !== false,
  };
}

// A product only reaches the storefront if it is visible and actually orderable.
export function isBuyable(product) {
  return product.visible && product.variants.length > 0;
}

// Server-side check at checkout: the enabled variant object (with .price/.title)
// or null. The client can never invent a price or buy a disabled variant.
export function findEnabledVariant(rawProduct, variantId) {
  if (!rawProduct || rawProduct.visible === false) return null;
  const variant = (rawProduct.variants || []).find(
    (v) => v.id === Number(variantId) && v.is_enabled,
  );
  return variant || null;
}
