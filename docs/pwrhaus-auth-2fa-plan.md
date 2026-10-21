# PWRHaus Dashboard — 2FA Scoping + Trusted Device

**Decision (21 Oct 2026):** 2FA stays in the codebase. Disabled by deploy context for Michelle's testing; enforced on the production deploy. Add trusted-device so she authenticates rarely rather than never.

---

## 0 · Deviation in force (21 Oct 2026) — READ FIRST

**2FA is currently OFF on production**, at the owner's instruction, because the
owner's account (`hello@pwrhausgolfsociety.com`) has no authenticator factor —
it was deliberately cleared when the original was found to be enrolled on the
developer's phone — and she tests on the production deploy, since DNS has not
moved yet. With the fail-closed logic in § 1 she could not get in at all.

What was actually built differs from § 1 in exactly one way:

```js
// functions/lib/auth.js — the single source of truth, imported by src/_data/admin.js
const ENABLED = new Set(['true', '1', 'yes', 'on']);
export function require2fa(env = process.env) {
  return ENABLED.has(String(env.AUTH_REQUIRE_2FA ?? '').trim().toLowerCase());
}
```

**This is fail-OPEN. A fresh environment with no config has 2FA off.** That is a
real reduction in posture, accepted knowingly — see the history below for why the
env-var approach was abandoned.

- **Default OFF.** Unset, `''`, `false` → 2FA off
- **Opt-in to switch on**, and parsing is permissive in that direction: `true`, `True`, `1`, `yes`, `on` all enable it. With the default inverted, a typo that silently leaves the dashboard unprotected is the expensive mistake
- **No longer context-aware** — production is not special-cased
- Enforced identically in the SPA (`src/admin/app.js`) and the API (`functions/lib/auth.js`), so the UI gate and the API gate cannot disagree
- A non-dismissible red banner shows on every dashboard screen while it is off

**Netlify:** no variable is required for the current (off) state. Set
`AUTH_REQUIRE_2FA=true` to switch enforcement back on.

**Why the env-var-only approach was abandoned (21 Oct 2026):** it was first built
fail-closed, defaulting ON and disabled by `AUTH_REQUIRE_2FA=false`. Setting that
variable in Netlify did not take effect — the build produced byte-identical output,
so the value never reached the Eleventy build (wrong scope, wrong context, or a
value that was not exactly `false`; it could not be distinguished from the outside).
**A misconfigured variable is indistinguishable from an unset one, and the symptom
is a silent lockout.** Defaulting off removes that failure mode at the cost of the
fail-closed guarantee.

**To restore the § 1 design before cutover:** set `AUTH_REQUIRE_2FA=true`, confirm
the challenge actually appears, then reinstate the fail-closed, context-aware form
of `require2fa()`. The § 4 checklist below is the gate.

---

## 1 · Environment-scoped enforcement

Netlify exposes `CONTEXT` on every build: `production`, `deploy-preview`, `branch-deploy`, `dev`.

**Default ON. Disable explicitly, never the reverse.**

```js
// auth/config.js
const CONTEXT = process.env.CONTEXT ?? 'production';

// Fail closed: anything unrecognized gets 2FA.
const TESTING_CONTEXTS = ['deploy-preview', 'branch-deploy', 'dev'];

export const REQUIRE_2FA =
  process.env.AUTH_REQUIRE_2FA === 'true' ? true
  : process.env.AUTH_REQUIRE_2FA === 'false' && TESTING_CONTEXTS.includes(CONTEXT) ? false
  : !TESTING_CONTEXTS.includes(CONTEXT);
```

Why this shape:

- A missing or typo'd env var results in 2FA **on**, not off
- `AUTH_REQUIRE_2FA=false` only works in a non-production context — setting it in production is ignored
- Production needs no env var at all to be secure

**Netlify env var setup:** set `AUTH_REQUIRE_2FA=false` scoped to Deploy previews and Branch deploys only. Leave the Production scope unset.

