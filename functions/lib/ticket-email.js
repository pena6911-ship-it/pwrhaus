// Ticket email. Written against Resend but DORMANT until RESEND_API_KEY exists
// (the sending domain is blocked on the DNS migration). Every method resolves
// { skipped: true } when disabled so no caller needs to branch.
const ENDPOINT = 'https://api.resend.com/emails';

const usd = (cents) => '$' + (Number(cents) / 100).toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const when = (iso) => new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso));

export function createEmailer(env = {}, fetchImpl = fetch) {
  const key = env.RESEND_API_KEY;
  const from = env.TICKETS_FROM_EMAIL || 'hello@pwrhausgolfsociety.com';
  const enabled = Boolean(key);

  const send = async ({ to, subject, html }) => {
    if (!enabled) return { skipped: true };
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `PWRHaus Golf Society <${from}>`, to, subject, html }),
    });
    if (!res.ok) throw new Error(`resend_failed_${res.status}`);
    return res.json();
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
