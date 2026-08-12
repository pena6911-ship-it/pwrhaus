import { assertPresent } from './idempotency.js';

export async function createContact({ db, ghl }, input) {
  assertPresent(input.email, 'email');

  const existing = await db.findContactByEmail(input.email);
  let contact;

  if (existing) {
    if (existing.ghl_contact_id) {
      contact = existing;
    } else {
      // Stranded contact: GHL push failed on a prior attempt. Re-push now.
      const ghlId = await ghl.upsertContact({
        email: existing.email,
        full_name: existing.full_name,
        phone: existing.phone,
      });
      // Fall back to the row we already hold: setContactGhlId returns null if
      // the row vanished between lookup and update. Without this, the ledger
      // append below dereferences null and throws a bare TypeError.
      contact = (await db.setContactGhlId(existing.id, ghlId)) ?? existing;
    }
  } else {
    const inserted = await db.insertContact({
      email: input.email,
      full_name: input.full_name ?? null,
      phone: input.phone ?? null,
      tier: input.tier ?? 'free',
      source: input.source ?? 'site',
      notes: input.notes ?? null,
    });

    const ghlId = await ghl.upsertContact({
      email: inserted.email,
      full_name: inserted.full_name,
      phone: inserted.phone,
    });

    contact = (await db.setContactGhlId(inserted.id, ghlId)) ?? inserted;
  }

  // Append-only: every submission is a fact, including repeat ones from a
  // known email. Without this the warm leads (free profile now, sponsorship
  // later) would be silently dropped by the dedupe above.
  await db.insertContactInquiry({
    contact_id: contact.id,
    source: input.source ?? 'site',
    notes: input.notes ?? null,
  });

  return contact;
}
