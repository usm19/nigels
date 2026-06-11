import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Sanitise job-description HTML (Reed's details endpoint returns HTML).
 * Only harmless formatting tags survive; links open safely in a new tab.
 */
export function sanitizeJobHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "a",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}

/** Strip all HTML and decode common entities, leaving readable plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const stripped = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return stripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
