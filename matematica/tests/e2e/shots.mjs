import { open, go, solve, primary, finishLesson, currentAnswer, ROOT } from './lib.mjs';
const out = (n) => ROOT + '/tests/shots/final-' + n + '.png';
/* 1. acasă */
{ const { browser, page } = await open({ viewport: { width: 390, height: 780 } }); await page.waitForTimeout(400); await page.screenshot({ path: out('1-acasa') }); await browser.close(); }
/* 2. joacă înainte de regulă: pătrate pe laturi */
{
  const { browser, page } = await open({ viewport: { width: 390, height: 780 }, hash: '#/lectie/u1-l2' });
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.eyebrow:has-text("Încearcă singur")').count()) break;
    if (await page.locator('.ex').count()) { await solve(page); continue; }
    await primary(page).click(); await page.waitForTimeout(80);
  }
  const sl = page.locator('.viz input[type=range]');
  await sl.nth(0).evaluate((el) => { el.value = 5; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await sl.nth(1).evaluate((el) => { el.value = 3; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(250); await page.screenshot({ path: out('2-joaca') }); await browser.close();
}
/* 3. greșeală explicată pe loc */
{
  const { browser, page } = await open({ viewport: { width: 390, height: 780 }, hash: '#/lectie/u1-l3' });
  for (let i = 0; i < 60; i++) {
    if (await page.locator('.ex').count()) { const a = await currentAnswer(page); if (a.mode === 'input' || a.mode === 'choice') break; }
    if (await page.locator('.eyebrow:has-text("Încearcă singur")').count()) { await page.getByRole('button', { name: 'Sari peste' }).click(); await page.waitForTimeout(100); continue; }
    await primary(page).click(); await page.waitForTimeout(80);
  }
  const a = await currentAnswer(page);
  if (a.mode === 'choice') await page.locator('.option[data-i="' + a.bad + '"]').click(); else await page.locator('input.input').fill('7');
  await primary(page).click(); await page.waitForTimeout(250);
  await page.screenshot({ path: out('3-greseala') });
  /* 4. Zona mea după câteva răspunsuri */
  await solve(page, { wrongFirst: false });
  for (let i = 0; i < 6; i++) { if (await page.locator('.ex').count()) await solve(page, { wrongFirst: i % 2 === 0 }); }
  await go(page, '#/zona-mea'); await page.waitForTimeout(300);
  await page.screenshot({ path: out('4-zona-mea') });
  await go(page, '#/studio'); await page.locator('#studio-q').fill('5 probleme mai grele cu povestea fotbalului');
  await page.getByRole('button', { name: /Construiește/ }).click(); await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.gen-item').offsetTop - 120)); await page.waitForTimeout(200);
  await page.screenshot({ path: out('5-studio') });
  await browser.close();
}
console.log('ok');
