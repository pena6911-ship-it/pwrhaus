// Minimal Printify API client. POC scope: create a DRAFT order and (only when
// explicitly enabled) send it to production. Draft orders sit on-hold in the
// Printify dashboard and are never charged/printed until send_to_production.
const API = 'https://api.printify.com/v1';

export function createPrintifyClient({ token, shopId, userAgent = 'pwrhaus-poc' }) {
  async function request(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Printify rejects requests without a User-Agent.
        'User-Agent': userAgent,
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`printify_${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  return {
    // Creates the order in an on-hold/draft state. external_id lets Printify
    // dedupe, so a webhook retry with the same Stripe session id can't double-order.
    createDraftOrder({ externalId, lineItems, addressTo }) {
      return request(`/shops/${shopId}/orders.json`, {
        method: 'POST',
        body: JSON.stringify({
          external_id: externalId,
          label: externalId,
          line_items: lineItems, // [{ product_id, variant_id, quantity }]
          shipping_method: 1, // 1 = standard
          send_shipping_notification: false,
          address_to: addressTo,
        }),
      });
    },

    // THE money step. Guarded by PRINTIFY_LIVE at the call site — never reached
    // in the POC.
    sendToProduction(orderId) {
      return request(`/shops/${shopId}/orders/${orderId}/send_to_production.json`, {
        method: 'POST',
      });
    },
  };
}
