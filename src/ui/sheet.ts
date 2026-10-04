/**
 * Bottom sheet (Apple-Maps style): hidden → peek → full. Drag the handle/header
 * to move between states; content scrolls when full.
 */
export type SheetState = 'hidden' | 'peek' | 'full';

export class Sheet {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private state: SheetState = 'hidden';
  private onCloseFns = new Set<() => void>();

  constructor(root: HTMLElement) {
    this.el = root;
    root.innerHTML = `<div class="sheet-grip" aria-hidden="true"><span></span></div>
      <button class="sheet-close" aria-label="Close"></button>
      <div class="sheet-body"></div>`;
    this.body = root.querySelector('.sheet-body')!;
    root.querySelector<HTMLButtonElement>('.sheet-close')!.addEventListener('click', () => this.close());
    this.bindDrag(root.querySelector('.sheet-grip')!);
  }

  get content(): HTMLElement {
    return this.body;
  }

  get current(): SheetState {
    return this.state;
  }

  /** Replaces the content and shows the sheet. */
  open(html: string, state: SheetState = 'peek', closeIcon = '') {
    this.body.innerHTML = html;
    this.el.querySelector('.sheet-close')!.innerHTML = closeIcon;
    this.body.scrollTop = 0;
    this.set(state);
  }

  set(state: SheetState) {
    this.state = state;
    this.el.dataset.state = state;
    this.el.style.transform = '';
  }

  close() {
    if (this.state === 'hidden') return;
    this.set('hidden');
    for (const fn of this.onCloseFns) fn();
  }

  onClose(fn: () => void): () => void {
    this.onCloseFns.add(fn);
    return () => this.onCloseFns.delete(fn);
  }

  private bindDrag(handle: HTMLElement) {
    let startY = 0, dy = 0, dragging = false;
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      dy = e.clientY - startY;
      // Resist pulling up past full.
      const d = this.state === 'full' && dy < 0 ? dy * 0.2 : dy;
      this.el.style.transform = `translateY(${d}px)`;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('dragging');
      if (dy > 70) this.state === 'full' ? this.set('peek') : this.close();
      else if (dy < -50) this.set('full');
      else this.set(this.state); // snap back
    };
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      dy = 0;
      this.el.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // Tap on the grip toggles peek/full.
    handle.addEventListener('click', () => {
      if (Math.abs(dy) < 4) this.set(this.state === 'full' ? 'peek' : 'full');
    });
  }
}
