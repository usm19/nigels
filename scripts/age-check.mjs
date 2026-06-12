// Focused check: cards show REAL varied posting ages, not a flood of "just now".
import { chromium } from "playwright";
const BASE = process.env.NIGELS_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("main ul > li");
await page.waitForTimeout(1200);

// The corner relative-age span is the first child of the items-end wrapper
// (salary badges are also gold, so scope precisely to avoid them).
const corners = await page
  .locator("main ul > li span.items-end > span.text-gold")
  .allInnerTexts();
const stamps = await page
  .locator("main ul > li span.items-end > span.text-ink-soft")
  .allInnerTexts();
const justNow = corners.filter((c) => /just now/i.test(c)).length;
const realAges = corners.filter((c) => /\d+\s+(second|minute|hour)|yesterday|today|\d+ days/i.test(c)).length;

console.log(`cards: ${corners.length}`);
console.log(`"just now" labels: ${justNow}`);
console.log(`real-age labels: ${realAges}`);
console.log(`sample ages: ${corners.slice(0, 6).join(" | ")}`);
console.log(`sample exact stamps: ${stamps.slice(0, 4).join(" | ")}`);
console.log(`console errors: ${errors.length}`);

const pass =
  corners.length > 0 &&
  justNow <= 2 && // at most a couple genuinely-seconds-old jobs
  realAges >= corners.length - 3 &&
  stamps.length > 0 &&
  errors.length === 0;
console.log(pass ? "\nPASS: real varied posting ages shown, no 'just now' flood" : "\nFAIL: check above");
await browser.close();
process.exit(pass ? 0 : 1);
