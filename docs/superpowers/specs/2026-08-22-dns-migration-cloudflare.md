# DNS migration — Wix → Cloudflare (owner-run)

**Status:** DEFERRED — no longer blocking anything · **Owner:** Oz · **Written:** 2026-08-22

> **Decision 2026-08-22: ticket email now sends through Google Workspace, so this
> migration is no longer required for launch.** Resend was the only forcing
> function; with Google as the transport there are no new DNS records to add.
> The site cutover never depended on this (it is an A/CNAME change inside Wix).
> Keep this document for when the migration is wanted on its own merits — see
> § 7 for what still argues for it. **Do not send the client email in the
> appendix**; it asks for approval for work that is no longer needed.

This is an owner-run operational task, tracked separately from the build. It
blocks Resend (ticket emails) and the eventual go-live cutover.

---

## 1 · Why we are moving

`pwrhausgolfsociety.com` is registered at **Wix**, and Wix is also the current
**DNS host** (confirmed 2026-08-12). That single fact drives everything below.

Wix's DNS tooling is too limited for what the new site needs — specifically the
SPF/DKIM/DMARC records that let ticket confirmations and event email send from
the client's own domain without landing in spam. Resend verification cannot be
completed on Wix DNS.

Moving DNS management to **Cloudflare** gives full record control while leaving
the registration at Wix untouched.

**Scope correction (2026-08-22):** the **site cutover does not require this
migration**. Per `2026-08-12` § *DNS cutover*, repointing the website is an
A/CNAME change that can be made inside Wix DNS today. **Email authentication is
the only thing forcing the DNS move.** Read § 6 before treating this as
mandatory.

## 2 · What this is NOT

- **Not a domain transfer.** Registration stays at Wix. Transfers take 5–7 days,
  need an auth code, and are blocked within 60 days of a prior transfer.
- **Not an email provider change.** Google Workspace stays exactly as it is.
- **Not the site cutover.** That is a separate, later step.

**⚠ Do not cancel the Wix account.** The domain is registered there, and if it
was issued free with a Premium plan, cancelling can affect the registration
itself. This overrides any "Wix is decommissioned after go-live" language in the
Phase 1 spec.

## 3 · Sequencing, and why it is this order

The `2026-08-12` marketing-site design spec (§ *DNS cutover*) establishes the
governing trade-off:

| Mechanism | Rollback time |
|---|---|
| Change A/CNAME records | Minutes — governed by record TTL, which we control |
| Delegate nameservers | 24–48h — governed by the parent zone's NS TTL, which we do not |

Moving to Cloudflare **is** a nameserver delegation, i.e. the slow-rollback
mechanism. The resolution is to separate the two steps in time:

1. **Delegate to Cloudflare now**, while the site is still dark and nothing
   depends on it. A bad hour costs nothing at this stage.
2. **Cut the site over later** as a record change *inside Cloudflare* — fast and
   reversible, exactly as the spec wants.

Doing the nameserver switch *as* the cutover would trade a five-minute rollback
for a two-day one. Do not combine these steps.

## 4 · Protecting Google Workspace mail

**The rule: Cloudflare must be a byte-for-byte copy of the Wix zone before the
nameservers are switched.** Cloudflare lets the zone be built fully while Wix is
still authoritative — use that. Mail is the priority; the website is secondary.

### 4.1 Audit first, from the live zone

Export every record from Wix. Work from the live zone, never from memory or from
any value written in a document (including this one). Cloudflare's import scan
catches most records but **misses ones it cannot see** — verify manually against
the Wix list, record by record.

Also resolve the **"Managed by third party"** flag observed in the Wix panel
(screenshot, 2026-08-20) before assuming Wix shows the full picture.

### 4.2 The email-critical records

Capture every one, with exact values and priorities:

- **MX** — observed pointing at `smtp.google.com`; **confirm against the live
  zone**, do not take that from here
