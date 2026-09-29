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
await page.getByRole('button', { name: 'Play the computer' }).click();
await wait(1200);
await snap('2-deal');

// Build hand 1 by tapping, then let Auto finish (checks both paths work).
await page.getByRole('button', { name: 'Auto' }).click();
await wait(700);
await snap('3-arranged');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

let deals = 0;
let crashSeen = false;
let laughSeen = false;
let swiped = false;
let shotBet = false;
let shotReveal = false;
const visible = (loc) => loc.isVisible().catch(() => false);
const tap = (loc) => loc.click({ timeout: 2500 }).then(() => true, () => false);
const end = Date.now() + 240_000;
// React to whatever the table shows until three deals have finished.
while (deals < 3 && Date.now() < end) {
  if (await visible(page.locator('.laugh'))) {
    if (!laughSeen) await snap('6-laugh');
    laughSeen = true;
  }
  for (const [sel, name] of [
    ['.takeover', 'crash'],
    ['.celebrate-screen', 'party'],
  ]) {
    if (await visible(page.locator(sel))) {
      await wait(900);
      await snap(`6-${name}-${deals}`);
      await tap(page.locator(sel));
      await wait(500);
      if (await visible(page.locator('.laugh'))) {
        if (!laughSeen) for (const t of [0, 1, 2]) {
          await snap(`6-laugh-${t}`);
          await wait(350);
        }
        laughSeen = true;
      }
    }
  }
  const lock = page.getByRole('button', { name: 'Lock in' });
  if (await visible(lock)) {
    await tap(page.getByRole('button', { name: 'Auto' }));
    await wait(400);
    const crashBtn = page.getByRole('button', { name: 'Crash', exact: true });
    if (deals === 1 && (await crashBtn.isEnabled().catch(() => false))) {
      await tap(crashBtn);
      crashSeen = true;
    }
    await tap(lock);
    await wait(900);
    continue;
  }
  const bet = page.getByRole('button', { name: /^Bet \d/ });
  if (await visible(bet)) {
    const bigCrash = page.getByRole('button', { name: /^Call Crash and bet/ });
    if (deals >= 1 && !crashSeen && (await visible(bigCrash))) {
      await tap(bigCrash);
      crashSeen = true;
      await wait(700);
      await snap('5b-crash-alert');
      await wait(1500);
      continue;
    }
    await tap(page.getByRole('button', { name: 'Add 100', exact: true }));
    if (!shotBet) await snap('4b-bet-dock');
    shotBet = true;
    await tap(bet);
    await wait(1900);
    if (!shotReveal) await snap('5-reveal');
    shotReveal = true;
    continue;
  }
  const again = page.locator('.summary').getByRole('button', { name: /Deal again|New game/ });
  if (await visible(again)) {
    await snap(`7-summary-${deals}`);
    if (!swiped) {
      // Swipe the summary down to see the table, then bring it back.
      const box = await page.locator('.summary .grabber-zone').boundingBox();
      await page.mouse.move(box.x + 40, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 40, box.y + 260, { steps: 12 });
      await page.mouse.up();
      await page.locator('.mini-sheet').waitFor({ timeout: 3000 });
      await wait(500);
      await snap('7b-swiped-down');
      await tap(page.locator('.mini-head'));
      await page.locator('.summary').waitFor({ timeout: 3000 });
      swiped = true;
    }
    deals++;
    if (/New game/.test(await again.textContent())) break;
    await tap(again);
    await wait(1000);
    continue;
  }
  const next = page.getByRole('button', { name: /Play hand|Finish deal/ });
  if (await visible(next)) await tap(next);
  await wait(300);
}

await page.reload();
await ctx.setOffline(true);
await page.reload();
await wait(800);
const offlineOk = await page.locator('.wordmark').isVisible();
await snap('8-home-offline');
const resume = await page.getByRole('button', { name: 'Resume game' }).isVisible();
console.log(JSON.stringify({ deals, crashSeen, laughSeen, swiped, horizontalOverflow: overflow, offlineOk, resume, errors }, null, 2));
await browser.close();
