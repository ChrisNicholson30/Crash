// Renders public/icon.svg to the PNG sizes the PWA manifest needs, using the
// preinstalled Playwright Chromium. Run once after changing the icon.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const [size, file, pad] of [
  [192, 'pwa-192.png', 0],
  [512, 'pwa-512.png', 0],
  [180, 'apple-touch-icon.png', 0],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:#0A0A0B}svg{display:block;width:${size - pad * 2}px;height:${size - pad * 2}px;margin:${pad}px}</style>${svg}`,
  );
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
console.log('icons written');
