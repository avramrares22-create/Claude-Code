/* Mesaje scurte, calme: nu infantile, nu răutăcioase. */
(function (M) {
  'use strict';
  M.messages = {
    correct: [
      'Corect!', 'Exact așa.', 'Bine gândit.', 'Foarte bine.', 'Perfect — ai urmărit corect pașii.', 'Așa se face.', 'Ai înțeles ideea.',
      'Raționament curat.', 'Aceasta este metoda.', 'Corect, inclusiv pasul cu rădăcina.', 'Excelent.', 'Se vede că ai exersat.', 'Răspuns sigur.',
      'Exact! Mergi mai departe.', 'Calcul precis.', 'Bine observat.', 'Tot mai sigur pe tine.', 'Ai ales drumul potrivit.', 'Rezolvare elegantă.',
      'Fără greșeală. Continuă așa.', 'Clar și corect.', 'Așa gândesc matematicienii.',
    ],
    wrong: [
      'Nu chiar — dar ești aproape de idee.', 'Hai să ne uităm împreună la ce s-a întâmplat.', 'Greșelile fac parte din învățare.', 'Mai încearcă o dată, poți.',
      'Nu e încă bine; citește explicația.', 'Aproape! Verifică un pas.', 'Se întâmplă. Vezi unde s-a rupt raționamentul.', 'Un pas mai atent și iese.',
    ],
    again: ['Încearcă din nou.', 'Mai verifică o dată.', 'Ai un indiciu la îndemână.'],
    complete: ['Lecție terminată.', 'Ai parcurs toată lecția.', 'Încă o lecție în plus în minte.', 'Bună treabă — continuă când ești gata.'],
    streak: ['Ai exersat azi — seria continuă.', 'Încă o zi la rând.'],
  };
  let last = {};
  M.pickMsg = function (kind) {
    const arr = M.messages[kind];
    let i = Math.floor(Math.random() * arr.length);
    if (arr.length > 1 && i === last[kind]) i = (i + 1) % arr.length;
    last[kind] = i;
    return arr[i];
  };
})(window.M);
