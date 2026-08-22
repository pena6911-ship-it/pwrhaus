// The events listing is static, so ticketed cards refresh their availability
// from Supabase through the public serverless endpoint after the page loads.
(function () {
  var slots = document.querySelectorAll('[data-event-slug].event-availability');
  if (!slots.length) return;

  Array.prototype.forEach.call(slots, function (slot) {
    var slug = slot.getAttribute('data-event-slug');
    var capacity = Number(slot.getAttribute('data-capacity')) || 0;
    fetch('/api/tickets/availability?slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (availability) {
        var remaining = Math.max(0, Number(availability.remaining));
        slot.textContent = remaining === 0
          ? 'Sold out'
          : remaining + (remaining === 1 ? ' spot available' : ' spots available');
      })
      .catch(function () {
        // Keep the capacity fallback visible if the live endpoint is
        // temporarily unavailable.
        slot.textContent = capacity + (capacity === 1 ? ' spot available' : ' spots available');
      });
  });
})();
