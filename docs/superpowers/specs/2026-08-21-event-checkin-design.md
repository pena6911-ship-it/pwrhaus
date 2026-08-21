# PWRHaus — Event Check-in & QR Tickets (Phase 5) Design Spec

**Date:** 2026-08-21
**Status:** Approved design. Implementation plan next.
**Relationship to other docs:**
- Completes the ticketing work specified in `2026-08-20-event-ticketing-design.md`, which
  deliberately deferred check-in (§9 of that spec: "QRs are *generated* here, not *scanned*").
- Fills `event_attendance`, the table present since `0001_init.sql` and empty ever since.
- Feeds the CRM (`2026-08-20-crm-lead-intake-design.md`): door-captured attendees become contacts.

---

## 1 · Why this exists

Every ticket already carries a unique `qr_token`, but nothing renders it as a scannable code and
nothing records attendance. Two gaps follow:

1. **Attendees have no usable ticket.** They receive a ticket number; there is nothing to present
   at the door.
2. **Michelle cannot tell who actually showed up.** The roster records who *registered*.
   For a networking society whose end goal is an exit-strategy network of business owners,
   *attended* is the stronger signal — and it is the one currently missing.

**Goal:** render a scannable ticket, and give Michelle a phone-first scanner in her dashboard that
records attendance reliably at a golf course — including when the signal is poor and when a ticket
arrives with no name on it.

---

## 2 · Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **Unassigned tickets are named at the door**, not turned away | Keeps `event_attendance.contact_id` honest; the door is the moment of highest intent |
| D2 | **Vendored QR generator** — one committed file, no runtime CDN | Mirrors the `supabase.js` vendoring precedent; works offline and inside email |
| D3 | **The QR encodes a URL**, not a raw token | Any phone camera can read it; scanning outside the dashboard lands on a harmless page |
| D4 | **Dashboard-only scanning** (single Supabase account) | Smallest, safest surface for v1; a shareable per-event scanner link is a clean follow-on |
| D5 | **The QR is never the credential** | Tickets can be photographed. The token identifies a ticket; an authenticated session authorizes the check-in |
| D6 | **Online with graceful failure + retry queue** | A dead spot must not stop the line; keeps one source of truth (rejects full offline-first) |
| D7 | **A DB unique constraint on `event_attendance.ticket_id`** | The app *reports* duplicates; the database *guarantees* them impossible |
| D8 | Attendance is **additive** — it never mutates ticket status | Who attended and whether a ticket is valid are separate facts |

---

## 3 · Data model

### 3.1 `event_attendance` — used as built
`0001_init.sql` already defines `id`, `ticket_id`, `event_id`, `contact_id` (`not null`),
`attended_at`. `contact_id` stays **not null** because D1 captures the name at the door.

### 3.2 Migration `0009_event_checkin.sql`
```sql
-- One check-in per ticket, enforced by the database rather than by hope.
alter table event_attendance drop constraint if exists event_attendance_ticket_uniq;
alter table event_attendance add constraint event_attendance_ticket_uniq unique (ticket_id);

create index if not exists event_attendance_event_idx on event_attendance (event_id);

-- Dashboard reads attendance as the owner. Writes stay service-role only.
drop policy if exists event_attendance_admin_read on event_attendance;
create policy event_attendance_admin_read on event_attendance
  for select to authenticated using (true);
```
`event_attendance` already has RLS enabled with no policy (migration `0005`), so this only adds
the authenticated read the dashboard needs.

### 3.3 `tickets` — unchanged
`qr_token` already exists and is unique.

---

## 4 · The QR ticket

- **Generator:** a QR library vendored as a single committed file under `src/admin/vendor/` (or
  `src/js/vendor/` for the public ticket page), following the `supabase.js` precedent — sourced via
  a dev dependency at build time, committed, and loaded locally. **No runtime CDN**, because a CDN
  outage at the door is unacceptable and a hosted QR *image* service would leak every ticket token
  to a third party.
- **Payload:** `https://<site>/checkin/?t=<qr_token>`. A URL rather than a bare token so any phone
  camera resolves it, and so a scan outside the dashboard lands on a plain page reading
  "Present this ticket at the door" — never an action.
