// Focused test: pressing Refresh starts the live "Last refreshed X ago"
// timer (ticking every second) and puts the button into its cooldown state.
import { chromium } from "playwright";

const BASE = process.env.NIGELS_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("main ul > li button");

const refreshBtn = page.locator('header button:has-text("Refresh")');
await refreshBtn.click();

// Cooldown: the button should disable and show a countdown after the press.
await page.waitForSelector('header button:has-text("Refresh (")', { timeout: 20000 });
const disabled = await page.locator('header button:has-text("Refresh (")').isDisabled();
console.log(`${disabled ? "PASS" : "FAIL"}: refresh button disabled with countdown after press`);

// Timer: "Last refreshed m:ss ago" appears and ticks.
await page.waitForSelector('text=/Last refreshed \\d+:\\d{2} ago/');
const read = () => page.locator("header span.tabular-nums").first().innerText();
const a = await read();
await page.waitForTimeout(2500);
const b = await read();
console.log(
  `${a !== b && /Last refreshed/.test(a) ? "PASS" : "FAIL"}: timer ticks — "${a}" -> "${b}"`
);

console.log(`${errors.length === 0 ? "PASS" : "FAIL"}: zero console errors (${errors.length})`);
await browser.close();
