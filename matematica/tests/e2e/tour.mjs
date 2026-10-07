import { open, solve, primary, ROOT } from './lib.mjs';
const lessons = process.argv.slice(2).length ? process.argv.slice(2) : ['u1-l1', 'u1-l2', 'u1-l3', 'u1-l4', 'u1-l5', 'u1-l6', 'u1-l7', 'u1-l8'];
const { browser, page, errors } = await open({ viewport: { width: 390, height: 844 } });
let failed = 0;
for (const id of lessons) {
  await page.evaluate((h) => { location.hash = h; }, '#/lectie/' + id);
  await page.waitForTimeout(300);
  let nPlay = 0, nEx = 0, nReveal = 0;
  for (let i = 0; i < 300; i++) {
    if (await page.locator('.result').count()) break;
    if (await page.locator('.eyebrow:has-text("Încearcă singur")').count()) {
      nPlay++;
      /* mută fiecare slider într-o poziție „interesantă” și lasă vizualizarea să se redea */
      const n = await page.locator('.viz input[type=range]').count();
      for (let k = 0; k < n; k++) {
        const s = page.locator('.viz input[type=range]').nth(k);
        const mn = +(await s.getAttribute('min')), mx = +(await s.getAttribute('max'));
        const v = Math.round((mn + (mx - mn) * (0.35 + 0.2 * k)) * 10) / 10;
        await s.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
      }
      await page.waitForTimeout(150);
      await page.screenshot({ path: ROOT + '/tests/shots/vis-' + id + '-' + nPlay + '.png' });
      await page.getByRole('button', { name: 'Sari peste' }).click(); await page.waitForTimeout(100); continue;
    }
    if (await page.locator('.ex').count()) {
      nEx++;
      if (nEx === 2) { await page.screenshot({ path: ROOT + '/tests/shots/ex-' + id + '.png' }); await solve(page, { wrongFirst: true, stay: true }); await page.screenshot({ path: ROOT + '/tests/shots/ex-' + id + '-ok.png' }); await primary(page).click(); await page.waitForTimeout(80); continue; }
      await solve(page); continue;
    }
    if (await page.locator('.formula-card').count() && nReveal++ === 0) await page.screenshot({ path: ROOT + '/tests/shots/reveal-' + id + '.png' });
    const p = primary(page);
    if (await p.count() === 0 || await p.isDisabled()) { await page.waitForTimeout(100); continue; }
    await p.click(); await page.waitForTimeout(60);
  }
  const fin = await page.locator('.result').count();
  if (!fin) failed++;
  console.log(id, 'play:', nPlay, 'ex:', nEx, 'rezultat:', fin);
}
console.log('erori:', errors.length ? errors : 'niciuna');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
