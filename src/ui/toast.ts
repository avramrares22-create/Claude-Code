/** Small toast notifications (top of screen, below the search bar). */
export interface ToastOptions {
  ms?: number;
  kind?: 'info' | 'success' | 'warn' | 'error';
  action?: { label: string; run: () => void };
  /** Replaces an existing toast with the same key instead of stacking. */
  key?: string;
}

const host = () => document.getElementById('toasts')!;
const byKey = new Map<string, HTMLElement>();

export function toast(message: string, opts: ToastOptions = {}): () => void {
  const { ms = 3000, kind = 'info', action, key } = opts;
  if (key) byKey.get(key)?.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.run();
      dismiss();
    });
    el.append(b);
  }
  host().append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  if (key) byKey.set(key, el);
  let timer: number | undefined;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 250);
    if (key && byKey.get(key) === el) byKey.delete(key);
  };
  if (ms > 0) timer = window.setTimeout(dismiss, ms);
  return dismiss;
}
