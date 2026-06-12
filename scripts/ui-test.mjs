// Full UI test for Nigel's v3. Drives the real app in Edge via Playwright:
// sidebar nav (desktop + mobile drawer), Government tab, sector filter,
// Settings, source/sector badges, real posting ages, no-reset-on-refresh,
// the always-on filter has NO disable control, themes, responsive, regressions.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.NIGELS_URL ?? "http://localhost:3000";
const SHOTS =
  process.env.NIGELS_SHOTS ??
  "C:/Users/shahi/AppData/Local/Temp/claude/nigels-shots-v3";
mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const failures = [];
let passes = 0;

function check(name, ok, extra = "") {
  if (ok) passes++;
  else failures.push(name);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });

async function newPage(context) {
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  return page;
}

// Desktop nav lives in <aside>; scope clicks there to avoid the mobile drawer.
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await newPage(desktop);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("aside nav");

check(
  "desktop shows a persistent sidebar",
  await page.locator("aside nav").isVisible()
);
await page.waitForSelector("main ul > li h3");
const jobsCount = await page.locator("main ul > li").count();
check("Jobs tab lists cards", jobsCount > 0, `${jobsCount} cards`);
await page.screenshot({ path: `${SHOTS}/desktop-royal-jobs.png` });

// --- source + sector badges present ---
const allBadgeText = (await page.locator("main ul > li").first().innerText()).toLowerCase();
check(
  "cards show a source badge (Adzuna/Reed/Jooble/JSearch)",
  /adzuna|reed|jooble|jsearch/.test(allBadgeText)
);

// --- Government tab: ONLY government employers ---
await page.click('aside nav button:has-text("Government")');
await page.waitForSelector('section[aria-label="Government job search"]');
await page.waitForTimeout(600);
const govTitles = await page.locator("main ul > li").count();
const govEmployers = await page
  .locator("main ul > li p")
  .allInnerTexts();
const govLooksGov =
  govEmployers.length > 0 &&
  govEmployers.every((t) => /council|authority|civil service|hm |ministry|department|government|gov\.uk|nhs/i.test(t));
check(
  "Government tab shows only government employers",
  govTitles > 0 && govLooksGov,
  `${govTitles} cards; e.g. ${govEmployers[0] ?? "none"}`
);
await page.screenshot({ path: `${SHOTS}/desktop-royal-government.png` });

// --- Jobs tab sector sub-filter cleanly isolates ---
await page.click('aside nav button:has-text("Jobs")');
await page.waitForSelector('section[aria-label="Job search"]');
// Assert via the sector BADGE each card renders (reflects job.sector exactly),
// not employer/location text (a private job can be located "at" a university).
async function cardSectorBadges() {
  const cards = await page.locator("main ul > li").allInnerTexts();
  return cards.map((t) =>
    /\bGovernment\b/.test(t) ? "government"
      : /Public sector/.test(t) ? "public_sector"
      : "private"
  );
}
const sectorBtn = (label) =>
  page.locator(`div[aria-label="Sector"] button`, { hasText: label }).first();
await sectorBtn("Public sector").click();
await page.waitForTimeout(600);
const pubBadges = await cardSectorBadges();
check(
  "Jobs → Public sector shows ONLY public-sector jobs",
  pubBadges.length > 0 && pubBadges.every((s) => s === "public_sector"),
  `${pubBadges.length} cards`
);
await sectorBtn("Private").click();
await page.waitForTimeout(600);
const privBadges = await cardSectorBadges();
check(
  "Jobs → Private shows ONLY private jobs (no government/public-sector badge)",
  privBadges.length > 0 && privBadges.every((s) => s === "private"),
  `${privBadges.length} private cards`
);
await sectorBtn("All").click();
await page.waitForTimeout(400);

// --- HEADLINE: real posting age + no reset on refresh ---
const apiJobs = await page.evaluate(async () => (await (await fetch("/api/jobs")).json()).jobs);
const exact = apiJobs.find(
  (j) => j.status === "active" && j.posted_time_precision === "exact" && j.source === "adzuna" && j.source_posted_date
);
if (exact) {
  const corner = (await page.locator(`li[data-job-id="${exact.id}"] span.text-gold`).first().innerText()).trim();
  const realMin = Math.floor((Date.now() - Date.parse(exact.source_posted_date)) / 60000);
  const okAge =
    /just now|second|minute|hour/.test(corner) &&
    (realMin < 1 || /minute|hour|just now|second/.test(corner));
  check("Adzuna card shows a real to-the-minute posting age", okAge, `"${corner}" vs ~${realMin}m`);
}
const before = new Map();
for (const li of await page.locator("main ul > li").elementHandles()) {
  const id = await li.getAttribute("data-job-id");
  const c = await (await li.$("span.text-gold"))?.innerText();
  if (id) before.set(id, c ?? "");
}
await page.click('header button:has-text("Refresh")');
await page.waitForFunction(
  () => !document.querySelector("header")?.innerText.includes("Refreshing"),
  { timeout: 120000 }
);
await page.waitForTimeout(1500);
let reset = 0, compared = 0;
for (const li of await page.locator("main ul > li").elementHandles()) {
  const id = await li.getAttribute("data-job-id");
  const c = await (await li.$("span.text-gold"))?.innerText();
  if (id && before.has(id) && /minute|hour/.test(before.get(id))) {
    compared++;
    if (/just now|^0 |^1 second/.test(c ?? "")) reset++;
  }
}
check("posting ages did NOT reset to 'just now' after Refresh", compared > 0 && reset === 0, `${compared} compared, ${reset} reset`);

