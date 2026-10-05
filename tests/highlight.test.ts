import { describe, expect, it } from 'vitest';
import { highlight } from '../src/ui/highlight';

describe('search highlight', () => {
  it('bolds accent-insensitive word-start matches', () => {
    expect(highlight('Lacul Nouă', 'lacul noua')).toBe('<b>Lacul</b> <b>Nouă</b>');
    expect(highlight('Cabana Postăvarul', 'posta')).toBe('Cabana <b>Postă</b>varul');
  });
  it('ignores mid-word matches and escapes HTML', () => {
    expect(highlight('Ianoua', 'noua')).toBe('Ianoua');
    expect(highlight('<b>x</b> Vârf', 'varf')).toBe('&#60;b&#62;x&#60;/b&#62; <b>Vârf</b>');
  });
});
