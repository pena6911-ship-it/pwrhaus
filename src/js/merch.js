// Merch "Buy" → create a Stripe Checkout Session server-side, then redirect to
// Stripe's hosted checkout. No-ops on pages without a [data-buy] button.
(function () {
  var buttons = document.querySelectorAll('[data-buy]');
  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = 'Redirecting…';
      fetch('/api/merch/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ slug: btn.dataset.slug, variant_id: Number(btn.dataset.variant), quantity: 1 }],
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.url) { window.location = d.url; return; }
          throw new Error(d && d.error ? d.error : 'checkout_failed');
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = original;
          if (window.console && console.error) console.error('merch checkout failed', err);
          alert('Sorry — checkout could not start. Please try again.');
        });
    });
  });
})();
