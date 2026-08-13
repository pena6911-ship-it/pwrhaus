(function () {
  var bar = document.querySelector('[data-sticky-cta]');
  if (!bar) return;

  function reveal() {
    bar.hidden = false;
    document.body.classList.add('has-sticky-cta');
  }
  function conceal() {
    bar.hidden = true;
    document.body.classList.remove('has-sticky-cta');
  }

  // Every page's hero is the first section in <main> by construction, so no
  // page needs a marker attribute and no page can forget one.
  var hero = document.querySelector('main > section');

  // No hero (or no IntersectionObserver): show the bar rather than lose the CTA.
  if (!hero || !('IntersectionObserver' in window)) {
    reveal();
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) conceal(); else reveal();
    });
  });

  observer.observe(hero);
})();
