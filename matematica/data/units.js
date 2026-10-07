/* Registrul cursurilor: Unitatea 1 este completă; restul apar pe hartă ca „În curând” și se adaugă doar prin date. */
(function (M) {
  'use strict';
  M.skills = M.skills || {};
  M.TRACKS = {
    '7': { name: 'Clasa a VII-a', short: 'Cl. VII', cls: 't7' },
    '8': { name: 'Pregătire pentru clasa a VIII-a și Evaluarea Națională', short: 'Cl. VIII', cls: 't8' },
    'o': { name: 'Olimpiadă și performanță', short: 'Olimpiadă', cls: 'to' },
  };

  M.registerUnit = function (u) {
    u.lessons = u.lessons || [];
    u.lessons.forEach(function (l) { l.unit = u.id; (l.skills || []).forEach(function (sid) { M.skills[sid] = { id: sid, title: (u.skills && u.skills[sid]) || sid, lesson: l.id, unit: u.id }; }); });
    M.units.push(u);
    return u;
  };
  M.unitById = function (id) { return M.units.filter(function (u) { return u.id === id; })[0]; };
  M.lessonById = function (id) { let r = null; M.units.forEach(function (u) { u.lessons.forEach(function (l) { if (l.id === id) r = l; }); }); return r; };
  M.allSkills = function () { return Object.keys(M.skills); };
  M.openUnits = function () { return M.units.filter(function (u) { return u.status === 'open'; }); };

  const soon = function (id, no, track, title, blurb, lessons) {
    return { id: id, no: no, track: track, title: title, blurb: blurb, status: 'soon', lessons: lessons.map(function (t, i) { return { id: id + '-l' + (i + 1), title: t, skills: [], screens: [] }; }) };
  };

  /* ---- Unitatea 1 (completă) ---- */
  M.registerUnit(M.u1.unit);

  /* ---- Clasa a VII-a (programa oficială, OMEN 3393/2017) ---- */
  M.registerUnit(soon('u2', 2, '7', 'Numere reale', 'Radicali, numere iraționale, modul, operații și raționalizare.',
    ['Rădăcina pătrată și pătrate perfecte', 'Numere iraționale și mulțimea numerelor reale', 'Modulul unui număr real', 'Scoaterea și introducerea factorilor sub radical', 'Operații cu numere reale', 'Raționalizarea numitorului', 'Media aritmetică ponderată și media geometrică', 'Ecuația $x^2 = a$']));
  M.registerUnit(soon('u3', 3, '7', 'Ecuații și sisteme de ecuații liniare', 'De la egalități și identități la sisteme rezolvate prin substituție și reducere.',
    ['Egalități echivalente și identități', 'Ecuații de forma $ax + b = 0$', 'Sisteme: metoda substituției', 'Sisteme: metoda reducerii', 'Probleme rezolvate cu ecuații și sisteme']));
  M.registerUnit(soon('u4', 4, '7', 'Elemente de organizare a datelor', 'Produs cartezian, sistem de axe, dependențe funcționale, grafice.',
    ['Produsul cartezian a două mulțimi', 'Sistemul de axe ortogonale', 'Distanța dintre două puncte', 'Dependențe funcționale: tabele, diagrame, grafice', 'Poligonul frecvențelor']));
  M.registerUnit(soon('u5', 5, '7', 'Patrulaterul', 'Paralelogramul și cazurile lui particulare, trapezul, linia mijlocie, arii.',
    ['Patrulaterul convex', 'Paralelogramul', 'Linia mijlocie în triunghi și centrul de greutate', 'Dreptunghiul', 'Rombul', 'Pătratul', 'Trapezul și linia mijlocie în trapez', 'Perimetre și arii']));
  M.registerUnit(soon('u6', 6, '7', 'Cercul', 'Coarde, arce, unghi înscris, tangente, lungimea cercului și aria discului.',
    ['Coarde și arce în cerc', 'Unghiul înscris în cerc', 'Tangente dintr-un punct exterior', 'Poligoane regulate înscrise', 'Lungimea cercului și aria discului']));
  M.registerUnit(soon('u7', 7, '7', 'Asemănarea triunghiurilor', 'Thales, reciproca, triunghiuri asemenea, criterii și raportul ariilor.',
    ['Segmente proporționale', 'Teorema paralelelor echidistante', 'Teorema lui Thales și reciproca ei', 'Triunghiuri asemenea', 'Criterii de asemănare', 'Raportul ariilor și aplicații practice']));
  M.registerUnit(soon('u8', 8, '7', 'Trigonometrie în triunghiul dreptunghic', 'Sinus, cosinus, tangentă, cotangentă și rezolvarea triunghiului dreptunghic.',
    ['Sinus, cosinus, tangentă, cotangentă', 'Valorile pentru 30°, 45°, 60°', 'Rezolvarea triunghiului dreptunghic', 'Elemente în triunghiul echilateral, pătrat și hexagonul regulat', 'Aplicații practice']));

  /* ---- Pregătire clasa a VIII-a ---- */
  M.registerUnit(soon('u9', 9, '8', 'Intervale și inecuații', 'Intervale de numere reale și inecuații de forma $ax + b \\ge 0$.',
    ['Intervale de numere reale', 'Inecuații cu o necunoscută', 'Sisteme de inecuații', 'Probleme']));
  M.registerUnit(soon('u10', 10, '8', 'Calcul algebric și formule', 'Formule de calcul prescurtat, descompuneri în factori, fracții algebrice.',
    ['Reducerea termenilor asemenea', 'Pătratul unei sume și al unei diferențe', 'Diferența pătratelor', 'Descompuneri în factori', 'Fracții algebrice']));
  M.registerUnit(soon('u11', 11, '8', 'Funcții', 'Funcția liniară, grafic, panta și intersecțiile cu axele.',
    ['Noțiunea de funcție', 'Funcția $f(x) = ax + b$', 'Graficul unei funcții liniare', 'Intersecția cu axele', 'Probleme cu funcții']));
  M.registerUnit(soon('u12', 12, '8', 'Ecuația de gradul al II-lea', 'Rezolvarea ecuațiilor $ax^2 + bx + c = 0$.',
    ['Forma generală', 'Rezolvare prin descompunere', 'Formula soluțiilor', 'Probleme']));
  M.registerUnit(soon('u13', 13, '8', 'Geometrie în spațiu', 'Prisma, piramida, cilindrul, conul, sfera: arii și volume.',
    ['Prisma', 'Piramida', 'Cilindrul', 'Conul', 'Sfera', 'Arii și volume']));
  M.registerUnit(soon('u14', 14, '8', 'Statistică și probabilități', 'Frecvențe, medie, mediană, mod și probabilități simple.',
    ['Frecvențe și tabele', 'Media, mediana, modul', 'Reprezentări grafice', 'Probabilități simple']));

  /* ---- Olimpiadă ---- */
  M.registerUnit(soon('u15', 15, 'o', 'Divizibilitate și numere prime', 'Criterii, cmmdc, cmmmc, numere prime și restul împărțirii.',
    ['Criterii de divizibilitate', 'Cmmdc și cmmmc', 'Numere prime și descompuneri', 'Resturi și congruențe simple']));
  M.registerUnit(soon('u16', 16, 'o', 'Principiul cutiei și invarianți', 'Dirichlet, paritate, colorări și invarianți.',
    ['Principiul cutiei', 'Paritate', 'Invarianți', 'Colorări']));
  M.registerUnit(soon('u17', 17, 'o', 'Inegalități și artificii algebrice', 'Pătrate perfecte, inegalitatea mediilor, sume telescopice.',
    ['Pătratul unui număr real este pozitiv', 'Inegalitatea mediilor', 'Sume telescopice', 'Ecuații în numere întregi']));
  M.registerUnit(soon('u18', 18, 'o', 'Geometrie pentru concursuri', 'Arii, construcții ajutătoare, Thales avansat.',
    ['Metoda ariilor', 'Construcții ajutătoare', 'Linii mijlocii și paralele', 'Probleme de olimpiadă']));
})(window.M);
