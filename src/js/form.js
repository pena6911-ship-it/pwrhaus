(function () {
  var forms = document.querySelectorAll('[data-capture-form]');

  Array.prototype.forEach.call(forms, function (form) {
    var errorEl = form.querySelector('[data-form-error]');
    var button = form.querySelector('button[type="submit"]');

    // The button ships disabled; enabling it here is what makes the form
    // usable, so a no-JS visitor can never submit into the void.
    if (button) button.disabled = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
      if (button) button.disabled = true;

      var data = {};
      var fd = new FormData(form);
      fd.forEach(function (value, key) { data[key] = value; });

      fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          if (res.status === 201) { window.location.href = '/thanks/'; return; }
          return res.json().then(function (body) {
            throw new Error(body && body.error === 'invalid_email'
              ? 'That email address does not look right. Please check it and try again.'
              : 'Something went wrong. Please try again.');
          });
        })
        .catch(function (err) {
          if (button) button.disabled = false;
          if (errorEl) {
            errorEl.textContent = err.message || 'Something went wrong. Please try again.';
            errorEl.hidden = false;
          }
        });
    });
  });
})();