> Note: Netlify's "production" context is the main-branch deploy — it exists now, independent of DNS. Repointing the domain later changes nothing about this logic.

### Visible indicator

When `REQUIRE_2FA === false`, render a persistent banner on the dashboard:

> ⚠️ Test environment — two-factor authentication is disabled. Not for real member data.

Cheap, and it stops a staging URL from being mistaken for the live one. Also keeps the state honest if Michelle screenshots something.

---

## 2 · Trusted device

Goal: Michelle completes 2FA once per device, then isn't asked again for 30 days.

### Flow

1. Successful password + 2FA → checkbox "Remember this device for 30 days" (default checked)
2. If checked, mint a device token
3. On later logins, a valid device token satisfies the second factor — password is **still required**

### Token design

- Random 32 bytes, base64url
- Store **only the SHA-256 hash** server-side, never the raw token
- Set as its own cookie, separate from the session cookie: `httpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=2592000`, `Path=/`
- Rotate the token on each successful use, sliding the 30 days forward

### Table

```sql
create table trusted_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  token_hash    text not null unique,
  label         text,              -- UA-derived, e.g. "Chrome on macOS"
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);

create index on trusted_devices (user_id) where revoked_at is null;
```

Validation must check `revoked_at is null` **and** `expires_at > now()`. Don't rely on cookie expiry alone — the client controls that.

### Revocation

Revoke all of a user's devices on:

- Password change
- 2FA secret reset
- Explicit "sign out everywhere"

A settings screen listing active devices with individual revoke is Phase 2 — not needed for one user, needed the moment staff accounts exist.

---

## 3 · Michelle's enrollment path

She has to enroll in 2FA at least once before trusted-device helps her. Make that moment as easy as possible:

- Prefer **passkey** if her device supports it — stronger than TOTP and no code to type
- Fall back to **TOTP** with a QR code and a plainly worded "use Google Authenticator or your password manager"
- Issue **recovery codes** at enrollment, with a clear "save these somewhere safe" prompt

If she pushes back on enrolling at all, that's the conversation to have before launch, not after.

---

## 4 · Pre-cutover checklist

Run before repointing DNS:

- [ ] **Set `AUTH_REQUIRE_2FA=true`** and confirm the challenge actually appears — the default is OFF as of 21 Oct 2026 (see § 0), so doing nothing ships an unprotected dashboard
- [ ] **Restore the fail-closed, context-aware `require2fa()`** in `functions/lib/auth.js` so a missing variable means ON again
- [ ] Owner enrolled an authenticator on **her own** device and the red no-2FA banner is gone
- [ ] Production deploy: confirm `REQUIRE_2FA === true` by logging in and being challenged
- [ ] Confirm `AUTH_REQUIRE_2FA` is **not** set in the Production scope
- [ ] Michelle enrolled in 2FA (passkey or TOTP) on production
- [ ] Recovery codes issued and confirmed saved
- [ ] Trusted-device cookie confirmed `Secure` + `httpOnly` in prod
- [ ] Test: revoke a device, confirm next login re-challenges
- [ ] Test-environment banner confirmed absent in production
- [ ] Decide whether staging keeps real member data; if yes, 2FA goes back on there too

---

## 5 · Open question

**Will anyone besides Michelle get dashboard access?** If staff accounts are coming, 2FA stays mandatory for all of them from day one. Retrofitting it onto people accustomed to single-factor is a much harder conversation than starting with it.

---

## Note on "not production yet"

Correct that DNS hasn't moved — but two things are already true:

1. The Netlify production deploy exists now, so the env scoping above is live logic today, not something to wire up later.
2. If real member contacts are already loaded in Supabase for testing, that data is sensitive regardless of whether the domain points at it. A staging URL is unlisted, not private.

If the test data is synthetic, none of this is urgent. If it's Michelle's real member list, turn 2FA back on in staging once she's through the initial walkthrough.
