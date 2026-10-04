/**
 * Pool of imagery workers. Neighbouring tiles go to the same worker (cache
 * reuse); a crashed worker is replaced and its in-flight tiles fail fast so
 * MapLibre can retry them; every request has a watchdog timeout.
 */
import type { RenderRequest, WorkerReply } from './protocolTypes';

interface Slot {
  worker: Worker;
  busy: number;
  crashes: number;
}

interface Pending {
  slot: Slot;
  resolve: (b: ArrayBuffer) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const TILE_TIMEOUT_MS = 60_000;
const MAX_CRASHES = 5;

export class ImageryWorkerPool {
  private slots: Slot[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(size = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const slot: Slot = { worker: null as unknown as Worker, busy: 0, crashes: 0 };
      this.spawn(slot);
      this.slots.push(slot);
    }
  }

  private spawn(slot: Slot) {
    const worker = new Worker(new URL('./imagery.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerReply>) => this.onReply(ev.data);
    worker.onerror = (ev) => {
      ev.preventDefault();
      this.recover(slot, new Error(`Imagery worker crashed: ${ev.message || 'unknown error'}`));
    };
    worker.onmessageerror = () => this.recover(slot, new Error('Imagery worker message error'));
    slot.worker = worker;
  }

  /** Fails the slot's in-flight tiles and replaces its worker. */
  private recover(slot: Slot, err: Error) {
    for (const [id, p] of this.pending) {
      if (p.slot !== slot) continue;
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(err);
    }
    slot.busy = 0;
    slot.worker.terminate();
    if (++slot.crashes <= MAX_CRASHES) this.spawn(slot);
    else this.slots = this.slots.filter((s) => s !== slot); // keep going on the others
  }

  render(req: Omit<RenderRequest, 'type' | 'id'>, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (!this.slots.length) return Promise.reject(new Error('Imagery workers unavailable'));
    const id = this.nextId++;
    const slot = this.pickSlot(req.z, req.x, req.y);
    slot.busy++;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        p.slot.busy--;
        p.slot.worker.postMessage({ type: 'cancel', id });
        reject(new Error('Imagery tile timed out'));
      }, TILE_TIMEOUT_MS);
      this.pending.set(id, { slot, resolve, reject, timer });
      signal?.addEventListener('abort', () => slot.worker.postMessage({ type: 'cancel', id }), { once: true });
      slot.worker.postMessage({ ...req, type: 'render', id } satisfies RenderRequest);
    });
  }

  /** Tiles currently rendering across all workers. */
  get busy(): number {
    return this.slots.reduce((a, s) => a + s.busy, 0);
  }

  /**
   * Neighbouring tiles read the same scenes, so route each 4×4 block of tiles to
   * one worker to reuse its open COGs and block cache — unless that worker is
   * clearly backed up, then fall back to the least busy one.
   */
  private pickSlot(z: number, x: number, y: number): Slot {
    const key = ((x >> 2) * 73856093) ^ ((y >> 2) * 19349663) ^ (z * 83492791);
    const home = this.slots[Math.abs(key) % this.slots.length];
    const least = this.slots.reduce((a, b) => (b.busy < a.busy ? b : a));
    return home.busy <= least.busy + 3 ? home : least;
  }

  private onReply(msg: WorkerReply) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    p.slot.busy--;
    if (msg.type === 'done') p.resolve(msg.data);
    else p.reject(new Error(msg.message));
  }

  terminate() {
    for (const s of this.slots) s.worker.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('terminated'));
    }
    this.pending.clear();
  }
}
