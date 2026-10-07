import { launch, FILE_URL, ROOT, watch } from './pw.mjs';
export { ROOT, FILE_URL };

export async function open(opts) {
  opts = opts || {};
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, deviceScaleFactor: opts.dpr || 2, colorScheme: opts.scheme || 'light', reducedMotion: opts.reduced ? 'reduce' : 'no-preference', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; watch(page, errors);
  await page.goto(FILE_URL + (opts.hash || ''));
  await page.waitForTimeout(300);
  return { browser, ctx, page, errors };
}
export async function go(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(250); }
export const primary = (page) => page.locator('.focus-bar .btn.primary');

/* răspunsul canonic al exercițiului curent */
export async function currentAnswer(page) {
  return page.evaluate(() => {
    const e = M._lastExercise; if (!e) return null;
    if (e.mode === 'choice') return { mode: 'choice', ok: e.options.findIndex((o) => o.ok), bad: e.options.findIndex((o) => !o.ok), n: e.options.length };
    const a = e.answer; const text = a.kind === 'int' ? String(a.value) : a.kind === 'dec' ? M.fmt(a.value, a.dec === undefined ? 1 : a.dec) : a.kind === 'rad' ? M.radText(a.n) : String(a.value);
    return { mode: 'input', text: text, wrong: '987654' };
  });
}
export async function solve(page, how) {
  how = how || {};
  const a = await currentAnswer(page);
  if (!a) throw new Error('niciun exercițiu activ');
  if (how.wrongFirst) {
    if (a.mode === 'choice') await page.locator('.option[data-i="' + a.bad + '"]').click(); else await page.locator('input.input').fill(a.wrong);
    await primary(page).click();
    await page.waitForTimeout(120);
  }
  if (a.mode === 'choice') await page.locator('.option[data-i="' + a.ok + '"]').click(); else await page.locator('input.input').fill(a.text);
  await primary(page).click();
  await page.waitForTimeout(100);
  if (how.stay) return a;
  await primary(page).click();            // „Continuă”
  await page.waitForTimeout(100);
  return a;
}
/* parcurge o lecție până la ecranul final */
export async function finishLesson(page, o) {
  o = o || {};
  let ex = 0;
  for (let i = 0; i < 260; i++) {
    if (await page.locator('.result').count()) return { exercises: ex, ok: true };
    if (await page.locator('.ex').count()) { await solve(page, { wrongFirst: o.wrongEvery && ex % o.wrongEvery === 0 }); ex++; continue; }
    if ((await page.locator('.eyebrow:has-text("Încearcă singur")').count())) { await page.getByRole('button', { name: 'Sari peste' }).click(); await page.waitForTimeout(100); continue; }
    const p = primary(page);
    if (await p.count() === 0 || await p.isDisabled()) { await page.waitForTimeout(100); continue; }
    await p.click(); await page.waitForTimeout(60);
  }
  return { exercises: ex, ok: false };
}
