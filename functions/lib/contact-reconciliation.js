const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function normalizeReconcileLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function reconcileContacts({ db, ghl, log = console }, options = {}) {
  const limit = normalizeReconcileLimit(options.limit);
  const contacts = await db.findContactsMissingGhlId({ limit });
  const failures = [];
  let linked = 0;

  for (const contact of contacts) {
    try {
      const ghlId = await ghl.upsertContact({
        email: contact.email,
        full_name: contact.full_name,
        phone: contact.phone,
        tier: contact.tier,
        source: contact.source,
      });
      const updated = await db.setContactGhlId(contact.id, ghlId);
      if (updated) linked += 1;
      else throw new Error('contact row disappeared before GHL id could be stored');
    } catch (err) {
      const failure = {
        contact_id: contact.id,
        email: contact.email,
        error: err?.message ?? 'unknown reconciliation error',
      };
      failures.push(failure);
      log.error?.('contact.reconcile_failed', failure);
    }
  }

  return {
    processed: contacts.length,
    linked,
    failed: failures.length,
    failures,
  };
}
