import { assertPresent } from './idempotency.js';

export async function createContact({ db, ghl }, input) {
  assertPresent(input.email, 'email');

  const existing = await db.findContactByEmail(input.email);
  if (existing) return existing;

  const contact = await db.insertContact({
    email: input.email,
    full_name: input.full_name ?? null,
    phone: input.phone ?? null,
    tier: input.tier ?? 'free',
    source: input.source ?? 'site',
  });

  const ghlId = await ghl.upsertContact({
    email: contact.email,
    full_name: contact.full_name,
    phone: contact.phone,
  });

  return db.setContactGhlId(contact.id, ghlId);
}
