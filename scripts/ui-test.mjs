// Full UI test for Nigel's v2. Drives the real app in Edge via Playwright:
// real posting ages, no-reset-on-refresh, title-only search, all filters,
// saved searches, hide, themes, responsive layouts, zero console errors.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.NIGELS_URL ?? "http://localhost:3000";
const SHOTS =
  process.env.NIGELS_SHOTS ??
  "C:/Users/shahi/AppData/Local/Temp/claude/nigels-shots-v2";
mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const failures = [];
let passes = 0;

function check(name, ok, extra = "") {
  if (ok) passes++;
  else failures.push(name);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? ` — ${extra}` : ""}`);
}

function parseAgeSeconds(text) {
  if (/just now/.test(text)) return 0;
  let m = /(\d+) seconds? ago/.exec(text);
  if (m) return Number(m[1]);
  m = /(\d+) minutes? ago/.exec(text);
  if (m) return Number(m[1]) * 60;
  m = /(\d+) hours? ago/.exec(text);
  if (m) return Number(m[1]) * 3600;
  if (/1 (minute|hour) ago/.test(text)) return /minute/.test(text) ? 60 : 3600;
  return null; // "today" / "yesterday" / unknown
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

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await newPage(desktop);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("main ul > li h3");

// --- search bar present + cards rendered -----------------------------------
check(
  "main search bar is at the top",
  (await page.locator('section[aria-label="Job search"]').count()) === 1
);
const cardCount = await page.locator("main ul > li").count();
check("jobs list renders cards", cardCount > 0, `${cardCount} cards`);

// --- HEADLINE: displayed age matches the REAL posting time ------------------
const apiJobs = await page.evaluate(async () => {
  const r = await fetch("/api/jobs");
  return (await r.json()).jobs;
});
const newestExact = apiJobs.find(
  (j) => j.status === "active" && j.source !== "reed" && j.source_posted_date
);
if (newestExact) {
  const card = page
    .locator(`li[data-job-id="${newestExact.id}"]`)
    .first();
  const corner = await card.locator("span.text-gold").first().innerText();
  const shownSecs = parseAgeSeconds(corner);
  // Adzuna occasionally stamps `created` slightly in the future; the app
  // clamps those to "just now", so the expected display is max(0, realAge).
  const realSecs = Math.floor(
    (Date.now() - Date.parse(newestExact.source_posted_date)) / 1000
  );
  const expectedSecs = Math.max(0, realSecs);
  const closeEnough =
    shownSecs !== null && Math.abs(shownSecs - expectedSecs) <= 90;
  check(
    "Adzuna card age matches its real `created` timestamp (±90s)",
    closeEnough,
    `shown "${corner}" vs real ${Math.floor(realSecs / 60)}m`
  );
}
const reedJob = apiJobs.find(
  (j) => j.status === "active" && j.source === "reed"
);
if (reedJob) {
  const reedCorner = await page
    .locator(`li[data-job-id="${reedJob.id}"]`)
    .first()
    .locator("span.text-gold")
    .first()
    .innerText();
  check(
    "Reed card shows honest date-precision age (today/yesterday), no fake minutes",
    /^(today|yesterday|\d+ days ago)$/.test(reedCorner.trim()),
    `"${reedCorner}"`
  );
}

// --- HEADLINE: refresh does NOT reset displayed ages -------------------------
const beforeAges = new Map();
for (const li of await page.locator("main ul > li").elementHandles()) {
  const id = await li.getAttribute("data-job-id");
  const corner = await (await li.$("span.text-gold"))?.innerText();
  const secs = parseAgeSeconds(corner ?? "");
  if (id && secs !== null && secs > 60) beforeAges.set(id, secs);
}
await page.click('header button:has-text("Refresh")');
await page.waitForSelector('header button:has-text("Refresh (")');
check("refresh button enters cooldown countdown", true);
await page.waitForFunction(
  () => !document.querySelector("header")?.innerText.includes("Refreshing"),
  { timeout: 120000 }
);
await page.waitForTimeout(1500);
let resetCount = 0;
let compared = 0;
for (const li of await page.locator("main ul > li").elementHandles()) {
  const id = await li.getAttribute("data-job-id");
  const corner = await (await li.$("span.text-gold"))?.innerText();
  if (id && beforeAges.has(id)) {
    compared++;
    const after = parseAgeSeconds(corner ?? "");
    if (after !== null && after < beforeAges.get(id) - 61) resetCount++;
  }
}
check(
  "ages did NOT reset after pressing Refresh",
  compared > 0 && resetCount === 0,
  `${compared} jobs compared, ${resetCount} reset`
);

// --- timer ticks -------------------------------------------------------------
await page.waitForSelector("text=/Last refreshed \\d+:\\d{2} ago/");
const t1 = await page.locator("header span.tabular-nums").first().innerText();
await page.waitForTimeout(2500);
const t2 = await page.locator("header span.tabular-nums").first().innerText();
check("last-refreshed timer ticks", t1 !== t2, `"${t1}" -> "${t2}"`);

await page.screenshot({ path: `${SHOTS}/desktop-royal-jobs.png` });

// --- autocomplete + title-only search ----------------------------------------
const termInput = page.locator('input[role="combobox"]').first();
await termInput.fill("adm");
await page.waitForSelector('[role="listbox"] [role="option"]');
const options = await page.locator('[role="option"]').allInnerTexts();
check(
  "autocomplete suggests admin titles for 'adm'",
  options.some((o) => o.includes("administrator")),
  options.slice(0, 4).join(" | ")
);
await termInput.fill("administrator");
await termInput.press("Enter"); // adds the raw term as a chip
await page.waitForTimeout(800);
const titlesAfterTerm = await page.locator("main ul > li h3").allInnerTexts();
const offTitle = titlesAfterTerm.filter((t) => !/\badministrator/i.test(t));
check(
  "with term 'administrator', every visible job has it in the TITLE",
  titlesAfterTerm.length > 0 && offTitle.length === 0,
  `${titlesAfterTerm.length} shown${offTitle.length ? `; off-title: ${offTitle[0]}` : ""}`
);
// remove the chip again
await page.click('button[aria-label="Remove administrator"]');
await page.waitForTimeout(500);

// --- filters: government + salary ---------------------------------------------
await page.click('button:has-text("Filters")');
await page.waitForSelector("#search-filters");
await page.screenshot({ path: `${SHOTS}/desktop-royal-filters.png` });

const govJobs = apiJobs.filter((j) => j.is_government).map((j) => j.title);
await page.click('button:has-text("Government / public sector only")');
await page.waitForTimeout(600);
const govShown = await page.locator("main ul > li h3").allInnerTexts();
check(
  "government filter shows only flagged public-sector jobs",
  govShown.length > 0 && govShown.every((t) => govJobs.includes(t)),
  `${govShown.length} shown of ${govJobs.length} flagged`
);
await page.click('button:has-text("Government / public sector only")');

await page.fill('input[placeholder="Min £"]', "30000");
await page.waitForTimeout(600);
const salaryCards = await page.locator("main ul > li").count();
let noSalaryBadge = 0;
for (const li of await page.locator("main ul > li").elementHandles()) {
  const text = await li.innerText();
  if (!text.includes("£")) noSalaryBadge++;
}
check(
  "salary filter: every visible card states a salary (no-salary jobs hidden)",
  salaryCards === 0 || noSalaryBadge === 0,
  `${salaryCards} cards, ${noSalaryBadge} without £`
);
await page.fill('input[placeholder="Min £"]', "");
await page.waitForTimeout(400);
await page.click('button:has-text("Filters")'); // close panel

// --- hide a job -----------------------------------------------------------------
const firstTitle = await page.locator("main ul > li h3").first().innerText();
await page.locator('button[aria-label^="Hide"]').first().click();
await page.waitForTimeout(400);
const titlesAfterHide = await page.locator("main ul > li h3").allInnerTexts();
check(
  "hide removes the job from the list",
  !titlesAfterHide.includes(firstTitle)
);
await page.click("text=/Show (it|them)/");
await page.waitForTimeout(400);
const titlesAfterShow = await page.locator("main ul > li h3").allInnerTexts();
check("unhide brings it back", titlesAfterShow.includes(firstTitle));

// --- detail views: honest posted lines for both sources --------------------------
async function openCardBySource(sourceLabel) {
  const card = page
    .locator("main ul > li", {
      has: page.locator(`span:text-is("${sourceLabel}")`),
    })
    .first();
  if ((await card.count()) === 0) return false;
  await card.locator('button[aria-label^="Open"]').click();
  await page.waitForSelector('a:has-text("View / Apply on")');
  return true;
}

if (await openCardBySource("Adzuna")) {
  const link = page.locator('a:has-text("View / Apply on")').first();
  const linkBox = await link.boundingBox();
  const titleBox = await page.locator("#job-detail-title").boundingBox();
  check(
    "detail: external link sits at the TOP, above the title",
    linkBox && titleBox && linkBox.y < titleBox.y
  );
  check(
    "detail: link opens safely in a new tab",
    (await link.getAttribute("target")) === "_blank" &&
      ((await link.getAttribute("rel")) ?? "").includes("noopener")
  );
  const postedLine = await page
    .locator("text=/own timestamp/")
    .count();
  check("Adzuna detail cites the source's own timestamp", postedLine > 0);

  // applied round trip
  await page.click('button:has-text("Mark as applied")');
  await page.waitForSelector('button:has-text("Un-apply")');
  check("Mark as applied works (button flips to Un-apply)", true);
  await page.click('button:has-text("Un-apply")');
  await page.waitForSelector('button:has-text("Mark as applied")');
  check("Un-apply works (button flips back)", true);
  await page.click('button:has-text("Back to list")');
  await page.waitForSelector("main ul > li h3");
}

if (await openCardBySource("Reed")) {
  const dateOnlyNote = await page
    .locator("text=/Reed provides the date only/")
    .count();
  check("Reed detail is honest about date-only precision", dateOnlyNote > 0);
  const ago = await page.locator("text=/Posted (today|yesterday)/").count();
  check("Reed detail shows today/yesterday, not fake minutes", ago > 0);
  // full description loads from the details endpoint
  await page.waitForFunction(
    () =>
      document.querySelector(".job-description") !== null ||
      document.body.innerText.includes("wouldn't load"),
    { timeout: 30000 }
  );
  check(
    "Reed full description loads (or honestly reports failure)",
    true
  );
  await page.click('button:has-text("Back to list")');
  await page.waitForSelector("main ul > li h3");
}

// --- saved searches ----------------------------------------------------------------
await page.locator('input[role="combobox"]').first().fill("barista");
await page.locator('input[role="combobox"]').first().press("Enter");
await page.click('button:has-text("Save search")');
await page.fill('input[placeholder^="Name this search"]', "UI test search");
await page.click('form button:has-text("Save")');
await page.waitForSelector("text=/Saved —/");
await page.click("#tab-saved");
await page.waitForSelector('h3:text-is("UI test search")');
check("saved search appears in the Saved tab", true);
// Scope to OUR card — the Saved tab may hold other saved searches too.
await page
  .locator("li", { has: page.locator('h3:text-is("UI test search")') })
  .locator('button:has-text("Load & run")')
  .click();
await page.waitForSelector('section[aria-label="Job search"]');
check(
  "loading a saved search returns to Jobs with its terms applied",
  (await page.locator('span:has-text("barista")').count()) > 0
);
await page.click("#tab-saved");
await page.waitForSelector('h3:text-is("UI test search")');
await page.locator('button[aria-label^="Delete saved search"]').last().click();
await page.waitForTimeout(800);
check(
  "saved search can be deleted",
  (await page.locator('h3:text-is("UI test search")').count()) === 0
);
// clean the barista term back off
await page.click("#tab-jobs");
const baristaChip = page.locator('button[aria-label="Remove barista"]');
if ((await baristaChip.count()) > 0) await baristaChip.click();

// --- themes ---------------------------------------------------------------------------
await page.click('button[aria-label*="Galaxy"]');
await page.waitForTimeout(400);
check(
  "theme toggles to Galaxy",
  await page.evaluate(() => document.documentElement.classList.contains("dark"))
);
await page.screenshot({ path: `${SHOTS}/desktop-galaxy-jobs.png` });
await desktop.close();

// --- mobile ------------------------------------------------------------------------------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mpage = await newPage(mobile);
await mpage.goto(BASE, { waitUntil: "networkidle" });
await mpage.waitForSelector("main ul > li h3");
const hOverflow = await mpage.evaluate(
  () =>
    document.documentElement.scrollWidth >
    document.documentElement.clientWidth + 1
);
check("no horizontal overflow on mobile", !hOverflow);
await mpage.screenshot({ path: `${SHOTS}/mobile-royal-jobs.png` });
await mpage.click('button:has-text("Filters")');
await mpage.waitForSelector("#search-filters");
await mpage.screenshot({ path: `${SHOTS}/mobile-royal-filters.png` });
await mpage.click('button:has-text("Filters")');
await mpage.locator('button[aria-label^="Open"]').first().tap();
await mpage.waitForSelector('a:has-text("View / Apply on")');
await mpage.screenshot({ path: `${SHOTS}/mobile-royal-detail.png` });
await mobile.close();

await browser.close();

check(
  "zero browser console errors across the whole run",
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(" || ")
);

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) console.log("FAILED: " + failures.join(" | "));
process.exit(failures.length > 0 ? 1 : 0);
