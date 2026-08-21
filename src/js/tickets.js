// Posts the buyer's details to /api/tickets/checkout and redirects to Stripe.
// Price is never sent from here — the server decides it.
(function () {
  var form = document.getElementById('ticket-form');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = form.querySelector('.form-msg');
    msg.textContent = 'Taking you to secure checkout…';
    fetch('/api/tickets/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: form.getAttribute('data-slug'),
        full_name: form.full_name.value,
        email: form.email.value,
        quantity: Number(form.quantity.value),
      }),
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (out.url) { location.href = out.url; return; }
      var errors = {
        tickets_disabled: 'Ticket sales are not open for this event yet.',
        sales_closed: 'Ticket sales have closed for this event.',
        event_passed: 'This event has already taken place.',
        insufficient_capacity: 'Sorry — there are not enough spots left.',
        email_required: 'Please enter a valid email address.',
      };
      msg.textContent = errors[out.error] || 'We could not start checkout. Please try again.';
    }).catch(function () { msg.textContent = 'We could not start checkout. Please try again.'; });
  });
})();
