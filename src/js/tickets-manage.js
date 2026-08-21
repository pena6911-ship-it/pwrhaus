// Reads ?token= and renders the order's tickets. The token is the only
// credential; it grants access to this order alone.
(function () {
  var root = document.getElementById('manage-root');
  if (!root) return;
  var token = new URLSearchParams(location.search).get('token') || '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(data) {
    if (!data.tickets.length) { root.textContent = 'No tickets found for this link.'; return; }
    var html = '<ul class="list-stack ticket-list">';
    data.tickets.forEach(function (t) {
      html += '<li class="card ticket-row"><p class="eyebrow">Ticket ' + esc(t.ticket_no) + ' &middot; ' +
        (t.tier_sold === 'member' ? 'PWRHAUS Member' : 'Non-Member') + '</p>';
      if (t.attendee) {
        html += '<p><strong>' + esc(t.attendee.full_name) + '</strong><br>' + esc(t.attendee.email) + '</p>';
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
