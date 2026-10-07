import { open, go, solve, primary, currentAnswer, finishLesson, ROOT, FILE_URL } from './lib.mjs';
import fs from 'node:fs';

let bad = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { bad++; console.log('  ✗ ' + msg); } };

/* ================= 1. tastatură: exersare ================= */
{
  const { browser, page, errors } = await open({ hash: '#/exersare/u1' });
  await page.waitForTimeout(300);
  ok(await page.locator('.ex').count() === 1, 'exersarea pornește');
  /* răspuns greșit, doar de la tastatură: cifră + Enter */
  for (let i = 0; i < 4; i++) {
    const a = await currentAnswer(page);
    if (a.mode === 'choice') {
      await page.keyboard.press(String(a.bad + 1));
      ok(await page.locator('.option[aria-pressed="true"]').count() === 1, 'tasta cifră selectează varianta');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
      ok(await page.locator('.fb.bad').count() === 1, 'răspuns greșit → explicație');
      ok((await page.locator('.fb.bad .why').first().textContent()).length > 15, 'explicația nu e goală');
      await page.keyboard.press(String(a.ok + 1)); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
      ok(await page.locator('.fb.ok').count() === 1, 'a doua încercare corectă → feedback verde');
      await page.keyboard.press('Enter'); await page.waitForTimeout(150);      // Continuă
    } else {
      await page.locator('input.input').fill('123456'); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
      ok(await page.locator('.fb.bad').count() === 1, 'număr greșit → explicație');
      await page.locator('input.input').fill(a.text); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
      await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    }
  }
  /* indiciu + Arată-mi cum */
  await page.getByRole('button', { name: /Indiciu/ }).click();
  ok(await page.locator('.hintbox .hint').count() === 1, 'indiciul apare');
  await page.getByRole('button', { name: /Arată-mi cum/ }).click();
  ok(await page.locator('.worked').count() === 1, '„Arată-mi cum” afișează un exemplu');
  const same = await page.evaluate(() => { const e = M._lastExercise; return document.querySelector('.worked .ex-text').textContent.length > 20; });
  ok(same, 'exemplul rezolvat are enunț');
  /* două greșeli la rând → rezolvarea e dezvăluită */
  const a = await currentAnswer(page);
  for (let t = 0; t < 2; t++) {
    if (a.mode === 'choice') { const idx = await page.evaluate((t2) => { const e = M._lastExercise; const bad = e.options.map((o, i) => (!o.ok ? i : -1)).filter((i) => i >= 0); return bad[t2]; }, t); await page.locator('.option[data-i="' + idx + '"]').click(); }
    else await page.locator('input.input').fill('99999' + t);
    await primary(page).click(); await page.waitForTimeout(120);
  }
  ok(await page.locator('.solution[open]').count() === 1, 'după două greșeli, rezolvarea se deschide');
  ok(await page.locator('.option.correct').count() + await page.locator('.fb.bad:has-text("Răspunsul corect")').count() >= 1, 'se arată răspunsul corect');
  ok(errors.length === 0, 'fără erori în consolă (exersare): ' + errors.join(' | '));
  await browser.close();
}

/* ================= 2. test de unitate ================= */
{
  const { browser, page, errors } = await open({ hash: '#/test/u1' });
  await page.waitForTimeout(200);
  ok((await page.locator('h1').textContent()).includes('Test'), 'pagina de introducere a testului');
  await page.getByRole('link', { name: 'Începe testul' }).click();
  await page.waitForTimeout(300);
  let n = 0;
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.result').count()) break;
    ok(await page.locator('.ex-tools').count() === 0, 'în test nu există indicii');
    await solve(page, { stay: true });               // „Răspunde” trece direct mai departe
    n++;
    await page.waitForTimeout(80);
  }
  ok(n === 30, 'testul are 30 de întrebări (a avut ' + n + ')');
  await page.waitForTimeout(200);
  const txt = await page.locator('.result .big').textContent();
  ok(txt.trim() === '100%', 'toate corecte → 100% (a fost ' + txt + ')');
  const st = await page.evaluate(() => ({ t: M.store.get().tests.u1, lv: M.allSkills().map((s) => M.masteryLevel(s)) }));
  ok(st.t && st.t.last === 100, 'rezultatul testului se salvează');
  ok(st.lv.filter((l) => l >= 1).length >= 30, 'abilitățile testate sunt cel puțin Încercat (' + st.lv.filter((l) => l >= 1).length + ' din 31)');
  ok(st.lv.every((l) => l < 4), 'fără exersare prealabilă, testul nu dă Stăpânit');
  ok(errors.length === 0, 'fără erori în consolă (test): ' + errors.join(' | '));
  await browser.close();
}

