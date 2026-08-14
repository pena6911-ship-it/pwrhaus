// Merch catalog — single source of truth for both the storefront (Eleventy reads
// it via src/_data/products.js) and the checkout function (imports it directly).
// Prices are integer cents, per the backbone money rule. Printify ids come from
// Michelle's Printify shop; only products with a printifyProductId are buyable.
export const PRODUCTS = [
  {
    slug: 'golf-cap',
    name: 'PWRHaus Golf Cap',
    summary: 'Structured performance cap with the embroidered PH mark.',
    priceCents: 3500,
    image: '/img/golfcap.avif',
    printifyProductId: '6a7f47f50f5334d3be054b1e',
    variants: [
      { label: 'Adjustable / White', printifyVariantId: 259127, priceCents: 3500 },
    ],
  },
  {
    slug: 'golf-polo',
    name: 'PWRHaus Golf Polo',
    summary: 'Performance polo. Coming soon.',
    priceCents: 7500,
    image: '/img/golfpolo.avif',
    printifyProductId: null, // not yet set up in Printify
    variants: [],
  },
  {
    slug: 'golf-towel',
    name: 'PWRHaus Golf Towel',
    summary: 'Microfiber golf towel. Coming soon.',
    priceCents: 2500,
    image: '/img/golftowel.avif',
    printifyProductId: null, // not yet set up in Printify
    variants: [],
  },
];

// A product is buyable only when it maps to a real Printify product + variant.
export function isBuyable(product) {
  return Boolean(product.printifyProductId) && product.variants.length > 0;
}

// Resolve a (slug, printifyVariantId) pair to the product + variant, or null.
// The server uses this so a client can never invent a price or a variant.
export function findVariant(slug, printifyVariantId) {
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product || !isBuyable(product)) return null;
  const variant = product.variants.find(
    (v) => v.printifyVariantId === Number(printifyVariantId),
  );
  if (!variant) return null;
  return { product, variant };
}
