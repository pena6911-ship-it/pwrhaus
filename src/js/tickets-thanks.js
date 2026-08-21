// Reads ?session_id= (from Stripe Checkout's success_url) and resolves it to
// this order's manage link, so the buyer can add their guests right away —
// ticket email is dormant until RESEND_API_KEY exists, so this page is
// currently the only way the buyer reaches the assignment flow.
(function () {
  var root = document.getElementById('thanks-root');
  if (!root) return;
  var sessionId = new URLSearchParams(location.search).get('session_id') || '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function load() {
    if (!sessionId) {
      root.textContent = 'We could not find your order. Please check your email for your tickets.';
      return;
    }
    fetch('/api/tickets/lookup?session_id=' + encodeURIComponent(sessionId))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        if (data.unassigned_count > 0) {
          var seats = data.unassigned_count === 1 ? '1 more seat' : data.unassigned_count + ' more seats';
          root.innerHTML =
            '<p>You have ' + esc(seats) + ' to name. We will email each guest their own ticket.</p>' +
            '<p><a class="btn btn-primary" href="' + esc(data.manage_url) + '">Add your guests</a></p>';
        } else {
          root.innerHTML =
            '<p>Your ticket is confirmed and in your name &mdash; nothing else to do.</p>' +
            '<p><a href="' + esc(data.manage_url) + '">View your ticket</a></p>';
        }
      })
      .catch(function () {
        root.textContent = 'We could not find your order. Please check your email for your tickets.';
      });
  }

  load();
})();
