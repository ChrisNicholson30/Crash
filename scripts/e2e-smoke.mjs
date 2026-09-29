// Smoke test against `pnpm preview`: plays a 3-player game at phone width,
// arranging by hand once, then checks the app reloads with the network off.
// Usage: node scripts/e2e-smoke.mjs [url] [screenshotDir]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const snap = (name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });

await page.goto(url);
await page.getByRole('button', { name: /3 players/ }).click();
await snap('1-setup');
await page.getByRole('button', { name: 'Deal' }).click();

// Arrange by tapping: fill every slot from the pool.
for (let i = 0; i < 15; i++) await page.locator('.pool-cards button.card').first().click();
await snap('2-arrange-manual');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
await page.getByRole('button', { name: 'Play hands' }).click();
await page.getByText(/Deal 1 results|wins/).waitFor();
await snap('3-reveal');

let deals = 1;
while (!(await page.getByRole('button', { name: 'New game' }).last().isVisible()) || (await page.getByRole('button', { name: 'Next deal' }).count())) {
  await page.getByRole('button', { name: 'Next deal' }).click();
  await page.getByRole('button', { name: 'Auto-arrange' }).click();
  await page.getByRole('button', { name: 'Play hands' }).click();
  deals++;
  if (deals > 40) throw new Error('game did not finish');
}
await snap('4-game-over');
const banner = await page.locator('.banner h2').textContent();

// Offline: service worker should serve the app shell.
await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready);
await page.reload();
await ctx.setOffline(true);
await page.reload();
const offlineOk = await page.locator('.scoreboard, .hero').first().isVisible();

console.log(JSON.stringify({ deals, banner, horizontalOverflow: overflow, offlineOk, errors }, null, 2));
await browser.close();
