# B4 — Manual verification checklist

The static tests in `test/accessibility.test.js` assert the rules that produce correct
layout. They cannot prove a render: Node has no layout engine, and a headless browser was
deliberately declined (see plan D4). These are the checks that need a real browser and,
for the last group, real hardware.

Run with `npm run dev`, or against a Netlify deploy preview.

## Every page, at every width

Pages: `/`, `/about/`, `/membership/`, `/lessons/`, `/sponsors/`, `/corporate/`,
`/events/`, `/thanks/`, `/404.html`

Widths: **320, 375, 390, 768, 820, 1024, 1280, 1440**

- [ ] No horizontal scroll on the body at any width
- [ ] No text clipped, overlapping, or escaping its container
- [ ] Every interactive element is at least 44x44 CSS px, with at least 8px between adjacent targets
- [ ] Nothing depends on hover to be usable

## Sticky CTA

- [ ] Hidden while the hero is on screen; appears once it scrolls away
- [ ] Gone entirely from 768px up
- [ ] Never covers the footer credit — scroll to the very bottom and confirm
- [ ] Carries the right label per page: free profile on home/about/membership, the page's own
      enquiry on lessons/sponsors/corporate/events
- [ ] On a notched iPhone, sits above the home indicator rather than under it
- [ ] On `/thanks/` and `/404.html` the bar may never appear, because those pages can be
      short enough that the hero never leaves the viewport. This is expected, not a bug:
      a visitor on `/thanks/` has already converted, and `/404.html` carries two inline CTAs.

## Hero

- [ ] Reaches 60vh from 1024px up, and never 100vh
- [ ] Media column bleeds to the right viewport edge; text stays aligned with the container
- [ ] Below 1024px the media is absent and the hero is a normal padded section

## Keyboard

- [ ] First Tab reveals the skip link; activating it moves focus to the main content
- [ ] Every interactive element shows the brass focus ring
- [ ] Nav overlay at 375px: Tab cycles inside it, Esc closes it, focus returns to the toggle
- [ ] Crossing 1024px with the overlay open clears the scroll lock

## Real device — cannot be simulated

- [ ] On a real iPhone, tapping any form input does **not** zoom the viewport
- [ ] Rotate an iPad while the nav overlay is open: page scroll is not left locked
- [ ] `prefers-reduced-motion` enabled: no transition runs

## Forms, against `netlify dev`

- [ ] Submitting from `/lessons/` writes one `contacts` row and one `contact_inquiries` row
      with `source = 'web_lessons'`
- [ ] Submitting from `/corporate/` with the same email adds no second contact row and a
      second inquiry row with `source = 'web_corporate'`
- [ ] A malformed email shows the inline error and the button re-enables
