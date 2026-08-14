(function () {
  var gate = document.querySelector('[data-gate]');
  if (!gate) return;

  // Passing the gate (a successful submit) is remembered permanently; a soft
  // dismiss ("explore first", Esc, backdrop) only lasts the session, so a
  // return visit gets one more gentle prompt.
  var PASSED = 'phGatePassed';
  var SKIPPED = 'phGateSkipped';

  function stored(store, key) {
    try { return window[store].getItem(key); } catch (e) { return null; }
  }
  function remember(store, key) {
    try { window[store].setItem(key, '1'); } catch (e) {}
  }

  if (stored('localStorage', PASSED) || stored('sessionStorage', SKIPPED)) return;

  var form = gate.querySelector('[data-gate-form]');
  var button = form && form.querySelector('button[type="submit"]');
  var errorEl = form && form.querySelector('[data-gate-error]');
  var skip = gate.querySelector('[data-gate-skip]');
  var lastFocus = document.activeElement;
  var root = document.documentElement;

  function focusable() {
    var sel = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea,[tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(gate.querySelectorAll(sel), function (el) {
      return el.offsetParent !== null; // visible only
    });
  }

  function onKey(e) {
    if (e.key === 'Escape') { softClose(); return; }
    if (e.key !== 'Tab') return;
    var list = focusable();
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    gate.hidden = false;
    root.classList.add('gate-active');
    document.body.classList.add('gate-open');
    if (button) button.disabled = false;
    document.addEventListener('keydown', onKey, true);
    var first = form && form.querySelector('input:not([type="hidden"]):not([tabindex="-1"])');
    if (first) first.focus();
  }

  function close() {
    root.classList.remove('gate-active');
    document.body.classList.remove('gate-open');
    gate.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function softClose() {
    remember('sessionStorage', SKIPPED);
    close();
  }

  if (skip) skip.addEventListener('click', softClose);

  // Click on the backdrop (not the dialog) is a soft dismiss.
  gate.addEventListener('click', function (e) {
    if (e.target === gate) softClose();
  });

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
      if (button) button.disabled = true;

      var data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });

      fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          if (res.status === 201) {
            remember('localStorage', PASSED); // captured — never gate them again
            close();
            return;
          }
          return res.json()
            .catch(function () { return {}; })
            .then(function (body) {
              var err = new Error('gate_submit_failed');
              err.friendly = body && body.error === 'invalid_email'
                ? 'That email address does not look right. Please check it and try again.'
                : 'Something went wrong. Please try again.';
              throw err;
            });
        })
        .catch(function (err) {
          if (button) button.disabled = false;
          if (window.console && console.error) console.error('gate submit failed', err);
          if (errorEl) {
            errorEl.textContent = err.friendly || 'Something went wrong. Please try again.';
            errorEl.hidden = false;
          }
        });
    });
  }

  open();
})();
