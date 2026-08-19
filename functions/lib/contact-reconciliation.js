const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 5000;

export function normalizeReconcileLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function reconcileContact({ db, ghl, log }, contact, timeoutMs) {
  const controller = new AbortController();
  let timeoutId;

  try {
    const ghlId = await Promise.race([
      ghl.upsertContact({
        email: contact.email,
        full_name: contact.full_name,
        phone: contact.phone,
        tier: contact.tier,
        source: contact.source,
        signal: controller.signal,
      }),
      new Promise((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          queueMicrotask(() => reject(new Error(`GHL upsert timed out after ${timeoutMs}ms`)));
        }, timeoutMs);
      }),
    ]);
    if (typeof ghlId !== 'string' || ghlId.trim() === '') {
      throw new Error('GHL upsert returned no contact id');
    }

    const updated = await db.setContactGhlId(contact.id, ghlId);
    if (!updated) throw new Error('contact row disappeared before GHL id could be stored');
    return true;
  } catch (err) {
    const failure = {
      contact_id: contact.id,
      email: contact.email,
      error: err?.message ?? 'unknown reconciliation error',
    };
    log.error?.('contact.reconcile_failed', failure);
    return failure;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function reconcileContacts({ db, ghl, log = console }, options = {}) {
  const limit = normalizeReconcileLimit(options.limit);
  const concurrency = normalizePositiveInteger(options.concurrency, DEFAULT_CONCURRENCY);
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const contacts = await db.findContactsMissingGhlId({ limit });
  const failures = [];
  let linked = 0;
  let nextContact = 0;

  async function runWorker() {
    while (nextContact < contacts.length) {
      const contact = contacts[nextContact++];
      const outcome = await reconcileContact({ db, ghl, log }, contact, timeoutMs);
      if (outcome === true) linked += 1;
      else failures.push(outcome);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, contacts.length) }, runWorker));

  return {
    processed: contacts.length,
    linked,
    failed: failures.length,
    failures,
  };
}