// --- autocomplete (regression) ---
await page.locator('input[role="combobox"]').first().fill("adm");
await page.waitForSelector('[role="option"]');
const opts = await page.locator('[role="option"]').allInnerTexts();
check("autocomplete suggests admin titles", opts.some((o) => o.includes("administrator")));
await page.keyboard.press("Escape");
await page.locator('input[role="combobox"]').first().fill("");

// --- detail view (regression): link at top, mark applied ---
await page.locator('main ul > li button[aria-label^="Open"]').first().click();
await page.waitForSelector('a:has-text("View / Apply on")');
const link = page.locator('a:has-text("View / Apply on")').first();
const lb = await link.boundingBox();
const tb = await page.locator("#job-detail-title").boundingBox();
check("detail: external link sits above the title", lb && tb && lb.y < tb.y);
check("detail: link opens in a new tab safely",
  (await link.getAttribute("target")) === "_blank" && ((await link.getAttribute("rel")) ?? "").includes("noopener"));
await page.click('button:has-text("Mark as applied")');
await page.waitForSelector('button:has-text("Un-apply")');
await page.click('button:has-text("Un-apply")');
await page.waitForSelector('button:has-text("Mark as applied")');
check("Mark as applied / un-apply round trip works", true);
await page.click('button:has-text("Back to list")');
await page.waitForSelector("main ul > li h3");

// --- Settings: theme present, and NO halal/commission disable control anywhere ---
await page.click('aside nav button:has-text("Settings")');
await page.waitForSelector('h2:has-text("Theme")');
check("Settings has a theme chooser", (await page.locator('button:has-text("Royal"), button:has-text("Galaxy")').count()) >= 2);
// Scan EVERY tab for any toggle/switch/checkbox to disable the always-on
// filter. Word boundaries + excluding job-card open/hide buttons avoids
// false positives from legitimate job content ("Commissioning Manager",
// a "Halal Butcher" carve-out job).
let disableControl = 0;
const filterWord = /\b(halal|haram|commission|sharia)\b/;
for (const t of ["jobs", "government", "applied", "saved", "settings"]) {
  await page.click(`aside nav button:has-text("${t[0].toUpperCase() + t.slice(1)}")`);
  await page.waitForTimeout(300);
  const controls = await page
    .locator('input[type=checkbox], [role=switch], button[aria-pressed]')
    .all();
  for (const c of controls) {
    const aria = (await c.getAttribute("aria-label")) ?? "";
    if (/^(open|hide)\b/i.test(aria)) continue; // job-card nav buttons
    const label = `${aria} ${await c.innerText().catch(() => "")}`.toLowerCase();
    if (filterWord.test(label)) disableControl++;
  }
}
check("NO control anywhere to disable the halal/commission filter", disableControl === 0, `${disableControl} found`);

// --- theme toggle ---
await page.click('aside nav button:has-text("Settings")');
await page.click('button:has-text("Galaxy")');
await page.waitForTimeout(400);
check("theme switches to Galaxy", await page.evaluate(() => document.documentElement.classList.contains("dark")));
await page.click('aside nav button:has-text("Jobs")');
await page.screenshot({ path: `${SHOTS}/desktop-galaxy-jobs.png` });
await desktop.close();

// --- MOBILE: drawer nav ---
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mpage = await newPage(mobile);
await mpage.goto(BASE, { waitUntil: "networkidle" });
await mpage.waitForSelector("main ul > li h3");
check("desktop sidebar is hidden on mobile", !(await mpage.locator("aside nav").isVisible().catch(() => false)));
const hOverflow = await mpage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
check("no horizontal overflow on mobile", !hOverflow);
await mpage.screenshot({ path: `${SHOTS}/mobile-royal-jobs.png` });
await mpage.click('button[aria-label="Open menu"]');
await mpage.waitForSelector('[role="dialog"] nav');
check("mobile hamburger opens the nav drawer", await mpage.locator('[role="dialog"] nav').isVisible());
await mpage.screenshot({ path: `${SHOTS}/mobile-drawer.png` });
await mpage.click('[role="dialog"] nav button:has-text("Government")');
await mpage.waitForSelector('section[aria-label="Government job search"]');
check("mobile drawer navigates and closes", !(await mpage.locator('[role="dialog"]').isVisible().catch(() => false)));
await mpage.screenshot({ path: `${SHOTS}/mobile-government.png` });
await mobile.close();

await browser.close();
check("zero browser console errors across the whole run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) console.log("FAILED: " + failures.join(" | "));
process.exit(failures.length > 0 ? 1 : 0);
