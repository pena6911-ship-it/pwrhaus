export default function (eleventyConfig) {
  // Money is stored in integer cents; render it as USD. $35 not $35.00 when whole.
  eleventyConfig.addFilter('usd', (cents) => {
    const n = Number(cents) / 100;
    return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));
  });

  const sortByStart = (events = []) =>
    [...events].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  eleventyConfig.addFilter('eventDate', (value) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(value)),
  );

  eleventyConfig.addFilter('upcomingEvents', (events = []) => {
    const now = new Date();
    return sortByStart(events).filter((event) => new Date(event.starts_at) >= now);
  });

  eleventyConfig.addFilter('pastEvents', (events = []) => {
    const now = new Date();
    return sortByStart(events)
      .filter((event) => new Date(event.starts_at) < now)
      .reverse();
  });

  eleventyConfig.addPassthroughCopy('src/css');
  eleventyConfig.addPassthroughCopy('src/js');
  eleventyConfig.addPassthroughCopy('src/fonts');
  eleventyConfig.addPassthroughCopy('src/img');
  eleventyConfig.addPassthroughCopy('src/admin/admin.css');
  eleventyConfig.addPassthroughCopy('src/admin/app.js');
  eleventyConfig.addPassthroughCopy('src/admin/lib.js');
  eleventyConfig.addPassthroughCopy('src/admin/sw.js');
  eleventyConfig.addPassthroughCopy('src/admin/manifest.webmanifest');

  return {
    dir: {
      input: 'src',
      output: 'public',
      includes: '_includes',
      data: '_data',
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    templateFormats: ['njk', 'md', 'html'],
  };
}
