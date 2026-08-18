import { assertPresent } from './idempotency.js';

export async function createContact({ db, ghl, log = console }, input) {
  assertPresent(input.email, 'email');

  const existing = await db.findContactByEmail(input.email);

  const contact = existing ?? await db.insertContact({
    email: input.email,
    full_name: input.full_name ?? null,
    phone: input.phone ?? null,
    tier: input.tier ?? 'free',
    source: input.source ?? 'site',
    notes: input.notes ?? null,
  });

  // Supabase owns facts; GHL is downstream. The ledger row is appended BEFORE
  // the CRM push so a GoHighLevel outage can never lose the enquiry. Every
  // submission appends one, including repeats from a known email — those are
  // the warm leads, and createContact dedupes the contact row itself.
  await db.insertContactInquiry({
    contact_id: contact.id,
    source: input.source ?? 'site',
    notes: input.notes ?? null,
  });

  if (contact.ghl_contact_id) return contact;

  // Either brand new, or stranded by a previous failed push. Either way, link it.
  try {
    const ghlId = await ghl.upsertContact({
      email: contact.email,
      full_name: contact.full_name,
      phone: contact.phone,
      tier: contact.tier,
      source: contact.source,
    });
    // setContactGhlId returns null if the row vanished between read and update.
    return (await db.setContactGhlId(contact.id, ghlId)) ?? contact;
  } catch (err) {
    // The fact is already durable. Leave ghl_contact_id null so the next
    // submission from this email self-heals the link, and log loudly.
    log.error?.('contact.ghl_push_failed', { contactId: contact.id, err: err?.message });
    return contact;
  }
}
