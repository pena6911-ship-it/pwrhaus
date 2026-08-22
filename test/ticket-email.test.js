import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailer, encodeHeaderValue, buildRawMessage } from '../functions/lib/ticket-email.js';

const ORDER = {
  to: 'buyer@example.com', buyerName: 'Jane Buyer', eventName: 'August FTL 9 Hole Scramble (Co-Ed)',
  startsAt: '2026-08-21T15:30:00-04:00', venue: 'Plantation Preserve', city: 'Plantation',
  orderNo: '000-0088', totalCents: 13000, manageUrl: 'https://x/tickets/manage/?token=abc',
  tickets: [{ ticketNo: '000-0088-00001', tierSold: 'member', qrToken: 'q1' }],
};

test('the emailer is disabled and silent without RESEND_API_KEY', async () => {
  const mailer = createEmailer({});
  assert.equal(mailer.enabled, false);
  assert.deepEqual(await mailer.sendOrderConfirmation(ORDER), { skipped: true });
  assert.deepEqual(await mailer.sendAttendeeTicket({ to: 'a@b.c' }), { skipped: true });
  assert.deepEqual(await mailer.sendUnassignedReminder({ to: 'a@b.c' }), { skipped: true });
});

test('with a key it posts to Resend and includes the manage link', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  };
  const mailer = createEmailer({ RESEND_API_KEY: 'test_key', TICKETS_FROM_EMAIL: 'hello@pwrhausgolfsociety.com' }, fakeFetch);
  assert.equal(mailer.enabled, true);

  await mailer.sendOrderConfirmation(ORDER);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.resend\.com\/emails/);
  assert.match(calls[0].init.headers.Authorization, /Bearer test_key/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.to, 'buyer@example.com');
  assert.ok(body.html.includes('tickets/manage/?token=abc'), 'confirmation must lead with the assign link');
  assert.ok(body.html.includes('August FTL 9 Hole Scramble'), 'must name the event');
  assert.ok(!/service fee/i.test(body.html), 'we do not surcharge the buyer');
});

// Decode an RFC 2047 encoded-word header back to text, the way a mail client does.
function decodeHeader(value) {
  return value
    .split(/\r\n /).join('')
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
}

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh',
};

function googleFetch(calls, { expiresIn = 3600 } = {}) {
  return async (url, init) => {
    calls.push({ url, init });
    if (url.includes('oauth2.googleapis.com')) {
      return { ok: true, json: async () => ({ access_token: 'at_' + calls.length, expires_in: expiresIn }) };
    }
    return { ok: true, json: async () => ({ id: 'gmail_1' }) };
  };
}

test('Google is preferred over Resend, because it adds no extra service', () => {
  assert.equal(createEmailer({}).transport, '');
  assert.equal(createEmailer({ RESEND_API_KEY: 'k' }).transport, 'resend');
  assert.equal(createEmailer(GOOGLE_ENV).transport, 'google');
  assert.equal(createEmailer({ ...GOOGLE_ENV, RESEND_API_KEY: 'k' }).transport, 'google');
  // A half-configured Google setup must not disable Resend or half-send.
  assert.equal(createEmailer({ GOOGLE_CLIENT_ID: 'cid', RESEND_API_KEY: 'k' }).transport, 'resend');
  assert.equal(createEmailer({ GOOGLE_CLIENT_ID: 'cid' }).transport, '');
});

test('the Google transport exchanges the refresh token, then sends', async () => {
  const calls = [];
  const mailer = createEmailer(GOOGLE_ENV, googleFetch(calls));
  await mailer.sendOrderConfirmation(ORDER);

  assert.equal(calls.length, 2, 'one token exchange, one send');
  assert.match(calls[0].url, /oauth2\.googleapis\.com/);
  assert.match(calls[0].init.body, /grant_type=refresh_token/);
  assert.match(calls[1].url, /gmail\.googleapis\.com/);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer at_1');

  const raw = Buffer.from(JSON.parse(calls[1].init.body).raw, 'base64url').toString('utf8');
  assert.match(raw, /^From: PWRHaus Golf Society <hello@pwrhausgolfsociety\.com>/m);
  assert.match(raw, /^To: buyer@example\.com$/m);
  assert.match(raw, /^Content-Type: text\/html; charset="UTF-8"$/m);

  const subject = decodeHeader(raw.match(/^Subject: (.*(?:\r\n .*)*)$/m)[1]);
  assert.equal(subject, 'Your tickets \u2014 ' + ORDER.eventName);

  const body = Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.match(body, /Add your guests/, 'the manage link must survive encoding');
  assert.match(body, /Jane Buyer/);
});

