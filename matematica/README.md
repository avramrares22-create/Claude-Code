# Matematică · clasa a VII-a

A calm, modern learning site for Romanian 7th-grade maths (with 8th-grade previews and olympiad extras).
The interface is in **Romanian**. Plain HTML, CSS and JavaScript: **no build, no install, no accounts, no server**.

**Open `index.html` (double-click) and it works.** After the first load from a host it also works offline.

## What is inside (finished)

* **Unit 1 — Teorema lui Pitagora**: 8 lessons, 31 skills, a practice mode and a unit test.
  Triunghiul dreptunghic · Pătrate pe laturi · Aflarea ipotenuzei · Aflarea unei catete · Reciproca · Pitagora în figuri ·
  Probleme din viața reală · Înălțimea și cateta.
* **10 interactive pictures** you play with *before* seeing any rule (angle hinge, squares on the sides, a cut-and-slide proof,
  number line for roots, step-by-step calculator, three sticks, shape lab, coordinate plane, ladder, altitude).
* **31 exercise families → 28,000+ different exercises** (the exact number is computed live on the “Despre” page).
  Wrong options come from real student mistakes; each wrong answer is explained.
* **Mastery levels per skill**: Neînceput → Încercat → Familiar → Competent → Stăpânit, plus adaptive difficulty
  (3 right in a row → harder; 2 wrong → easier and a worked example appears).
* **“Zona mea”**: your weak skills, your most frequent mistakes, activity, and one button that generates practice on exactly those weaknesses.
* **Studio AI**: type *“5 probleme mai grele cu povestea fotbalului”* and get a verified custom set. Works without internet.
* Streak, XP, daily goal, light/dark mode, keyboard-only use (1–4 to choose, Enter to continue), reduced-motion support,
  optional quiet sounds, export / import / reset of your progress (it only lives on your device).

## Coming soon (visible on the map, locked)

Numere reale · Ecuații și sisteme · Organizarea datelor · Patrulaterul · Cercul · Asemănarea triunghiurilor ·
Trigonometrie · (clasa a VIII-a) Intervale și inecuații, Calcul algebric, Funcții, Ecuația de gradul II, Geometrie în spațiu,
Statistică · (olimpiadă) Divizibilitate, Principiul cutiei, Inegalități, Geometrie pentru concursuri.
Adding one is a data change: see `GHID.md`.

## Put it online for free (pick one)

**Netlify Drop (easiest, no account needed to try):**
1. Open <https://app.netlify.com/drop> in your browser.
2. Drag the whole `matematica` folder onto the page.
3. You get a link like `https://something.netlify.app`. Open it on your phone: tap *Share → Add to Home Screen* (iPhone) or *Install app* (Chrome).

**GitHub Pages:**
1. Create a new public repository on GitHub (for example `matematica`).
2. Upload the *contents* of the `matematica` folder (so `index.html` is at the top level).
3. Settings → Pages → *Build and deployment* → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
4. After a minute it is live at `https://YOUR-NAME.github.io/matematica/`.

(This folder lives inside the “Natura” repository, whose Pages workflow publishes only the Natura app, so use one of the two options above for this site.)

## Connect the local AI (optional, safe)

Studio already works with its built-in rules. A small local model can understand more free-form requests. It never does the maths
(code builds and re-checks every exercise). Steps are in `ai/README.md`: build the dataset (done), train in Google Colab,
convert for the browser, then fill in `ai/config.json`. **No secret key is ever needed and nothing is sent to a server.**

## Check everything

```
node tests/run-all.mjs
```

Runs: exercise generation (1,000 per family and level), data coherence, core logic, Studio, color contrast, and the browser tests
(needs Playwright). Screenshots from the browser tests land in `tests/shots/`.

## Fonts and licences

Interface font: the system font on Apple devices (San Francisco) and **Inter** elsewhere (SIL OFL, included). Math font: **Noto Sans Math**
(SIL OFL, included). Apple’s San Francisco cannot be redistributed on the web, which is why it is used only where the device already has it.
No third-party code runs; no logos or artwork from other learning sites are used.
