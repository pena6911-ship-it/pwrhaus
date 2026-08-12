# Backbone integration smoke (test-mode only)

Prereqs: a Supabase test project, GHL sandbox location, Stripe TEST keys,
`stripe` CLI installed, `netlify-cli` installed (`npm i -g netlify-cli`).

1. Apply the migration to the Supabase test project:
   - Supabase SQL editor → paste `supabase/migrations/0001_init.sql` → Run.
2. Create `.env` from `.env.example` with TEST values.
3. `netlify dev` (serves functions at http://localhost:8888).
4. Contact create:
   - `curl -sX POST localhost:8888/api/contacts -H 'content-type: application/json' -d '{"email":"smoke@x.com","full_name":"Smoke"}'`
   - Expect `201 {"id":"...","ghl_contact_id":"..."}`. Verify the row in Supabase `contacts` and the contact in GHL.
   - Re-run the same curl → still 201, SAME id, no duplicate GHL contact (idempotency).
5. Stripe webhook:
   - Seed an order row in Supabase with `stripe_payment_intent_id='pi_smoke'`, `idempotency_key='stripe:pi_smoke'`.
   - `stripe listen --forward-to localhost:8888/api/stripe-webhook`
   - `stripe trigger payment_intent.succeeded` (or send a crafted event for `pi_smoke`).
   - Expect a new `order_events` row with `event_type='paid'`; replaying the same event id creates NO second row.
6. Record PASS/FAIL for each step here before marking Task 10 done.