test('the access token is reused across sends in one invocation', async () => {
  const calls = [];
  const mailer = createEmailer(GOOGLE_ENV, googleFetch(calls));
  await mailer.sendAttendeeTicket({ to: 'a@b.c', attendeeName: 'A', eventName: 'E', startsAt: ORDER.startsAt, venue: 'V', ticketNo: 'n', orderNo: 'o' });
  await mailer.sendAttendeeTicket({ to: 'd@e.f', attendeeName: 'D', eventName: 'E', startsAt: ORDER.startsAt, venue: 'V', ticketNo: 'n', orderNo: 'o' });
  // Four attendee tickets should not mean four token exchanges.
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1);
  assert.equal(calls.filter((c) => c.url.includes('gmail')).length, 2);
});

test('an expired access token is refreshed rather than reused', async () => {
  const calls = [];
  const mailer = createEmailer(GOOGLE_ENV, googleFetch(calls, { expiresIn: 0 }));
  await mailer.sendAttendeeTicket({ to: 'a@b.c', attendeeName: 'A', eventName: 'E', startsAt: ORDER.startsAt, venue: 'V', ticketNo: 'n', orderNo: 'o' });
  await mailer.sendAttendeeTicket({ to: 'd@e.f', attendeeName: 'D', eventName: 'E', startsAt: ORDER.startsAt, venue: 'V', ticketNo: 'n', orderNo: 'o' });
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 2);
});

test('a Google failure is surfaced, not swallowed', async () => {
  const failing = async (url) => url.includes('oauth2')
    ? { ok: false, status: 401, json: async () => ({}) }
    : { ok: true, json: async () => ({}) };
  await assert.rejects(
    () => createEmailer(GOOGLE_ENV, failing).sendOrderConfirmation(ORDER),
    /google_token_failed_401/);

  const failingSend = async (url) => url.includes('oauth2')
    ? { ok: true, json: async () => ({ access_token: 'at', expires_in: 3600 }) }
    : { ok: false, status: 500, json: async () => ({}) };
  await assert.rejects(
    () => createEmailer(GOOGLE_ENV, failingSend).sendOrderConfirmation(ORDER),
    /gmail_send_failed_500/);
});

test('header encoding leaves ASCII alone and round-trips non-ASCII', () => {
  assert.equal(encodeHeaderValue('Plain subject'), 'Plain subject');
  assert.equal(encodeHeaderValue(''), '');

  const long = 'Your tickets \u2014 August FTL 9 Hole Scramble (Co-Ed) \u2014 Plantation Preserve';
  const encoded = encodeHeaderValue(long);
  assert.match(encoded, /^=\?UTF-8\?B\?/);
  assert.equal(decodeHeader(encoded), long, 'a mail client must read back exactly what we meant');
  // Encoded-words cap at 75 characters, so long subjects must fold.
  for (const line of encoded.split('\r\n ')) assert.ok(line.length <= 75, `line too long: ${line.length}`);
});

test('buildRawMessage wraps the base64 body to legal line lengths', () => {
  const raw = Buffer.from(buildRawMessage({
    fromName: 'PWRHaus Golf Society', fromEmail: 'hello@x.com', to: 'a@b.c',
    subject: 'Hi', html: '<p>' + 'x'.repeat(500) + '</p>',
  }), 'base64url').toString('utf8');
  const body = raw.split('\r\n\r\n')[1];
  for (const line of body.split('\r\n')) assert.ok(line.length <= 76, `body line too long: ${line.length}`);
});
