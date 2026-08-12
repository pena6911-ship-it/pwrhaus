(function () {
  var toggle = document.querySelector('.nav-toggle');
  var overlay = document.getElementById('nav-overlay');
  if (!toggle || !overlay) return;

  function focusable() {
    return overlay.querySelectorAll('a[href], button:not([disabled])');
  }

  function open() {
    overlay.hidden = false;
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    var items = focusable();
    if (items.length) items[0].focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.focus();
  }

  toggle.addEventListener('click', function () {
    if (overlay.hidden) open(); else close();
  });

  document.addEventListener('keydown', function (e) {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;

    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  window.addEventListener('resize', function () {
    if (overlay.hidden) return;
    if (window.innerWidth < 1024) return;
    overlay.hidden = true;
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  });
})();
