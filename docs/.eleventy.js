export default function (eleventyConfig) {
  // Pass through static assets
  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/js");

  // Markdown library with syntax highlighting
  eleventyConfig.setLibrary("md", undefined);

  // Copy button shortcode
  eleventyConfig.addShortcode("copyButton", () =>
    `<button class="copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code')?.textContent || '')">Copy</button>`
  );

  // Date filter
  eleventyConfig.addFilter("date", (d) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }));

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
