import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailer } from '../functions/lib/ticket-email.js';

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
