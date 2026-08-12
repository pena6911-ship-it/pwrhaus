let counter = 0;
const id = (p) => `${p}_${++counter}`;
const nowIso = () => new Date(0).toISOString(); // deterministic for tests

export function createFakeDb() {
  const contacts = [];
  const orders = [];
  const orderEvents = [];

  return {
    async findContactByEmail(email) {
      return contacts.find((c) => c.email === email) ?? null;
    },
    async insertContact({ email, full_name, phone, tier, source }) {
      const c = { id: id('c'), email, full_name, phone, tier, source, ghl_contact_id: null, created_at: nowIso() };
      contacts.push(c);
      return c;
    },
    async setContactGhlId(contactId, ghlContactId) {
      const c = contacts.find((x) => x.id === contactId);
      c.ghl_contact_id = ghlContactId;
      return c;
    },
    async findOrderByIdempotencyKey(key) {
      return orders.find((o) => o.idempotency_key === key) ?? null;
    },
    async insertOrder(input) {
      const o = { id: id('o'), created_at: nowIso(), ...input };
      orders.push(o);
      return o;
    },
    async findOrderByPaymentIntent(pi) {
      return orders.find((o) => o.stripe_payment_intent_id === pi) ?? null;
    },
    async findOrderEventByStripeEventId(stripeEventId) {
      return orderEvents.find((e) => e.stripe_event_id === stripeEventId) ?? null;
    },
    async insertOrderEvent(input) {
      const e = { id: id('oe'), occurred_at: nowIso(), ...input };
      orderEvents.push(e);
      return e;
    },
  };
}
