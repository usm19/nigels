// UI smoke test for Nigel's. Drives the real app in Edge via Playwright:
// console errors, themes, responsive layouts, detail-view layout, autocomplete.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.NIGELS_URL ?? "http://localhost:3000";
const SHOTS = process.env.NIGELS_SHOTS ?? "C:/Users/shahi/AppData/Local/Temp/claude/nigels-shots";
mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const failures = [];
const passes = [];

function check(name, ok, extra = "") {
  (ok ? passes : failures).push(`${name}${extra ? ` — ${extra}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });

async function newPage(context) {
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  return page;
}

// ---------- Desktop ----------
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await newPage(desktop);
await page.goto(BASE, { waitUntil: "networkidle" });

await page.waitForSelector("role=tab[name=/Jobs/]");
const cardCount = await page.locator("main ul > li button").count();
check("jobs list renders cards", cardCount > 0, `${cardCount} cards`);

// live timer ticks
const timerSel = "header span.tabular-nums >> nth=0";
const t1 = await page.locator(timerSel).first().innerText();
await page.waitForTimeout(2500);
const t2 = await page.locator(timerSel).first().innerText();
check("top bar clock/timer is ticking", t1 !== t2, `"${t1}" -> "${t2}"`);

// posted-ago labels present on cards
const agoText = await page.locator("main ul > li button >> nth=0").innerText();
check(
  "card shows a live 'posted X ago' label",
  /just now|minute|hour/.test(agoText)
);

await page.screenshot({ path: `${SHOTS}/desktop-royal-jobs.png`, fullPage: false });

// theme toggle -> Galaxy
await page.click('button[aria-label*="Galaxy"]');
await page.waitForTimeout(400);
const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
check("theme toggles to Galaxy (dark)", isDark);
await page.screenshot({ path: `${SHOTS}/desktop-galaxy-jobs.png` });

// open detail view
await page.locator("main ul > li button").first().click();
await page.waitForSelector('a:has-text("View / Apply on")');
const link = page.locator('a:has-text("View / Apply on")').first();
const target = await link.getAttribute("target");
const rel = await link.getAttribute("rel");
const href = await link.getAttribute("href");
check(
  "detail external link opens new tab safely",
  target === "_blank" && (rel ?? "").includes("noopener") && /^https?:\/\//.test(href ?? "")
);
const linkBox = await link.boundingBox();
const titleBox = await page.locator("#job-detail-title").boundingBox();
check(
  "external link sits ABOVE the description/title",
  linkBox && titleBox && linkBox.y < titleBox.y
);
const hasApplied = await page.locator('button:has-text("Mark as applied")').count();
check("detail has Mark-as-applied button", hasApplied > 0);
await page.screenshot({ path: `${SHOTS}/desktop-galaxy-detail.png` });

// back works
await page.click('button:has-text("Back to list")');
await page.waitForSelector("main ul > li button");
check("back returns to the list", true);

// alerts tab + autocomplete
await page.click("#tab-alerts");
await page.waitForSelector('button:has-text("New alert")');
await page.click('button:has-text("New alert")');
await page.fill('input[role="combobox"]', "adm");
await page.waitForSelector('[role="listbox"] [role="option"]');
const options = await page.locator('[role="option"]').allInnerTexts();
check(
  "autocomplete suggests admin titles for 'adm'",
  options.some((o) => o.includes("admin")),
  options.slice(0, 4).join(" | ")
);
// keyboard: arrow down + enter adds a tag
await page.press('input[role="combobox"]', "ArrowDown");
await page.press('input[role="combobox"]', "Enter");
const chip = await page.locator('span:has-text("admin") >> nth=0').count();
check("keyboard selection adds a tag chip", chip > 0);
await page.screenshot({ path: `${SHOTS}/desktop-galaxy-alerts.png` });
// leave without saving
await page.click('button:has-text("Cancel")');

await desktop.close();

// ---------- Mobile ----------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mpage = await newPage(mobile);
await mpage.goto(BASE, { waitUntil: "networkidle" });
await mpage.waitForSelector("main ul > li button");
await mpage.screenshot({ path: `${SHOTS}/mobile-royal-jobs.png` });
const hOverflow = await mpage.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
);
check("no horizontal overflow on mobile", !hOverflow);
await mpage.locator("main ul > li button").first().tap();
await mpage.waitForSelector('a:has-text("View / Apply on")');
await mpage.screenshot({ path: `${SHOTS}/mobile-royal-detail.png` });
await mobile.close();

await browser.close();

check("zero browser console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));

console.log(`\n${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length > 0 ? 1 : 0);