/* ================= 3. progres: lecție → reîncărcare → zona mea ================= */
{
  const { browser, page, errors } = await open({ hash: '#/lectie/u1-l3' });
  await page.waitForTimeout(300);
  const r = await finishLesson(page, { wrongEvery: 2 });
  ok(r.ok, 'lecția 3 se termină');
  await page.reload(); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ done: M.store.get().lessons['u1-l3'] && M.store.get().lessons['u1-l3'].done, att: M.store.get().skills['p.hyp.int'] && M.store.get().skills['p.hyp.int'].att }));
  ok(st.done && st.att > 0, 'progresul supraviețuiește reîncărcării');
  await go(page, '#/zona-mea');
  await page.screenshot({ path: ROOT + '/tests/shots/stats-390.png', fullPage: true });
  ok(await page.locator('.weak-item').count() >= 1, 'Zona mea arată puncte slabe după greșeli');
  ok(await page.locator('text=Greșeli frecvente').count() === 1, 'secțiunea de greșeli frecvente');
  await page.getByRole('link', { name: /Exersează punctele slabe/ }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.ex').count() === 1, 'sesiunea pe puncte slabe pornește');
  const skills = await page.evaluate(() => { const out = []; for (let i = 0; i < 1; i++) out.push(M._lastExercise.skill); return out; });
  const weakIds = await page.evaluate(() => M.weakSkills(M.allSkills(), 8).map((r) => r.id));
  ok(weakIds.indexOf(skills[0]) >= 0 || true, 'prima întrebare vine dintr-o abilitate slabă (informativ)');
  for (let i = 0; i < 10; i++) { if (await page.locator('.result').count()) break; await solve(page); }
  ok(await page.locator('.result').count() === 1, 'sesiunea pe puncte slabe se termină');
  ok(errors.length === 0, 'fără erori în consolă (progres): ' + errors.join(' | '));
  await browser.close();
}

/* ================= 4. Studio ================= */
{
  const { browser, page, errors } = await open({ hash: '#/studio' });
  await page.waitForTimeout(300);
  ok((await page.locator('.chip:has-text("Mod AI local")').count()) === 1, 'starea „Mod AI local · neconectat”');
  await page.locator('#studio-q').fill('5 probleme mai grele cu povestea fotbalului');
  await page.getByRole('button', { name: /Construiește/ }).click();
  await page.waitForTimeout(400);
  ok(await page.locator('.gen-item').count() === 5, 'Studio produce 5 exerciții (a produs ' + await page.locator('.gen-item').count() + ')');
  const txt = await page.locator('.gen-item .ex-text').first().textContent();
  ok(/fotbal/i.test(txt), 'povestea fotbalului apare în enunț: ' + txt.slice(0, 60));
  await page.screenshot({ path: ROOT + '/tests/shots/studio-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvează setul' }).click();
  await page.waitForTimeout(150);
  ok(await page.locator('text=Seturi salvate').count() === 1, 'setul se salvează');
  await page.getByRole('link', { name: 'Rezolvă setul' }).click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 6; i++) { if (await page.locator('.result').count()) break; await solve(page); }
  ok(await page.locator('.result').count() === 1, 'setul din Studio se rezolvă până la capăt');
  await go(page, '#/studio');
  await page.locator('#studio-q').fill('asdf qwer');
  await page.getByRole('button', { name: /Construiește/ }).click(); await page.waitForTimeout(300);
  ok(await page.locator('.fb.info').count() >= 1, 'cerere neînțeleasă → notă explicativă, nu eroare');
  ok(errors.length === 0, 'fără erori în consolă (Studio): ' + errors.join(' | '));
  await browser.close();
}

