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

## 0 · Observed DNS facts (measured 2026-08-22, public resolver)

**This section supersedes every earlier claim about who holds what.** Earlier
documents state "Wix is both the registrar and the current DNS host (confirmed
2026-08-12)". **That is wrong.** Corrected picture:

| Role | Holder |
|---|---|
| **Registrar** | **GoDaddy** — the domain was bought there |
| **DNS host** | **Wix** — `NS` delegates to `ns14/ns15.wixdns.net` |
| **Website** | Wix — apex `A` → `185.230.63.107/171/186`, `www` → `cdn1.wixdns.net` |
| **Email** | **Google Workspace** — `MX 10 smtp.google.com`, DKIM published at `google._domainkey` |

Measured records:

```
NS      ns14.wixdns.net, ns15.wixdns.net
MX      10 smtp.google.com
TXT     "v=spf1 include:_spf.google.com ~all"
TXT     "v=spf1 include:secureserver.net -all"        <-- see 0.1
TXT     "NETORGFT17971610.onmicrosoft.com"            <-- stale, see 0.2
TXT     "google-site-verification=hYRcBYbvuGCjfeaVSyywHnaxtEjw5hH5AKWENuyGhf0"
TXT     "canva-domain-verify=3cfe0dac-bf79-4b0c-b58b-059ac4907794"
DKIM    google._domainkey  -> v=DKIM1 (RSA, present)
DMARC   _dmarc is a CNAME to _dmarc.wixemails.com
                            -> "v=DMARC1; p=none; rua=mailto:dmarc_agg@vali.email"
```

### 0.1 ⚠ LIVE DEFECT — the domain publishes TWO SPF records

```
"v=spf1 include:_spf.google.com ~all"      <- Google Workspace, correct
"v=spf1 include:secureserver.net -all"     <- GoDaddy mail, leftover
```

RFC 7208 permits exactly one. A domain publishing two makes conforming receivers
return **permerror** — so SPF is not merely weaker, it **is not passing at all**
for the client's real business email, today. The only reason this is not causing
visible rejections is that the DMARC policy is `p=none`.

**Fix:** delete the `include:secureserver.net` record. This is a single TXT
deletion, doable in Wix's DNS panel without any migration.

**Check before deleting:** confirm nothing still sends as this domain through
GoDaddy or Microsoft 365. Incoming mail is Google-only (single MX), so the risk
is limited to legacy outbound — an old GoDaddy mailbox, a GoDaddy form, or a
website contact form. If something does, it stops authenticating.

### 0.2 Other findings worth acting on eventually

- **`NETORGFT17971610.onmicrosoft.com`** is a Microsoft 365 domain-verification
  record, typical of GoDaddy-resold M365. Almost certainly stale from before the
  move to Google. Confirm, then delete.
- **DMARC is a CNAME into Wix** (`_dmarc.wixemails.com`). Two consequences: the
  client cannot tighten the policy beyond `p=none` without taking it over, and
  **aggregate reports go to Wix's vendor, not to the client** — nobody on this
  side sees who is sending as this domain. Moving DNS breaks this CNAME unless a
  real `_dmarc` TXT replaces it.
- `google-site-verification` and `canva-domain-verify` are both in use. Keep.

### 0.3 What the corrected ownership changes

- **Nameservers are changed at GoDaddy, not Wix.** Wix's cooperation is not
  needed to move DNS, and its DNS-panel limitations stop being a constraint the
  moment delegation moves.
- **Cancelling the Wix account does not endanger the domain registration** — the
  earlier warning was based on the mistaken belief that Wix was the registrar.
  **But do not cancel Wix before moving DNS:** Wix currently serves the entire
  zone *and* the DMARC CNAME, so cancelling first would take down the website and
  break mail authentication together.
- **No domain transfer is needed at all.** The 5–7 day transfer window and the
  60-day lock discussed in the `2026-08-12` spec do not apply.
- **Cloudflare is now optional rather than indicated.** GoDaddy's own DNS is
  already paid for and already the client's, and using it adds no vendor — which
  matches the "one less dependent service" reasoning that settled the email
  question. Cloudflare remains the better tooling; it is no longer the only way
  to get record control.

---

## 1 · Why we are moving

`pwrhausgolfsociety.com` is registered at **GoDaddy**; **Wix** is the DNS host by
nameserver delegation, and also hosts the current website (see § 0, measured).

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

**⚠ Do not cancel the Wix account before DNS has moved.** The registration is
safe — it lives at GoDaddy — but Wix currently serves the whole zone and the
DMARC CNAME. Cancelling first would take the website and mail authentication
down together. Move nameservers at GoDaddy first, verify, then cancel.

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