- **SPF** (`TXT`, `v=spf1 …include:_spf.google.com…`) — there must be exactly
  **one** SPF record. Two silently break authentication.
- **DKIM** (`TXT`, at `google._domainkey` or the selector in use) — long value,
  easily truncated on copy
- **DMARC** (`TXT` at `_dmarc`)
- **`google-site-verification` TXT** — removing it can un-verify the Workspace
  domain
- Any mail-related **CNAME** (e.g. `mail`)

### 4.3 Lower TTLs before, not during

Set TTLs to **300s at Wix 24–48h before** the switch. The current TTL is the
rollback time. Done on the day, this step is worthless.

### 4.4 Verify mail before touching the website

After the nameservers move: send and receive in both directions, and confirm the
headers show **SPF and DKIM passing**. Only once mail is confirmed healthy should
the Netlify records be added or Resend verification begun.

## 5 · The chosen transport: Google Workspace (BUILT 2026-08-22)

This was not considered when the ticketing design chose Resend (D8), and it
should have been. Recording it so the decision is deliberate rather than assumed.

**The DNS requirement is not Resend-specific.** Any provider sending as
`@pwrhausgolfsociety.com` — Resend, SendGrid, Postmark, Mailgun, SES — needs SPF
and DKIM on that domain. Swapping providers changes nothing here.

But **Google Workspace already has working SPF and DKIM on this domain**, because
the client's mail already runs on it. Sending ticket email through Google's SMTP
relay would need **no new DNS records at all**, and would unblock ticket email
without this migration.

| | Cloudflare + Resend | Google Workspace SMTP |
|---|---|---|
| New DNS records | SPF/DKIM/DMARC for the sending domain | None — auth already in place |
| Blocked on this migration | Yes | No |
| Sending volume | Built for transactional mail | Daily caps; Google discourages transactional use |
| Blast radius of a problem | Isolated service | Throttling or flags hit the client's real mailbox |
| Separation of concerns | Society mail separate from business mail | Mixed together |

**Decision (owner, 2026-08-22): use Google.** The deciding argument was not
technical — it was one fewer external service to depend on, monitor, and pay for.
Resend would have added a vendor to solve a problem the existing Google account
already solves.

**This is built.** `createEmailer` in `functions/lib/ticket-email.js` picks its
transport from the environment: Google when the three `GOOGLE_*` vars are set,
Resend when `RESEND_API_KEY` is set, dormant when neither. Google wins if both
are present. The Resend path is retained deliberately — if volume ever outgrows
Google's daily cap, or transactional mail should leave the owner's mailbox, that
becomes a config change rather than a rewrite.

### 5.1 Owner setup — Google Cloud (once, ~30 minutes)

Nothing here needs Workspace admin rights, which matters because the Workspace
appears to be resold through Wix and admin access may be limited.

1. **Google Cloud Console** → create a project (or reuse one).
2. **Enable the Gmail API** for that project.
3. **OAuth consent screen** → choose **Internal** if the account is Workspace.
   Internal skips Google's verification review entirely.
4. **Create an OAuth client ID** → *Desktop app* is the simplest for this.
5. **Run the consent flow once**, signed in as the sending mailbox
   (`hello@pwrhausgolfsociety.com`), requesting **only** the
   `https://www.googleapis.com/auth/gmail.send` scope — send-only, not mailbox
   access. Keep the **refresh token** it returns.
6. **Set three Netlify environment variables** (all contexts):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
   Optionally `TICKETS_FROM_EMAIL` if sending from anything other than
   `hello@pwrhausgolfsociety.com`.

Email activates on the next deploy. No DNS changes, no code changes.

### 5.2 What to verify after switching it on

- Buy a test ticket and confirm the buyer confirmation arrives.
- Assign a guest and confirm that attendee's own ticket arrives with its QR.
- Check the message headers show **SPF and DKIM passing** — they should, since
  Google is already an authorised sender for this domain.
