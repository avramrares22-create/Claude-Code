/* Etichetele greșelilor tipice → categorii în limba română (folosite în „Zona mea”). */
(function (M) {
  'use strict';
  const CAT = {
    lengths: { title: 'Operezi cu lungimile, nu cu pătratele', tip: 'În teorema lui Pitagora se adună sau se scad **pătratele** laturilor ($a^2$, $b^2$), nu lungimile lor.' },
    root: { title: 'Rădăcina pătrată uitată', tip: 'După ce afli $c^2$ (sau $b^2$), extrage rădăcina pătrată: $c = \\sqrt{c^2}$.' },
    rootplace: { title: 'Rădăcina pusă unde nu trebuie', tip: 'Rădăcina se extrage o singură dată, la final, din rezultatul final al calculului.' },
    opsign: { title: 'Adunare și scădere confundate', tip: 'Ipotenuza se află **adunând** pătratele catetelor; o catetă se află **scăzând** din pătratul ipotenuzei.' },
    hyp: { title: 'Ipotenuză sau catetă identificată greșit', tip: 'Ipotenuza este în fața unghiului drept și este cea mai lungă latură.' },
    formula: { title: 'Formule amestecate (arie, perimetru, jumătăți)', tip: 'Verifică formula figurii: perimetrul însumă laturile, aria folosește produse și, la triunghi, jumătate din produs.' },
    steps: { title: 'Triunghi greșit ales sau pași sărițiți', tip: 'Desenează triunghiul dreptunghic potrivit și rezolvă pe rând, pe etape; nu amesteca lungimi din triunghiuri diferite.' },
    radicals: { title: 'Greșeli cu radicalii', tip: '$\\sqrt{a \\cdot b} = \\sqrt{a} \\cdot \\sqrt{b}$, dar $\\sqrt{a + b} \\ne \\sqrt{a} + \\sqrt{b}$. Scoate factorii pătrați până la capăt.' },
    estimate: { title: 'Estimare și apropiere', tip: 'Încadrează numărul între două pătrate perfecte consecutive și verifică prin ridicare la pătrat.' },
    converse: { title: 'Reciproca: justificare greșită', tip: 'Pentru unghi drept se compară $a^2 + b^2$ cu $c^2$ — nu sumele lungimilor, nici faptul că există triunghiul.' },
    units: { title: 'Scalare, unități, semne', tip: 'Verifică factorul de scalare, sensul conversiei și semnele diferențelor de coordonate.' },
    mean: { title: 'Medie în loc de produs', tip: 'Teoremele înălțimii și catetei folosesc **produse**: $h^2 = p \\cdot q$, $b^2 = p \\cdot c$.' },
    other: { title: 'Alte greșeli de calcul', tip: 'Reia calculul pas cu pas și verifică fiecare operație.' },
  };
  const MAP = {
    lengths: ['add-legs', 'add-diffs', 'sum-lengths', 'sum', 'sum-all', 'sum-of-halves', 'sum-heights', 'diff-lengths', 'diff', 'diff-sides', 'add', 'added', 'add-k', 'sum-of-sides', 'one-side', 'one-leg', 'one-base', 'half-as-side', 'sum-square'],
    root: ['forgot-root', 'forgot-root3'],
    rootplace: ['root', 'root-too-early', 'sqrt-product', 'wrong-root', 'sum-under-root'],
    opsign: ['add-for-leg', 'add-instead', 'subtract'],
    hyp: ['hyp-as-leg', 'leg-as-hyp', 'wrong-hyp', 'wrong-vertex', 'wrong-projection', 'hypotenuse', 'bad-range'],
    formula: ['area', 'area-guess', 'perimeter', 'half-perimeter', 'semi-perimeter', 'double', 'double-side', 'forgot-double', 'forgot-half', 'forgot-quarter', 'forgot-divide', 'forgot-2', 'halves', 'half', 'half-side', 'half-square', 'quarter', 'side-only', 'rect', 'side-times-base', 'side-times-diag', 'times-3', 'times-root3', 'multiplied', 'product', 'diag-times-4', 'sq-perim', 'perimeter-as-side', 'half-base'],
    steps: ['wrong-triangle', 'stop-early', 'forgot-first', 'pythagoras', 'pythagoras-on-projections', 'whole-base', 'whole-diag', 'whole-diagonals', 'whole-difference', 'extra-diag', 'diag-as-side', 'diag-as-area', 'diag-only', 'edges-only', 'height', 'height-as-side', 'height-as-area', 'height-theorem', 'other-leg', 'other-projection', 'projection', 'wrong-height', 'wrong-side', 'new-height', 'foot-move', 'missing-side', 'repeat', 'one-triangle', 'misdiagnosed'],
    radicals: ['not-simplified', 'square-outside', 'root-of-sum', 'swapped', 'no-square', 'square-sum', 'square-diag', 'square-side'],
    estimate: ['bad-estimate', 'wrong-interval', 'near', 'mix'],
    converse: ['triangle-ineq', 'wrong-reason', 'nice-numbers', 'not-triple', 'wrong-nature-ascuțitunghic', 'wrong-nature-dreptunghic', 'wrong-nature-obtuzunghic', 'wrong-theorem', 'wrong-formula'],
    units: ['no-conversion', 'wrong-direction', 'unscaled', 'sign-error'],
    mean: ['mean'],
  };
  const tagCat = {};
  Object.keys(MAP).forEach(function (c) { MAP[c].forEach(function (t) { tagCat[t] = c; }); });

  M.mistakeCats = CAT;
  M.mistakeCategory = function (tag) { return tagCat[tag] || 'other'; };
  M.mistakeUnmapped = function (tag) { return !tagCat[tag] && tag !== 'other'; };
})(window.M);
