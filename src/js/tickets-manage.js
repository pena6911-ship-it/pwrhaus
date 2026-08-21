// Reads ?token= and renders the order's tickets. The token is the only
// credential; it grants access to this order alone.
(function () {
  var root = document.getElementById('manage-root');
  if (!root) return;
  var token = new URLSearchParams(location.search).get('token') || '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // The actual ticket: what a holder shows at the door and what a host reads off it.
  function ticketCard(t, data) {
    var ev = data.event || {};
    var order = data.order || {};
    var where = [ev.venue, ev.city].filter(Boolean).join(', ');
    var tier = t.tier_sold === 'member' ? 'PWRHAUS Member' : 'Non-Member';

    var html = '<div class="ticket-card">';
    html += '<div class="ticket-card-body">';
    html += '<p class="ticket-event">' + esc(ev.name || '') + '</p>';

    html += '<p class="ticket-label">Time &amp; location</p>';
    html += '<p class="ticket-value">' + esc(fmtDateTime(ev.starts_at));
    if (where) { html += '<br>' + esc(where); }
    html += '</p>';

    html += '<p class="ticket-label">Attendee</p>';
    html += '<p class="ticket-value"><strong>' + esc(t.attendee.full_name) + '</strong><br>'
      + esc(t.attendee.email) + '</p>';

    html += '<p class="ticket-label">Ticket</p>';
    html += '<p class="ticket-value">' + esc(tier) + '</p>';

    if (order.ordered_by) {
      html += '<p class="ticket-label">Ordered by</p>';
      html += '<p class="ticket-value">' + esc(order.ordered_by);
      if (order.ordered_at) { html += '<br>' + esc(fmtDate(order.ordered_at)); }
      html += '</p>';
    }
    html += '</div>';

    html += '<div class="ticket-card-side">';
    html += '<p class="ticket-label">Ticket no.</p>';
    html += '<p class="ticket-value ticket-no">' + esc(t.ticket_no) + '</p>';
    if (order.order_no) {
      html += '<p class="ticket-label">Order no.</p>';
      html += '<p class="ticket-value">' + esc(order.order_no) + '</p>';
    }
    html += '<p class="ticket-label">Payment status</p>';
    html += '<p class="ticket-value"><strong>' + (order.paid ? 'Paid' : 'Pending') + '</strong></p>';
    html += '<div class="ticket-qr" data-qr-token="' + esc(t.qr_token || '') + '"></div>';
    html += '</div>';

    html += '</div>';
    html += '<p class="ticket-note">This is your event ticket &mdash; present it on arrival. '
      + 'You can print it or show this screen.</p>';
    return html;
  }

  function render(data) {
    if (!data.tickets.length) { root.textContent = 'No tickets found for this link.'; return; }
    if (data.assignment_open === false) {
      root.innerHTML = '<p>This event has passed. Tickets for it have expired and can no longer be named or changed.</p>';
      return;
    }
    var html = '<ul class="list-stack ticket-list">';
    data.tickets.forEach(function (t) {
      html += '<li class="card ticket-row">';
      if (!t.attendee) {
        html += '<p class="eyebrow">Ticket ' + esc(t.ticket_no) + ' &middot; ' +
          (t.tier_sold === 'member' ? 'PWRHAUS Member' : 'Non-Member') + '</p>';
      }
      if (t.attendee) {
        html += ticketCard(t, data);
      } else {
        html += '<form data-ticket="' + esc(t.id) + '" class="stack">' +
          '<div class="field">' +
          '<label for="tm-name-' + esc(t.id) + '">Guest name</label>' +
          '<input id="tm-name-' + esc(t.id) + '" name="full_name" type="text" required>' +
          '</div>' +
          '<div class="field">' +
          '<label for="tm-email-' + esc(t.id) + '">Guest email</label>' +
          '<input id="tm-email-' + esc(t.id) + '" name="email" type="email" required>' +
          '</div>' +
          '<button class="btn btn-primary" type="submit">Send their ticket</button>' +
          '<p class="form-msg" role="status"></p></form>';
      }
      html += '</li>';
    });
    root.innerHTML = html + '</ul>';
    if (window.renderTicketQrs) window.renderTicketQrs();

    root.querySelectorAll('form[data-ticket]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var msg = form.querySelector('.form-msg');
        msg.textContent = 'Sending…';
        fetch('/api/tickets/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: token, ticket_id: form.getAttribute('data-ticket'),
            full_name: form.full_name.value, email: form.email.value,
          }),
        }).then(function (r) { return r.json(); }).then(function (out) {
          if (out.ok) { load(); } else { msg.textContent = 'Could not save that — please check the details.'; }
        }).catch(function () { msg.textContent = 'Something went wrong. Please try again.'; });
      });
    });
  }

  function load() {
    if (!token) { root.textContent = 'This link is missing its code. Please use the link from your confirmation email.'; return; }
    fetch('/api/tickets/assign?token=' + encodeURIComponent(token))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(render)
      .catch(function () { root.textContent = 'We could not find those tickets. Please use the link from your confirmation email.'; });
  }

  load();
})();
