// Pass-and-play through the real UI: two people share one phone with two computer
// players. Checks the hand-over screen guards each private decision, and that
// nobody's unplayed hands show on the shared table.
// Usage: node scripts/e2e-passplay.mjs [url] [screenshotDir]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.route('**/api/me', (route) => route.fulfill({ json: { user: null } }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
const snap = async (name) => shots && page.screenshot({ path: `${shots}/pass-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const visible = (loc) => loc.isVisible().catch(() => false);
const tap = (loc) => loc.click({ timeout: 2500 }).then(() => true, () => false);

await page.goto(url);
await page.getByRole('radio', { name: /Pass & play/ }).click();
await page.getByLabel('Player 1 name').fill('Chris');
await page.getByLabel('Player 2 name').fill('Sam');
await page.getByRole('radio', { name: /Quick/ }).click();
await page.getByRole('button', { name: 'Deal for 2' }).click();

const handovers = new Set();
let bets = 0;
let deals = 0;
let sharedChecked = false;
const end = Date.now() + 120_000;
while (deals < 2 && Date.now() < end) {
  for (const sel of ['.takeover', '.celebrate-screen']) if (await visible(page.locator(sel))) await tap(page.locator(sel));
  const reveal = page.getByRole('button', { name: /show my cards/ });
  if (await visible(reveal)) {
    const who = (await page.locator('.handover-card h2').textContent()).trim();
    // Behind the hand-over screen, no cards are on show.
    assert.equal(await page.locator('.pc-front:visible').count(), 0, 'cards visible behind the hand-over screen');
    if (!handovers.size) await snap('1-handover');
    handovers.add(who);
    await reveal.click();
    continue;
  }
  if (await visible(page.getByRole('button', { name: 'Lock in' }))) {
    await tap(page.getByRole('button', { name: 'Auto' }));
    await tap(page.getByRole('button', { name: 'Lock in' }));
    continue;
  }
  const bet = page.getByRole('button', { name: /^Bet / });
  if (await visible(bet)) {
    if (!bets) await snap('2-bet');
    if (await tap(bet)) bets++;
    continue;
  }
  const again = page.getByRole('button', { name: /Deal again|New game/ }).first();
  if (await visible(again)) {
    deals++;
    if (deals === 1) await snap('4-summary');
    // A quick game can be over after one deal.
    if (/New game/.test(await again.textContent())) break;
    await tap(again);
    continue;
  }
  const next = page.getByRole('button', { name: /^Play hand|^Finish deal/ });
  if (await visible(next)) {
    if (!sharedChecked) {
      // Shared view: hand 1 is up for everyone; nobody's later hands are face up.
      const faceUp = await page.locator('.board-row.later .pc:not([aria-label="Face-down card"])').count();
      assert.equal(faceUp, 0, 'later hands face up on the shared table');
      await snap('3-shared');
      sharedChecked = true;
    }
    await tap(next);
    continue;
  }
  await wait(150);
}
await snap('9-end');
console.log(JSON.stringify({ deals, handovers: [...handovers], bets, sharedChecked, errors }, null, 2));
assert.ok(deals >= 1, 'finished a deal');
assert.deepEqual([...handovers].sort(), ['Chris', 'Sam'], 'both people got the phone');
assert.ok(sharedChecked, 'checked the shared table');
assert.deepEqual(errors, []);
await browser.close();
