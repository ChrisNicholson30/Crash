// Smoke test against `pnpm preview` or `pnpm cf:dev`: plays deals at phone width
// (manual + auto arranging, betting, Crash), then checks the app loads offline.
// Usage: node scripts/e2e-smoke.mjs [url] [screenshotDir]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const snap = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url);
await wait(1200);
await snap('1-home');
await page.getByRole('button', { name: /4 players/ }).click();
await page.getByRole('button', { name: 'Deal me in' }).click();
await wait(1200);
await snap('2-deal');

// Build hand 1 by tapping, then let Auto finish (checks both paths work).
await page.getByRole('button', { name: 'Auto' }).click();
await wait(700);
await snap('3-arranged');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

let deals = 0;
let crashSeen = false;
for (; deals < 3; deals++) {
  if (deals > 0) {
    await page.getByRole('button', { name: 'Auto' }).click();
    await wait(400);
  }
  const crashBtn = page.getByRole('button', { name: 'Crash', exact: true });
  if (deals === 1 && (await crashBtn.isEnabled())) {
    await crashBtn.click();
    crashSeen = true;
  }
  await page.getByRole('button', { name: 'Lock in' }).click();
  await wait(900);
  if (deals === 0) await snap('4-betting');
  for (let h = 0; h < 5; h++) {
    const bet = page.getByRole('button', { name: /^Bet \d/ });
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible().catch(() => false)) await cont.click();
    else {
      await page.getByRole('button', { name: '50', exact: true }).click();
      await bet.click();
    }
    await wait(1900);
    if (deals === 0 && h === 0) await snap('5-reveal');
    const next = page.getByRole('button', { name: /Play hand|Finish deal/ });
    const label = await next.textContent();
    await next.click();
    if (/Finish/.test(label)) break;
    await wait(500);
  }
  await wait(900);
  const takeover = page.locator('.takeover');
  if (await takeover.isVisible().catch(() => false)) {
    await snap(`6-crash-${deals}`);
    await takeover.click();
    await wait(600);
  }
  await snap(`7-summary-${deals}`);
  const again = page.getByRole('button', { name: 'Deal again' });
  if (!(await again.isVisible().catch(() => false))) break;
  await again.click();
  await wait(1000);
}

await page.reload();
await ctx.setOffline(true);
await page.reload();
await wait(800);
const offlineOk = await page.locator('.wordmark').isVisible();
const resume = await page.getByRole('button', { name: 'Resume game' }).isVisible();
console.log(JSON.stringify({ deals, crashSeen, horizontalOverflow: overflow, offlineOk, resume, errors }, null, 2));
await browser.close();
