# DNS migration — Wix → Cloudflare (owner-run)

**Status:** not started · **Owner:** Oz · **Written:** 2026-08-22

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

## 5 · After this lands

- Add Netlify records in Cloudflare → site cutover (fast, reversible)
- Complete Resend domain verification → set `RESEND_API_KEY` → ticket emails
  leave dormant state (see `2026-08-20-event-ticketing-design.md` D8)
- Decide the domain's long-term registrar home, unhurried: keep a minimal Wix
  account for the domain only, or transfer out (Cloudflare at cost, Porkbun,
  Namecheap) once the 60-day window allows

---

## Appendix · Client email (sent/queued by Oz)

> **Subject: Moving the domain's DNS before we launch the new site**
>
> Hi Michelle,
>
> Before we can put the new website live, there's a piece of plumbing we need to
> sort out, and I want to explain it plainly because it affects your email as
> well as your website.
>
> Right now, `pwrhausgolfsociety.com` is registered with Wix, and Wix also
> controls where the domain points — for the website *and* for your Google
> email. To launch the new site we have to change where the domain points, and
> Wix's DNS tools are too limited for what we now need. In particular, they
> don't give us the control required to send your ticket confirmations and event
> emails reliably from your own domain. Without that, those emails land in spam
> or don't send at all.
>
> The fix is to move the domain's DNS management to Cloudflare. To be clear
> about what this is and isn't:
>
> - **We are not transferring the domain away from Wix.** You keep ownership
>   exactly as it is. Please don't cancel the Wix account — the domain is
>   registered there, and cancelling could put the registration at risk.
> - **We are not changing your email provider.** You stay on Google.
> - **Nothing changes visually.** Your current site keeps running throughout.
>
> The sequencing matters. We'll move DNS to Cloudflare first, well ahead of
> launch, while your existing site is still live and nothing depends on the new
> one. If anything is wrong we'll spot it with no pressure. Once that's settled
> and stable, switching the website over to the new build becomes a small change
> that takes minutes and can be undone just as quickly.
>
> The one genuine risk is your email. Your Google Workspace mail is controlled
> by the same DNS settings we're moving, so if those records aren't copied
> across exactly, mail stops. That's a real risk and I'm treating it as the
> priority — the migration plan is built around protecting your email first and
> the website second. I'll copy every existing record, verify mail is flowing
> normally, and only then touch anything to do with the website.
>
> I'd like to start this while we're still testing, so it's long done before
> launch day. Let me know and I'll get it scheduled.
>
> Best,
> Oz
