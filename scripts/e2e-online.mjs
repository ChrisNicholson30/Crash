// Two browsers play each other through the real UI against `pnpm cf:dev`:
// sign up, open a table, join by code, chat, and play deals to the end of at least two.
// Usage: node scripts/e2e-online.mjs [url] [screenshotDir]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:8787/';
const shots = process.argv[3];
const browser = await chromium.launch();
const suffix = Math.random().toString(36).slice(2, 6);
const errors = [];

async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  await page.getByRole('button', { name: /Play friends online/ }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.getByText(`Signed in as`).waitFor();
  return page;
}
const snap = (page, n) => shots && page.screenshot({ path: `${shots}/online-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (loc) => loc.isVisible().catch(() => false);
// The table re-renders whenever the other player acts, so a click can miss; just try again next round.
const tap = (loc) => loc.click({ timeout: 2500 }).then(() => true, () => false);

const A = await player(`amy_${suffix}`);
const B = await player(`ben_${suffix}`);
await snap(A, '1-hub');

await A.getByRole('button', { name: '4 players' }).click();
await A.locator('.table-code b').waitFor();
const code = (await A.locator('.table-code b').textContent()).trim();
await B.getByLabel('Table code').fill(code);
await B.getByRole('button', { name: 'Join' }).click();
await A.getByText(`ben_${suffix}`).waitFor();
await snap(A, '2-lobby');

// Chat
await A.getByRole('button', { name: 'Table chat' }).click();
await A.getByLabel('Chat message').fill('Good luck!');
await A.getByRole('button', { name: 'Send' }).click();
await A.keyboard.press('Escape');
await A.locator('.sheet-wrap').click({ position: { x: 10, y: 10 } });
await B.locator('.chat-peek').waitFor({ timeout: 5000 });
await snap(B, '3-chat-peek');

await A.getByRole('button', { name: /^Deal/ }).click();
await wait(1500);

let lockIns = 0;
let summaries = 0;
let sawWaiting = false;
const end = Date.now() + 150_000;
while (Date.now() < end && lockIns < 6) {
  for (const [p, n] of [
    [A, 'A'],
    [B, 'B'],
  ]) {
    for (const overlay of ['.takeover', '.celebrate-screen']) {
      if (await visible(p.locator(overlay))) await p.locator(overlay).click({ timeout: 1500 }).catch(() => {});
    }
    const lock = p.getByRole('button', { name: 'Lock in' });
    if (await visible(lock)) {
      if (!(await tap(p.getByRole('button', { name: 'Auto' })))) continue;
      await wait(300);
      if (lockIns === 0 && n === 'B') await snap(p, '4-arrange');
      if (await tap(lock)) lockIns++;
      continue;
    }
    if (await visible(p.getByText(/^Waiting for/).first())) sawWaiting = true;
    const bet = p.getByRole('button', { name: /^Bet \d/ });
    if (await visible(bet)) {
      await tap(p.getByRole('button', { name: 'Add 25', exact: true }));
      if (n === 'A' && summaries === 0) await snap(p, '5-betting');
      await tap(p.getByRole('button', { name: /^Bet \d/ }));
      continue;
    }
    const again = p.locator('.summary').getByRole('button', { name: /Deal again|Ready|Rematch/ });
    if (await visible(again)) {
      if (n === 'A') {
        await snap(p, `6-summary-${summaries}`);
        summaries++;
      }
      await tap(again.first());
      continue;
    }
    const next = p.getByRole('button', { name: /Play hand|Finish deal|^Ready/ });
    if (await visible(next)) await tap(next);
  }
  await wait(250);
}

await snap(A, '9-final-A');
await snap(B, '9-final-B');
console.log(JSON.stringify({ code, lockIns, summaries, sawWaiting, errors }, null, 2));
if (lockIns < 6 || summaries < 2 || errors.length) process.exitCode = 1;
await browser.close();