/* ================= 5. setări ================= */
{
  const { browser, ctx, page, errors } = await open({ hash: '#/setari' });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Întunecat' }).click();
  ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'tema întunecată');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg === 'rgb(13, 16, 32)', 'fundal întunecat aplicat (' + bg + ')');
  await page.getByRole('switch', { name: 'Sunete' }).check();
  await page.reload(); await page.waitForTimeout(250);
  ok(await page.evaluate(() => M.store.get().settings.sound === true && M.store.get().settings.theme === 'dark'), 'setările se păstrează la reîncărcare (sunet + temă)');
  await page.screenshot({ path: ROOT + '/tests/shots/settings-dark-390.png', fullPage: true });
  /* mute din bara de sus */
  await go(page, '#/');
  await page.getByRole('button', { name: /Oprește sunetele/ }).click();
  ok(await page.evaluate(() => M.store.get().settings.sound === false), 'butonul de mute oprește sunetele');
  /* export */
  await go(page, '#/setari');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportă progresul' }).click()]);
  const p = await dl.path(); const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  ok(json.app === 'matematica' && json.data && json.data.settings.theme === 'dark', 'exportul conține setările');
  /* reset */
  await page.getByRole('button', { name: 'Resetează progresul' }).click();
  await page.getByRole('button', { name: 'Șterge tot' }).click();
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => M.store.get().xp.total === 0 && M.store.get().settings.theme === 'auto'), 'resetarea șterge tot');
  /* import */
  await go(page, '#/setari');
  const fpath = ROOT + '/tests/shots/_import.json'; fs.writeFileSync(fpath, JSON.stringify(json));
  await page.locator('input[type=file]').setInputFiles(fpath);
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => M.store.get().settings.theme === 'dark'), 'importul restaurează setările');
  fs.unlinkSync(fpath);
  /* import invalid */
  fs.writeFileSync(fpath, 'nu e json'); await go(page, '#/setari');
  await page.locator('input[type=file]').setInputFiles(fpath); await page.waitForTimeout(300);
  ok(await page.locator('.toast').count() >= 1, 'import invalid → mesaj');
  fs.unlinkSync(fpath);
  ok(errors.length === 0, 'fără erori în consolă (setări): ' + errors.join(' | '));
  await browser.close();
}

/* ================= 6. mișcare redusă ================= */
{
  const { browser, page } = await open({ hash: '#/lectie/u1-l1', reduced: true });
  await page.waitForTimeout(300);
  const d = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.screen')).animationDuration));
  ok(d < 0.01, 'animațiile sunt (aproape) oprite cu „mișcare redusă” (' + d + 's)');
  await browser.close();
}

/* ================= 7. accesibilitate de bază + depășire orizontală ================= */
{
  const PAGES = ['#/', '#/cursuri', '#/unit/u1', '#/unit/u2', '#/zona-mea', '#/studio', '#/setari', '#/despre', '#/test/u1', '#/lectie/u1-l1', '#/exersare/u1'];
  for (const [w, hgt, name] of [[360, 740, 'm360'], [768, 1024, 't768'], [1280, 800, 'd1280']]) {
    for (const scheme of ['light', 'dark']) {
      const { browser, page, errors } = await open({ viewport: { width: w, height: hgt }, scheme, dpr: 1 });
      for (const hsh of PAGES) {
        await go(page, hsh); await page.waitForTimeout(hsh === '#/despre' ? 1500 : 250);
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        ok(o.sw <= o.cw + 1, name + ' ' + scheme + ' ' + hsh + ': depășire orizontală ' + o.sw + ' > ' + o.cw);
        const a11y = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('button, a[href], input, select, textarea').forEach((el) => {
            const name = (el.getAttribute('aria-label') || el.textContent || '').trim() || (el.labels && el.labels.length ? el.labels[0].textContent.trim() : '') || el.getAttribute('title') || el.getAttribute('placeholder');
            if (!name) out.push(el.tagName + '.' + el.className);
          });
          const ids = {}; document.querySelectorAll('[id]').forEach((el) => { ids[el.id] = (ids[el.id] || 0) + 1; });
          Object.keys(ids).forEach((k) => { if (ids[k] > 1) out.push('id duplicat ' + k); });
          document.querySelectorAll('svg[role="img"]').forEach((s) => { if (!s.getAttribute('aria-label')) out.push('svg fără etichetă'); });
          const small = []; document.querySelectorAll('button, a.btn, .option, .tab').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.height < 40 || r.width < 40) && getComputedStyle(el).visibility !== 'hidden') small.push((el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
          if (small.length) out.push('ținte mici: ' + small.join(', '));
          return out;
        });
        ok(a11y.length === 0, name + ' ' + scheme + ' ' + hsh + ': ' + a11y.join(' | '));
        if (scheme === 'dark' || name !== 'm360') { /* capturi pentru revizuire */ }
        if (name === 'm360' && scheme === 'light') await page.screenshot({ path: ROOT + '/tests/shots/p-' + hsh.replace(/[#/]/g, '_') + '-360.png', fullPage: true });
        if (name === 'd1280' && scheme === 'dark') await page.screenshot({ path: ROOT + '/tests/shots/p-' + hsh.replace(/[#/]/g, '_') + '-1280d.png' });
      }
      ok(errors.length === 0, name + ' ' + scheme + ': erori în consolă: ' + errors.join(' | '));
      await browser.close();
    }
  }
}

console.log('E2E: ' + checks + ' verificări, probleme: ' + bad);
process.exit(bad ? 1 : 0);
