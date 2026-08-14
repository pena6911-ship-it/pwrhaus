// Storefront catalog, fetched live from Printify at build time. Create/publish a
// product in Printify and it appears on /merch on the next build. When the
// Printify credentials aren't present (e.g. the test build), this returns an
// empty list so the build still succeeds — /merch just shows nothing.
import { createPrintifyClient } from '../../functions/lib/printify.js';
import { mapPrintifyProduct, isBuyable } from '../../functions/lib/catalog.js';

export default async function () {
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;
  if (!token || !shopId) {
    console.warn('[merch] PRINTIFY_API_TOKEN/SHOP_ID not set — /merch will be empty this build.');
    return [];
  }
  try {
    const printify = createPrintifyClient({ token, shopId, userAgent: 'pwrhaus-build' });
    const raw = await printify.listProducts();
    return raw.map(mapPrintifyProduct).filter(isBuyable);
  } catch (e) {
    console.warn('[merch] Printify fetch failed — /merch will be empty this build.', e.status || e.message);
    return [];
  }
}