- Confirm the subject line renders correctly. Subjects contain an em dash, which
  is RFC 2047 encoded on our side; `encodeHeaderValue` is unit-tested with a
  decode round-trip, but confirm it once in a real client.
- Expect sent ticket email to appear in the mailbox's **Sent** folder.

### 5.3 Known limits

- Google caps daily sending (order of a couple of thousand recipients on
  Workspace). A 40-person event is roughly 45 messages, so this is not close to
  binding — but it is the ceiling that would eventually push toward Resend.
- Automated mail rides on the owner's real mailbox: bounces and spam complaints
  attach to her reputation, not to an isolated service.
- Google changes these policies periodically. Verify current OAuth and sending
  rules at setup time rather than trusting this document.

## 6 · What still argues for the migration

None of these block launch. Revisit when one of them starts to matter:

- Ticket volume approaching Google's daily cap
- Wanting transactional mail out of the owner's personal mailbox
- Wanting DNS control for its own sake, ahead of a registrar move

If any of those becomes true, § 3 (sequencing) and § 4 (mail protection) still
hold exactly as written — do the delegation early and separately, and treat the
Google Workspace records as the thing that must not break.

## 7 · After this lands

- Add Netlify records in Cloudflare → site cutover (fast, reversible)
- Complete Resend domain verification → set `RESEND_API_KEY` → ticket emails
  leave dormant state (see `2026-08-20-event-ticketing-design.md` D8)
- Decide the domain's long-term registrar home, unhurried: keep a minimal Wix
  account for the domain only, or transfer out (Cloudflare at cost, Porkbun,
  Namecheap) once the 60-day window allows

---

## Appendix · Client email (sent/queued by Oz)

Reworded 2026-08-22: the first draft told the client this was needed "to launch
the new site," which is not true — the cutover is an A/CNAME change. This version
is about email, which is the actual forcing function.

> **Subject: A change we need to make so your ticket emails work**
>
> Hi Michelle,
>
> As we get the new site ready, there's one piece of setup I want to explain
> before we do it, because it touches your email.
>
> When someone buys a ticket, we want three things to happen automatically: the
> buyer gets a confirmation, each guest gets their own ticket with the QR code
> for the door, and anyone who hasn't yet named their guests gets a reminder
> before the deadline. Right now those emails are built and ready but switched
> off, because we can't yet send them from your own domain.
>
> The reason is where your domain currently lives. `pwrhausgolfsociety.com` is
> registered with Wix, and Wix also controls the settings that tell the internet
> where your website and your email go. Those settings need a few additions
> before anything can send as `@pwrhausgolfsociety.com` and be trusted rather
> than treated as spam — and Wix's tools don't let us add them.
>
> The fix is to move that control to Cloudflare. To be clear about what this is
> and isn't:
>
> - **We are not transferring the domain away from Wix.** You keep ownership
>   exactly as it is. Please don't cancel the Wix account — the domain is
>   registered there, and cancelling could put the registration at risk.
> - **We are not changing your email provider.** You stay on Google, and your
>   day-to-day email carries on exactly as now.
> - **This is not what's holding up the new website.** The site can go live
>   independently. This is specifically about ticket emails.
>
> I'd like to do it soon, while the new site is still being tested and nothing
> depends on it. If something needs adjusting we'll find out with no pressure,
> rather than on a launch day or the week of an event.
>
> The one genuine risk is your email. Your Google mail is controlled by the same
> settings we're moving, so if they aren't copied across exactly, mail stops.
> I'm treating that as the priority: I'll copy every existing setting, confirm
> your mail is sending and receiving normally, and only then set up anything to
> do with tickets. If it turns out to be more disruptive than expected, there's
> a simpler fallback that gets ticket emails working with no change to your
> domain at all — slightly more limited, but safe.
>
> Let me know and I'll get it scheduled.
>
> Best,
> Oz
