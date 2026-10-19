import { chromium } from '@playwright/test';
const [url, prefijo] = process.argv.slice(2);
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.waitForTimeout(900);
  console.log(w, await p.evaluate(() => document.documentElement.scrollHeight));
  await p.screenshot({ path: `${prefijo}-${w}.png` });
  await ctx.close();
}
await b.close();
