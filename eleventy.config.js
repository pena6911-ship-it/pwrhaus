export default function (eleventyConfig) {
  // Money is stored in integer cents; render it as USD. $35 not $35.00 when whole.
  eleventyConfig.addFilter('usd', (cents) => {
    const n = Number(cents) / 100;
    return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));
  });

  eleventyConfig.addPassthroughCopy('src/css');
  eleventyConfig.addPassthroughCopy('src/js');
  eleventyConfig.addPassthroughCopy('src/fonts');
  eleventyConfig.addPassthroughCopy('src/img');

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