- **Rendered as inline SVG** (crisp at any size, printable, and email-safe once Resend lands).
- **Where it appears:** a ticket view the attendee reaches from their assignment link, and — when
  `RESEND_API_KEY` exists — inline in the attendee ticket email specified in the ticketing spec §8.

---

## 5 · The scanner (dashboard)

A new **Check-in** view in `/admin/`, phone-first.

- **Event picker**, defaulting to the event happening today.
- **Start scanning** opens the camera via `getUserMedia` + `BarcodeDetector`.
- **Manual ticket-number entry is a first-class path, not a fallback.** `BarcodeDetector` is
  unavailable in iOS Safari; if Michelle uses an iPhone this becomes her primary route. It is also
  what she uses when a camera will not focus in bright sun. The view must be fully usable without
  a working camera.
- **Results are large and unambiguous**, readable at arm's length outdoors:
  - ✅ green — "Jane Smith · Member · checked in"
  - ⚠️ amber — "Already checked in at 3:42pm"
  - 📝 blue — unassigned ticket → prompt for name + email, then check in
  - ❌ red — wrong event / expired / refunded / unknown token
- **Running count:** "18 of 24 checked in."
- **Offline queue:** a scan that fails to reach the server is stored locally and retried
  automatically; the UI shows "3 waiting to sync" so nothing is silently lost.
- **Attendance roster** for the event, showing who has arrived.

---

## 6 · The check-in API

`POST /api/tickets/checkin` — mirrors the existing injected-dependency handler pattern
(`functions/lib/…` factory + thin Netlify wrapper).

**Authorization:** requires a valid Supabase session (the caller's access token, verified exactly
as `functions/publish.js` does). Per D5, the QR token alone never authorizes a write.

**Request:** `{ qr_token, event_id, full_name?, email? }`

**Behavior, in order:**
1. Reject an unauthenticated caller (401).
2. Resolve the ticket by `qr_token`; unknown → `unknown_ticket`.
3. Refuse if the ticket belongs to a different event → `wrong_event`.
4. Refuse if the ticket status is not `valid` → `ticket_refunded` / `ticket_expired`.
5. If already checked in → return `{ duplicate: true, attended_at }` (**200, not an error** — the
   scanner shows the amber state).
6. If the ticket is unassigned:
   - with `full_name` + `email` → create/match the contact (`source='event_attendee'`, pushed to
     GHL via the existing `createContact` path), assign the seat, then check in;
   - without them → return `needs_attendee` so the scanner prompts.
7. Insert `event_attendance` and return the attendee's name and tier for the green state.

**Response shape** carries only what the scanner renders — attendee name, tier, status — never
order, payment, or unrelated contact data.

---

## 7 · Out of scope (this phase)

- **A shareable per-event scanner link** for volunteers (D4) — a clean follow-on; the scanner UI is
  unchanged by it.
- Full offline-first check-in with a pre-loaded roster (D6) — rejected as over-engineering for a
  24–40 person event, and it would put attendee PII on a device.
- Undo / manual attendance removal from the dashboard.
- Badge printing, seating, or pairings.

---

## 8 · Testing

**Automated (`node --test`):**
- Pure validation logic: valid, duplicate, wrong-event, refunded, expired, unassigned-without-name.
- Check-in handler with injected deps: rejects unauthenticated callers; the duplicate path returns
  200 with the original `attended_at` and writes nothing; an unassigned ticket with a name creates
  the contact, assigns the seat and records attendance; the response leaks no order or payment data.
- Migration `0009`: asserts the unique constraint and the authenticated-only read policy.
- QR payload builder: produces the expected `/checkin/?t=…` URL and escapes correctly.

**Manual (dashboard, dev Supabase):** open Check-in on a phone → scan a valid ticket (green) →
scan it again (amber, no second row) → scan an unassigned ticket → enter a name → confirm the
contact appears in the CRM → enter a ticket number manually with the camera off → put the device
in airplane mode mid-scan and confirm the queue holds and later syncs.

`npm test` stays green throughout.

---

## 9 · Go-live notes

- Check-in needs no new secrets. It uses the existing Supabase session and service-role write path.
- Attendance is **additive and permanent** — it is deliberately not cleared by ticket expiry, so
  the record of who was in the room survives the event.
- The pre-launch database reset (dashboard handoff §1.7) clears `event_attendance` along with the
  other transactional test data.
