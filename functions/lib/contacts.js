import { assertPresent } from './idempotency.js';

export async function createContact({ db, ghl }, input) {
  assertPresent(input.email, 'email');

  const existing = await db.findContactByEmail(input.email);
  if (existing) {
    if (existing.ghl_contact_id) return existing;
    // Stranded contact: GHL push failed on a prior attempt. Re-push now.
    const ghlId = await ghl.upsertContact({
      email: existing.email,
      full_name: existing.full_name,
      phone: existing.phone,
    });
    return db.setContactGhlId(existing.id, ghlId);
  }

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
