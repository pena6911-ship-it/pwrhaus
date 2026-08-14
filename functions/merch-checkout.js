import { makeMerchCheckoutHandler } from './lib/merch.js';

export default async (req) => makeMerchCheckoutHandler({ env: process.env })(req);

export const config = { path: '/api/merch/checkout' };
