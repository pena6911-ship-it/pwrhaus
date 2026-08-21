// Renders each ticket's QR as inline SVG. The payload is the /checkin/ URL so
// any phone camera resolves it; scanning it alone does nothing — only a host
// with a dashboard session can actually record attendance.
(function () {
  function renderTicketQrs() {
    var nodes = document.querySelectorAll('[data-qr-token]');
    if (!nodes.length || typeof window.qrcodeSvg !== 'function') return;

    Array.prototype.forEach.call(nodes, function (el) {
      var token = el.getAttribute('data-qr-token');
      if (!token) return;
      var payload = location.origin + '/checkin/?t=' + encodeURIComponent(token);
      try {
        el.innerHTML = window.qrcodeSvg(payload);
      } catch (e) {
        el.textContent = 'Ticket code unavailable — show your ticket number to the host.';
      }
    });
  }

  window.renderTicketQrs = renderTicketQrs;
  renderTicketQrs();
})();
