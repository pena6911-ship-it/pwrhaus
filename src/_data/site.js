// Netlify sets URL to the site's primary address, which follows the custom
// domain after DNS cutover. The literal below is only used for local builds —
// it must never be what a production page declares as its canonical.
export default {
  name: 'PWRHaus Golf Society',
  shortName: 'PWRHaus',
  tagline: 'Claim your place on the green',
  description: 'A co-ed society of founders who use golf to find, build, and exit businesses.',
  url: process.env.URL || 'https://pwrhaus.netlify.app',
};
