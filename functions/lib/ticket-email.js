// Ticket email. Two interchangeable transports, chosen by which env vars exist:
//
//   Google   - sends through the society's own Google Workspace mailbox. Needs NO
//              DNS changes, because Google is already an authorised sender for
//              this domain (SPF include + published DKIM). Preferred: it adds no
//              third-party service to depend on.
//   Resend   - kept as a drop-in alternative for if volume outgrows Google's
//              daily cap, or transactional mail should leave the owner's mailbox.
//              Requires SPF/DKIM on the sending domain first.
//
// With neither configured the emailer is DORMANT and every method resolves
// { skipped: true }, so no caller ever needs to branch.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
// Gmail wants the whole RFC 2822 message base64url-encoded.
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');

// A subject like "Your tickets - Fall Scramble" carries an em dash, and a raw
// non-ASCII byte in a header arrives mangled. RFC 2047 encoded-words fix that;
// they cap at 75 chars, so long subjects are split and folded across lines.
export function encodeHeaderValue(value) {
  const text = String(value ?? '');
  if (!/[^\x20-\x7E]/.test(text)) return text;
  const words = [];
  let chunk = '';
  for (const ch of text) {           // iterate code points, never split one
    if (Buffer.byteLength(chunk + ch, 'utf8') > 30) { words.push(chunk); chunk = ch; }
    else chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => '=?UTF-8?B?' + b64(w) + '?=').join('\r\n ');
}

// Build the RFC 2822 message Gmail sends verbatim. The HTML body is base64'd so
// long lines and non-ASCII need no further escaping.
export function buildRawMessage({ fromName, fromEmail, to, subject, html }) {
  const body = b64(html).replace(/(.{76})/g, '$1\r\n');
  const headers = [
    `From: ${encodeHeaderValue(fromName)} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];
  return b64url(headers.join('\r\n') + '\r\n\r\n' + body);
}

const usd = (cents) => '$' + (Number(cents) / 100).toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const when = (iso) => new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso));

export function createEmailer(env = {}, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY;
  const from = env.TICKETS_FROM_EMAIL || 'hello@pwrhausgolfsociety.com';
  const fromName = 'PWRHaus Golf Society';
  const google = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_REFRESH_TOKEN,
  };
  // Google first: it is the transport that costs no extra vendor.
  const transport = (google.clientId && google.clientSecret && google.refreshToken) ? 'google'
    : key ? 'resend'
    : '';
  const enabled = Boolean(transport);

  // Cached for the life of this emailer, so sending four attendee tickets in one
  // invocation costs one token exchange rather than four.
  let token = null;
  const accessToken = async () => {
    if (token && token.expiresAt > Date.now()) return token.value;
    const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: google.clientId,
        client_secret: google.clientSecret,
        refresh_token: google.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) throw new Error(`google_token_failed_${res.status}`);
    const json = await res.json();
    // Expire a minute early so a token never dies mid-send.
    // Number.isFinite, not ||: an expires_in of 0 means expired now, not missing.
    const ttl = Number.isFinite(json.expires_in) ? json.expires_in : 3600;
    token = { value: json.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
    return token.value;
  };

  const sendViaGoogle = async ({ to, subject, html }) => {
    const res = await fetchImpl(GMAIL_SEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: buildRawMessage({ fromName, fromEmail: from, to, subject, html }) }),
    });
    if (!res.ok) throw new Error(`gmail_send_failed_${res.status}`);
    return res.json();
  };

  const sendViaResend = async ({ to, subject, html }) => {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${from}>`, to, subject, html }),
    });
    if (!res.ok) throw new Error(`resend_failed_${res.status}`);
    return res.json();
  };

  const send = async (message) => {
    if (!enabled) return { skipped: true };
    return transport === 'google' ? sendViaGoogle(message) : sendViaResend(message);
  };

  const ticketBlock = (t, o) => `
    <table style="border-collapse:collapse;border:1px solid #E6E1D6;margin:12px 0;width:100%">
      <tr><td style="padding:12px">
        <strong>${esc(o.eventName)}</strong><br>
        ${esc(when(o.startsAt))}<br>${esc(o.venue)}${o.city ? ', ' + esc(o.city) : ''}<br><br>
        Ticket: <strong>${esc(t.tierSold === 'member' ? 'PWRHAUS Member' : 'Non-Member')}</strong><br>
        Ticket no. <strong>${esc(t.ticketNo)}</strong><br>
        Order no. ${esc(o.orderNo)} &middot; Payment status: <strong>Paid</strong>
      </td></tr>
    </table>`;

  return {
    enabled,
    transport,
    sendOrderConfirmation: (o) => {
      if (!enabled) return Promise.resolve({ skipped: true });
      return send({
        to: o.to,
        subject: `Your tickets — ${o.eventName}`,
        html: `<p>Thanks ${esc(o.buyerName)} — your spot is confirmed.</p>
          ${(o.tickets || []).map((t) => ticketBlock(t, o)).join('')}
          <p>Total paid: <strong>${usd(o.totalCents)}</strong></p>
          <p><a href="${esc(o.manageUrl)}"><strong>Add your guests</strong></a> — tell us who is joining you
          and we will send each of them their own ticket.</p>`,
      });
    },

    sendAttendeeTicket: (t) => {
      if (!enabled) return Promise.resolve({ skipped: true });
      return send({
        to: t.to,
        subject: `Your ticket — ${t.eventName}`,
        html: `<p>Hi ${esc(t.attendeeName)}, you're booked in.</p>
          ${ticketBlock(t, t)}
          <p>Please have this ticket ready on arrival. Questions? Just reply to this email.</p>`,
      });
    },

    sendUnassignedReminder: (r) => {
      if (!enabled) return Promise.resolve({ skipped: true });
      return send({
        to: r.to,
        subject: `You still have ${r.unassignedCount} ticket(s) to assign`,
        html: `<p>Your event is coming up and ${r.unassignedCount} of your tickets still need names.</p>
          <p><a href="${esc(r.manageUrl)}"><strong>Add your guests</strong></a></p>`,
      });
    },
  };
}
