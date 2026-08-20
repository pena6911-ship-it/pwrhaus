import { makeMerchCheckoutHandler } from './lib/merch.js';
import { createPrintifyClient } from './lib/printify.js';

export default async (req) => {
  const printify = createPrintifyClient({
    token: process.env.PRINTIFY_API_TOKEN,
    shopId: process.env.PRINTIFY_SHOP_ID,
    userAgent: 'pwrhaus-poc',
  });
  return makeMerchCheckoutHandler({ env: process.env, printify })(req);
};

export const config = { path: '/api/merch/checkout' };
