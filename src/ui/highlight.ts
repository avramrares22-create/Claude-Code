import { fold } from '../engine/search/text';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Bolds the parts of `name` that the query matched, Google-style. Matching is
 * accent- and case-insensitive ("lacul noua" bolds "Lacul Nouă"), at word
 * starts, so "noua" doesn't light up the middle of "Ianoua". Returns safe HTML.
 */
export function highlight(name: string, query: string): string {
  const words = fold(query).split(' ').filter((w) => w.length >= 2);
  if (!words.length) return escape(name);
  // Fold char by char, remembering where each folded char came from.
  let folded = '';
  const from: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const f = fold(name[i]) || ' ';
    for (const c of f) {
      folded += c;
      from.push(i);
    }
  }
  const on = new Uint8Array(name.length);
  for (const w of words) {
    let at = folded.indexOf(w);
    while (at >= 0) {
      if (at === 0 || folded[at - 1] === ' ') {
        for (let k = at; k < at + w.length; k++) on[from[k]] = 1;
        break;
      }
      at = folded.indexOf(w, at + 1);
    }
  }
  let out = '';
  let open = false;
  for (let i = 0; i < name.length; i++) {
    if (on[i] && !open) (out += '<b>'), (open = true);
    if (!on[i] && open) (out += '</b>'), (open = false);
    out += escape(name[i]);
  }
  return open ? out + '</b>' : out;
}
