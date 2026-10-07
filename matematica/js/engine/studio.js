/* Studio: din cererea scrisă în română („5 probleme mai grele cu povestea fotbalului”) la un plan, apoi la exerciții.
   Același plan poate veni din regulile de mai jos SAU dintr-un model local (JSON). În ambele cazuri,
   exercițiile sunt construite și VERIFICATE de cod: răspunsul nu vine niciodată de la un model. */
(function (M) {
  'use strict';
  const S = (M.studio = {});
  const MAX = 10;
  const ALLOWED_KEYS = { pl: 1, d: 1, t: 1, u: 1, s: 1, ty: 1, w: 1, v: 1 };

  const G = {
    hyp: ['hyp-int', 'hyp-dec', 'hyp-rad'], leg: ['leg-int', 'leg-dec', 'leg-rad'], conv: ['conv-check', 'conv-triple', 'conv-nature'],
    rad: ['rad-simp', 'rad-est'], sq: ['sq-area', 'sq-sum'], fig: ['fig-rect', 'fig-square', 'fig-iso', 'fig-equi', 'fig-rhomb', 'fig-trap', 'fig-coord'],
    app: ['app-ladder', 'app-screen', 'app-path', 'app-multi'], met: ['met-proj', 'met-height', 'met-leg', 'met-hside'], basic: ['rt-name', 'rt-longest'],
  };
  S.groups = G;

  const strip = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+,.\s-]/g, ' ').replace(/\s+/g, ' ').trim(); };
  S.strip = strip;

  const WORDS = { un: 1, o: 1, unu: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10, unsprezece: 11, doisprezece: 12, cincisprezece: 15, douazeci: 20 };

  /* Reguli în ordine, de la specific la general. O regulă care se potrivește „consumă” fraza găsită,
     ca regulile mai generale să nu o numere a doua oară (ex.: „proiecții pe ipotenuză” nu înseamnă și „ipotenuza”). */
  const RULES = [
    { re: /\brecunoasterea ipotenuzei|\bcatete si ipotenuza,? recunoastere|\bnotiunile de baza:? catete si ipotenuza|\brecunoastere\w*/, add: G.basic, label: 'recunoașterea catetelor și a ipotenuzei' },
    { re: /\bunde a gresit|\bdepistarea greselii|\bgaseste greseala|\bgreseala din rezolvare|\bdepist\w*/, add: ['err-spot'], label: 'depistarea greșelii' },
    { re: /\binaltimea (din arii|calculata cu aria)|\binaltime\w* din arie\w*/, add: ['met-hside'], label: 'înălțimea din arii' },
    { re: /\bteorema inaltimii|\binaltimea din unghiul drept/, add: ['met-height', 'met-proj'], label: 'teorema înălțimii' },
    { re: /\bteorema catetei|\bproiectii? pe ipotenuza|\bproiectii\w*/, add: ['met-leg', 'met-proj'], label: 'teorema catetei' },
    { re: /\brelatii metrice\w*|\binaltimea si cateta/, add: G.met, label: 'relații metrice' },
    { re: /\bnatura triunghiului|\bascutitunghic\w*|\bobtuzunghic\w*/, add: ['conv-nature'], label: 'natura triunghiului' },
    { re: /\breciproc\w*|\beste triunghiul dreptunghic|\bverificarea daca un triunghi (este|e) dreptunghic/, add: ['conv-check', 'conv-nature'], label: 'reciproca' },
    { re: /\btriplete?\s+pitagoreice|\bnumere pitagoreice|\btripletele?\b|\btriplet\w*/, add: ['conv-triple'], label: 'triplete pitagoreice' },
    { re: /\bestimarea radicalilor|\bestimarea unui radical|\bestimare\w*|\bestima\w*/, add: ['rad-est'], label: 'estimarea radicalilor' },
    { re: /\bscoaterea factorilor( de sub radical)?|\bcalcule cu radicali|\bradicali\b(?! simplificat)(?= *$)/, add: G.rad, label: 'radicali' },
    { re: /\bpatrate (pe|construite pe) laturi\w*|\baria patratelor|\bpatratelor construite/, add: ['sq-area', 'sq-sum'], label: 'pătrate pe laturi' },
    { re: /\baria patratului|\blatura si aria unui patrat/, add: ['sq-area'], label: 'aria pătratului' },
    { re: /\bpatrate?\w*\b/, add: ['fig-square'], label: 'pătrat' },
    { re: /\bdreptunghi(ul|ului|uri|urile|urilor)?\b/, add: ['fig-rect'], label: 'dreptunghi' },
    { re: /\bisoscel\w*/, add: ['fig-iso'], label: 'triunghi isoscel' },
    { re: /\bechilateral\w*/, add: ['fig-equi'], label: 'triunghi echilateral' },
    { re: /\bromb\w*/, add: ['fig-rhomb'], label: 'romb' },
    { re: /\btrapez\w*( isoscel| dreptunghic)?/, add: ['fig-trap'], label: 'trapez' },
    { re: /\bcoordonat\w*|\bplan cartezian|\bplanul cartezian|\bdistanta dintre|\bdistanta in plan|\bpuncte in plan/, add: ['fig-coord'], label: 'distanța în plan' },
    { re: /\becran\w*|\btelevizor\w*|\btv\b|\btelefon\w*|\blaptop\w*|\btableta|\btablete\w*|\bmonitor\w*|\binci\b/, add: ['app-screen'], label: 'ecrane' },
    { re: /\bscar[aiă]\w*|\bperete\w*|\bcablu\w*|\bstalp\w*|\bzmeu\w*|\bsfoar\w*|\balunec\w*/, add: ['app-ladder'], label: 'scară, cablu, zmeu' },
    { re: /\bfotbal\w*|\bstadion\w*|\bteren\w*|\bparc\w*|\bcurte\w*|\bpiata\w*|\btraseu\w*|\bdrumul?\b|\bscurtatura\w*/, add: ['app-path'], label: 'drumul cel mai scurt' },
    { re: /\bdoi pasi|\bdoua triunghiuri dreptunghice|\bdoua triunghiuri|\bpatrulater\w*/, add: ['app-multi'], label: 'probleme în doi pași' },
    { re: /\bviata reala|\bprobleme cu poveste|\bprobleme cu text|\baplicatii practice|\bpoveste\w*|\bpovesti\b/, add: G.app, label: 'probleme din viața reală' },
    { re: /\bdiagonal\w*/, add: ['fig-rect', 'fig-square', 'app-screen'], label: 'diagonale', onlyIfNone: ['fig-rect', 'fig-square', 'app-screen'] },
    { re: /\bfiguri geometrice|\baplicatii in geometrie|\bgeometri\w*|\bfiguri\b/, add: G.fig, label: 'Pitagora în figuri' },
    { re: /\bhipotenuz\w*|\bipotenuz\w*/, add: G.hyp, label: 'ipotenuza' },
    { re: /\bcatet\w*/, add: G.leg, label: 'catetele' },
  ];
  /* teme (povești) → filtre pe parametri; se aplică și după reguli */
  const THEMES = [
    { re: /\bfotbal\w*|\bstadion\w*/, tid: 'app-path', where: { pl: [0] }, label: 'povestea fotbalului' },
    { re: /\bparc\w*/, tid: 'app-path', where: { pl: [1] }, label: 'parc' },
    { re: /\bscoala|\bcurtea scolii|\bcurte\w*/, tid: 'app-path', where: { pl: [2] }, label: 'școală' },
    { re: /\bpiata\w*/, tid: 'app-path', where: { pl: [3] }, label: 'piață' },
    { re: /\bscar[aiă]\w*|\bperete\w*/, tid: 'app-ladder', where: { t: ['ladder', 'ladderD', 'slip'] }, label: 'scara pe perete' },
    { re: /\bcablu\w*|\bstalp\w*/, tid: 'app-ladder', where: { t: ['cable'] }, label: 'cablu și stâlp' },
    { re: /\bzmeu\w*|\bsfoar\w*/, tid: 'app-ladder', where: { t: ['kite'] }, label: 'zmeul' },
    { re: /\balunec\w*/, tid: 'app-ladder', where: { t: ['slip'] }, label: 'scara alunecă', replace: true },
    { re: /\btableta|\btablete\w*/, tid: 'app-screen', where: { d: [0] }, label: 'tabletă' },
    { re: /\bmonitor\w*/, tid: 'app-screen', where: { d: [1] }, label: 'monitor' },
    { re: /\btelevizor\w*|\btv\b/, tid: 'app-screen', where: { d: [2] }, label: 'televizor' },
    { re: /\btelefon\w*/, tid: 'app-screen', where: { d: [3] }, label: 'telefon' },
    { re: /\blaptop\w*/, tid: 'app-screen', where: { d: [4] }, label: 'laptop' },
  ];
  S.MIX = ['hyp-int', 'hyp-dec', 'leg-int', 'leg-dec', 'fig-rect', 'fig-iso', 'app-ladder', 'app-path'];

  /* ---------- corectarea greșelilor de scriere (distanță Damerau-Levenshtein ≤ 1) ---------- */
  const VOCAB = ('ipotenuza ipotenuzei hipotenuza catete cateta catetei catetele romb rombul trapez trapezul echilateral isoscel dreptunghi dreptunghiul patrat patratul patrate diagonala diagonalele radical radicali radicalilor ' +
    'scara scari perete cablu stalp zmeu zmeul sfoara ecran ecranul ecrane televizor telefon laptop tableta monitor fotbal fotbalului terenul teren parc parcul piata piata curtea scolii scoala coordonate reciproca triplete pitagoreice ascutitunghic obtuzunghic ' +
    'exercitii exercitiu probleme intrebari usoare simple medii grele dificile complicate avansate progresive crescatoare inaltimea inaltimii proiectii teorema lecția lectiile lectia amestec diverse greseala greseli slabe slabiciunile lacune zecimale zecimala rotunjita aproximata ' +
    'intregi intreg estimarea unghiul geometrice figuri figurilor aplicatii practice pitagora viata reala poveste povestea alunecă alunecă alunec patrulater triunghi triunghiul triunghiuri dreptunghic dreptunghice dreptunghic').split(' ');
  const VSET = {}; VOCAB.forEach(function (w) { VSET[strip(w)] = 1; });
  const VLIST = Object.keys(VSET);
  function dl1(a, b) {                       // distanță Damerau-Levenshtein ≤ 1?
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;                                   // înlocuire
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);   // transpoziție
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);          // inserare / ștergere
  }
  function fixTypos(t) {
    return t.split(' ').map(function (w) {
      if (w.length < 6 || VSET[w]) return w;
      for (let i = 0; i < VLIST.length; i++) { const v = VLIST[i]; if (v.length >= 6 && dl1(w, v)) return v; }
      return w;
    }).join(' ');
  }

  /* ---------- parsare ---------- */
  const NUMW = { unu: 1, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10, unsprezece: 11, doisprezece: 12, cincisprezece: 15, douazeci: 20 };
  function parseCount(t) {
    const t2 = t.replace(/\b(lectia|lectiile|clasa|unitatea)\s+[\d\s,si]+/g, ' ').replace(/\bdoi pasi\b|\bdoua triunghiuri( dreptunghice)?|\bdoua figuri/g, ' ');
    let m = /(\d{1,2})\s+(?:\w+\s+){0,3}?(exercit\w*|problem\w*|intrebar\w*|set\w*|sarcini|itemi|ex\b|bucati)/.exec(t2);
    if (m) return parseInt(m[1], 10);
    m = /\b(unu|doua|trei|patru|cinci|sase|sapte|opt|noua|zece|unsprezece|doisprezece|cincisprezece|douazeci)\b/.exec(t2);
    if (m) return NUMW[m[1]];
    m = /\b(\d{1,2})\b/.exec(t2);
    if (m && parseInt(m[1], 10) <= 30) return parseInt(m[1], 10);
    if (/\b(un|o)\s+(exercit\w*|problem\w*|intrebar\w*|exemplu)/.test(t2)) return 1;
    return null;
  }
  function parseLevel(t) {
    if (/\bde la usor la greu|\bprogresiv\w*|\bcrescator\w*|\btot mai gre\w*|\bincepand usor|\bpe masura ce avansez/.test(t)) return { ramp: true };
    if (/\bnici gre\w*[ ,]+nici usoare|\bstandard|\bde nivel mediu|\bde dificultate medie|\bmedii\b|\bmediu\b|\bnormale|\bobisnuite/.test(t)) return { level: 2, word: 'mediu' };
    if (/\bmai (grele|greu)\b|\bgrele\b|\bgreu\b|\bdificil\w*|\bavansat\w*|\bolimpiad\w*|\bperformanta|\bprovocator\w*|\bcomplicat\w*|\bpentru concurs|\bdure\b|\bserioase|\bde concurs/.test(t)) return { level: 3, word: 'greu' };
    if (/\bmai usoare|\bmai simple|\busoar\w*|\busor\w*|\bsimple\b|\bincepator\w*|\bde baza\b|\bde inceput|\bpentru inceput|\baccesibil\w*|\busurel\w*|\bfoarte simple/.test(t)) return { level: 1, word: 'ușor' };
    return null;
  }

  S.parse = function (text) {
    let t = fixTypos(strip(text));
    const notes = [], topics = [];
    let ids = [];
    const add = function (list) { list.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); };
    let weak = /\bpunct\w*\s+(?:\w+\s+){0,2}slab|\bslabiciun\w*|\bce nu stiu|\bce gresesc|\bpe unde gresesc|\blacune|\bunde am lacune/.test(t);
    if (weak) t = t.replace(/\bpunct\w*\s+(?:\w+\s+){0,2}slab\w*|\bslabiciun\w*|\bce nu stiu|\bce gresesc( cel mai des)?|\bunde am lacune|\blacune\w*/g, ' ');

    /* amestecuri */
    if (/\bamestec\w*|\bmix\b|\bdiverse|\bde toate\b|\btoate (tipurile|felurile)/.test(t)) { add(S.MIX); topics.push('amestec'); t = t.replace(/\bamestec\w*|\bmix\b|\bdiverse( tipuri)?|\bde toate\b|\btoate (tipurile|felurile)/g, ' '); }

    /* lecții numite explicit: „lecția 3 și 4” */
    const lm = /lecti\w*\s+((?:\d+\s*(?:si|sau|,|\+|-)?\s*)+)/.exec(t);
    if (lm) {
      const nums = (lm[1].match(/\d+/g) || []).map(Number).filter(function (n) { return n >= 1 && n <= 8; });
      nums.forEach(function (n) {
        const l = M.unitById('u1').lessons[n - 1];
        if (l) { l.skills.forEach(function (sk) { M.templatesForSkill(sk).forEach(function (tp) { add([tp.id]); }); }); topics.push('lecția ' + n); }
      });
      t = t.replace(lm[0], ' ');
    }

    /* forma răspunsului (doar pentru ipotenuză / catete); „fără radicali / fără zecimale” sunt negații */
    let form = null;
    const formApplies = /\bipotenuz\w*|\bhipotenuz\w*|\bcatet\w*/.test(t);
    if (/\bfara radical\w*|\bfara zecimale/.test(t)) { form = 'int'; t = t.replace(/\bfara radical\w*|\bfara zecimale/g, ' '); }
    else if (formApplies) {
      if (/\bzecimal\w*|\brotunji\w*|\baproxim\w*/.test(t)) { form = 'dec'; t = t.replace(/\b(la )?(o |doua )?zecimal\w*|\brotunji\w*|\baproxim\w*/g, ' '); }
      else if (/\bradical\w* simplificat|\bsub forma de radical|\bcu radical\w*/.test(t)) { form = 'rad'; t = t.replace(/\bradical\w* simplificat|\bsub forma de radical|\bcu radical\w*/g, ' '); }
      else if (/\bnumere intregi|\bintreg\w*|\bnumere frumoase|\bcu triplete( pitagoreice)?/.test(t)) { form = 'int'; t = t.replace(/\bdoar numere intregi|\bnumere intregi|\bintreg\w*|\bnumere frumoase|\bcu triplete( pitagoreice)?/g, ' '); }
    }

    RULES.forEach(function (r) {
      if (r.onlyIfNone && r.onlyIfNone.some(function (id) { return ids.indexOf(id) >= 0; })) return;
      if (r.re.test(t)) { add(r.add); if (topics.indexOf(r.label) < 0) topics.push(r.label); t = t.replace(new RegExp(r.re.source, 'g'), ' '); }
    });
    if (/\bpitagora\b|\bteorema lui pitagora/.test(t) && !ids.length && !weak) { add(G.hyp.concat(G.leg)); topics.push('Pitagora (ipotenuză și catete)'); }

    if (form && ids.length) {
      /* filtrăm doar familiile care au variante (-int / -dec / -rad); restul rămân neatinse */
      const kept = ids.filter(function (id) { return !/-(int|dec|rad)$/.test(id) || id.slice(-3) === form; });
      if (kept.some(function (id) { return id.slice(-3) === form; })) ids = kept;
    }

    /* povești → filtre pe parametri; o poveste anume înseamnă doar familiile ei */
    const text0 = fixTypos(strip(text));
    const filters = {}; const themeIds = [];
    THEMES.forEach(function (th) {
      if (th.re.test(text0)) {
        if (th.replace) { filters[th.tid] = { t: ['slip'] }; return; }
        if (ids.indexOf(th.tid) < 0) ids.push(th.tid);
        themeIds.push(th.tid);
        filters[th.tid] = filters[th.tid] || {};
        Object.keys(th.where).forEach(function (k) { filters[th.tid][k] = Array.from(new Set((filters[th.tid][k] || []).concat(th.where[k]))); });
        if (topics.indexOf(th.label) < 0) topics.push(th.label);
      }
    });
    /* „școală” și „curte” se suprapun cu „curtea”: păstrăm doar filtrul cel mai specific */
    if (themeIds.length) ids = ids.filter(function (id) { return G.app.indexOf(id) < 0 || themeIds.indexOf(id) >= 0; });

    if (!ids.length && !weak) {
      ids = G.hyp.concat(G.leg);
      notes.push('Nu am recunoscut subiectul, așa că am ales Pitagora de bază (ipotenuza și catetele). Încearcă de ex. „5 probleme cu scara pe perete” sau „exerciții cu romb”.');
    }

    let count = parseCount(text0);
    if (count === null) count = 5;
    if (count > MAX) { notes.push('Pot construi cel mult ' + MAX + ' exerciții odată; am redus de la ' + count + '.'); count = MAX; }
    if (count < 1) count = 1;
    const lv = parseLevel(text0);
    return {
      count: count, level: lv && lv.level ? lv.level : 0, ramp: !!(lv && lv.ramp), levelWord: lv && lv.word ? lv.word : null,
      templates: ids.map(function (id) { return { id: id, where: filters[id] && Object.keys(filters[id]).length ? filters[id] : null }; }),
      weak: weak, topics: topics, notes: notes, source: 'reguli',
    };
  };

  S.describe = function (plan) {
    const parts = [plan.count + (plan.count === 1 ? ' exercițiu' : ' exerciții')];
    parts.push(plan.ramp ? 'de la ușor la greu' : plan.level ? 'nivel ' + ['ușor', 'mediu', 'greu'][plan.level - 1] : 'nivel adaptat');
    if (plan.weak) parts.push('pe punctele tale slabe');
    else if (plan.topics.length) parts.push(plan.topics.join(', '));
    return parts.join(' · ');
  };

  /* ---------- plan venit din model (JSON) ---------- */
  S.planFromJSON = function (obj) {
    if (!obj || typeof obj !== 'object') return null;
    const raw = Array.isArray(obj.templates) ? obj.templates : [];
    const tpls = [];
    raw.slice(0, 30).forEach(function (it) {
      const id = typeof it === 'string' ? it : it && it.id;
      if (typeof id !== 'string' || !M.templates[id]) return;
      let where = null;
      if (it && it.where && typeof it.where === 'object') {
        where = {};
        Object.keys(it.where).forEach(function (k) {
          if (!ALLOWED_KEYS[k]) return;
          const arr = [].concat(it.where[k]).filter(function (v) { return typeof v === 'number' || (typeof v === 'string' && v.length < 24); }).slice(0, 8);
          if (arr.length) where[k] = arr;
        });
        if (!Object.keys(where).length) where = null;
      }
      tpls.push({ id: id, where: where });
    });
    if (!tpls.length && !obj.weak) return null;
    let count = parseInt(obj.count, 10); if (!(count >= 1)) count = 5; count = Math.min(MAX, count);
    let level = parseInt(obj.level, 10); if (!(level >= 1 && level <= 3)) level = 0;
    return { count: count, level: level, ramp: !!obj.ramp, levelWord: null, templates: tpls, weak: !!obj.weak, topics: tpls.map(function (t) { return t.id; }), notes: [], source: 'model' };
  };

  /* ---------- generare + verificare ---------- */
  function matches(p, where) {
    if (!where) return true;
    return Object.keys(where).every(function (k) { if (!(k in p)) return true; return where[k].indexOf(p[k]) >= 0; });
  }
  S.generate = function (plan, opts) {
    opts = opts || {};
    const rng = M.rng(opts.seed || ((Date.now() % 2147483000) + 1));
    const notes = (plan.notes || []).slice();
    let tpls = plan.templates.slice();
    if (plan.weak) {
      const all = []; M.openUnits().forEach(function (u) { M.unitSkills(u).forEach(function (s) { all.push(s); }); });
      let w = M.weakSkills(all, 6).map(function (r) { return r.id; });
      if (!w.length) { notes.push('Încă nu am destule răspunsuri ca să știu care sunt punctele tale slabe; am ales abilități variate.'); w = all.filter(function (s) { return M.weakness(s) !== null; }); }
      if (!w.length) w = all.slice(0, 8);
      w.forEach(function (sk) { M.templatesForSkill(sk).forEach(function (t) { if (!tpls.some(function (x) { return x.id === t.id; })) tpls.push({ id: t.id, where: null }); }); });
    }
    if (!tpls.length) return { exercises: [], notes: notes.concat(['Nu am găsit nicio familie de exerciții potrivită.']), dropped: 0 };
    const out = [], seen = {};
    let dropped = 0, guard = 0;
    const order = rng.shuffle(tpls);
    while (out.length < plan.count && guard < plan.count * 60) {
      guard++;
      const tp = order[(out.length + guard) % order.length];
      const t = M.templates[tp.id];
      let lv = plan.ramp ? [1, 2, 3][Math.min(2, Math.floor(out.length * 3 / plan.count))] : plan.level || rng.pick([2, 2, 3]);
      lv = t.levels.indexOf(lv) >= 0 ? lv : t.levels.reduce(function (b, x) { return Math.abs(x - lv) < Math.abs(b - lv) ? x : b; }, t.levels[0]);
      let sp = M.templateSpace(t, lv);
      let f = sp.filter(function (p) { return matches(p, tp.where); });
      if (!f.length) { f = sp; if (tp.where && notes.indexOf('Unele filtre (poveste) nu se potrivesc la nivelul cerut; am ales cea mai apropiată variantă.') < 0) notes.push('Unele filtre (poveste) nu se potrivesc la nivelul cerut; am ales cea mai apropiată variantă.'); }
      const p = rng.pick(f);
      const seed = rng.int(1, 2147483000);
      let ex;
      try { ex = M.exercise.fromParams(t, p, lv, seed, lv >= 2 ? 'input' : undefined); } catch (e) { dropped++; continue; }
      /* verificare riguroasă: structură + recalcul independent */
      let ok = M.exercise.validate(ex).length === 0;
      try { ok = ok && !!t.verify(p, ex); } catch (e) { ok = false; }
      if (!ok) { dropped++; continue; }
      const key = M.exercise.key(ex);
      if (seen[key]) continue;
      seen[key] = 1; out.push(ex);
    }
    if (out.length < plan.count) notes.push('Am găsit doar ' + out.length + ' exerciții distincte pentru cererea ta.');
    return { exercises: out, notes: notes, dropped: dropped };
  };


  /* ---------- prompt și schemă pentru modelul local (aceleași la antrenare și la utilizare) ---------- */
  S.systemPrompt = function () {
    /* prompt scurt: lista familiilor este învățată la antrenare și impusă la inferență prin schema JSON (enum) */
    return 'Transformi o cerere în limba română într-un plan JSON pentru generatorul de exerciții de matematică (Teorema lui Pitagora, clasa a VII-a). ' +
      'Nu rezolvi exerciții și nu răspunzi la alte întrebări; dacă cererea nu e despre exerciții, întorci "templates":[]. Răspunzi doar cu JSON.';
  };
  S.planSchema = function () {
    return {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1, maximum: MAX }, level: { type: 'integer', minimum: 0, maximum: 3 }, ramp: { type: 'boolean' }, weak: { type: 'boolean' },
        templates: { type: 'array', maxItems: 12, items: { type: 'object', properties: { id: { type: 'string', enum: Object.keys(M.templates) }, where: { type: 'object' } }, required: ['id'] } },
      },
      required: ['count', 'level', 'templates'],
    };
  };

  /* ---------- seturi salvate ---------- */
  S.pack = function (exs) { return exs.map(function (e) { return { t: e.templateId, p: e.params, l: e.level, s: e.seed, m: e.mode }; }); };
  S.unpack = function (items) {
    const out = [];
    items.forEach(function (it) { const t = M.templates[it.t]; if (!t) return; try { out.push(M.exercise.fromParams(t, it.p, it.l, it.s, it.m)); } catch (e) { /* sărim */ } });
    return out;
  };
})(window.M);
