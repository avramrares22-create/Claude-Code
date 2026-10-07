# How to add a lesson or a unit (simple guide)

You do not need to understand the code to use this site. This guide is for the day you want to **add something**.
The easy way is always: tell Claude *“build unit 2, Numere reale”* and it follows the steps below for you.

## The idea in one picture

```
Unit  →  Lessons  →  Screens           (what you read and play)
          ↓
        Skills    →  Exercise families  (what makes the practice questions)
```

* A **unit** is a chapter (for example *Teorema lui Pitagora*).
* A **lesson** is 8–20 short screens: *play → question → rule → exercises → short test*.
* A **skill** is one small thing you can be good or bad at (for example *“Ipotenuza — rezultat întreg”*). Mastery levels,
  weak spots and the “Zona mea” page are all computed per skill.
* An **exercise family** (template) is a recipe that builds thousands of different exercises for one skill:
  random numbers, stories, three difficulty levels, the right answer, and the typical mistakes (which become the wrong options).

## What is where

| Folder / file | What it holds |
|---|---|
| `index.html` | The page you open. It just loads everything else. |
| `data/units.js` | **The course map.** Every unit appears here. A unit that is only a name and lesson titles shows as “În curând”. |
| `data/unit1/` | **Unit 1 (finished):** `unit.js` (title, skills), `templates-a.js` / `templates-b.js` (exercise families), `lessons-a.js` / `lessons-b.js` (screens), `helpers.js` (small tools). |
| `data/messages.js` | The encouragement messages (22 kind ones, picked at random). |
| `data/mistakes.js` | Names for the typical mistakes, shown in “Zona mea”. |
| `js/` | The engine: lessons player, exercise generator, mastery levels, drawings. You rarely touch it. |
| `css/` | Colors, fonts, spacing (light and dark mode live in `tokens.css`). |
| `ai/` | The optional local-AI kit (see `ai/README.md`). |
| `tests/` | Automatic checks. `node tests/run-all.mjs` runs all of them. |

## Add a lesson to an existing unit (data only, no code)

Open `data/unit1/lessons-b.js`, copy a lesson block and change the text. A lesson is a list of **screens**:

```text
explain   → a short text (about 25 words), optionally with a picture and a “Truc rapid” box
play      → an interactive picture; the learner plays BEFORE the rule is shown
question  → one question with 2–4 answers; each wrong answer has its own explanation
reveal    → the formula, colored the same way as the pictures
example   → a solved example (generated from an exercise family)
ask       → N generated exercises for one skill, starting at a level (1 easy, 2 medium, 3 hard)
quiz      → the short test at the end (5 questions)
```

Math is written between dollar signs, for example `$a^2 + b^2 = c^2$`. Colors: `\ca{a}` (blue), `\cb{b}` (orange),
`\cc{c}` (purple), `\cm{h}` (teal). Decimals are written with a dot, shown with a comma.

## Add a whole new unit

1. Make a folder `data/unit2/` with three files, copying the shape of `data/unit1/`:
   * `unit.js` — id, title, track (`'7'`, `'8'` or `'o'`), and the list of skills.
   * `templates.js` — the exercise families (this is the only part that contains a little real code: how to make the numbers,
     how to compute the answer **in two independent ways**, and the typical mistakes).
   * `lessons.js` — the screens.
2. In `data/units.js`, replace the “soon” line of that unit with `M.registerUnit(M.u2.unit);`.
3. Add the three new files to `index.html` (before `data/units.js`) and to `tests/load.mjs`.
4. Run `node tests/run-all.mjs`. It generates 1,000 exercises per family and checks that the answer is right, that no two
   options are equal, that every number looks reasonable, and that every skill, lesson and mistake label is consistent.
5. Run `node tools/make-sw.mjs` (updates the offline file list).

## Rules the checks enforce (so you cannot ship a wrong exercise)

* Every family has a `verify()` that recomputes the answer a different way.
* Every wrong option comes from a real mistake and carries an explanation of *that* mistake.
* No impossible figures, no duplicate options, no “NaN”, answers never absurdly large.
* Each skill belongs to exactly one lesson; a lesson may only practice skills from itself or earlier lessons.
* Explain screens stay short (≤ 45 words).

## Sources used for the course map

Chapters follow the official Romanian programme for clasa a VII-a (OMEN 3393/2017): numere reale; ecuații și sisteme;
organizarea datelor; patrulaterul; cercul; asemănarea triunghiurilor; relații metrice în triunghiul dreptunghic (Pitagora,
teorema înălțimii și a catetei, trigonometria). Intervale, inecuații, formule de calcul prescurtat, funcții și ecuația de gradul II
belong to clasa a VIII-a and appear under “Pregătire pentru clasa a VIII-a”.
