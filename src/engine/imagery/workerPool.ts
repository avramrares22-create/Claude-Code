/** Small pool of imagery workers; each tile goes to the least-busy worker. */
import type { RenderRequest, WorkerReply } from './protocolTypes';

interface Slot {
  worker: Worker;
  busy: number;
}

interface Pending {
  slot: Slot;
  resolve: (b: ArrayBuffer) => void;
  reject: (e: Error) => void;
}

export class ImageryWorkerPool {
  private slots: Slot[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(size = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./imagery.worker.ts', import.meta.url), { type: 'module' });
      const slot: Slot = { worker, busy: 0 };
      worker.onmessage = (ev: MessageEvent<WorkerReply>) => this.onReply(ev.data);
      this.slots.push(slot);
    }
  }

  render(req: Omit<RenderRequest, 'type' | 'id'>, signal?: AbortSignal): Promise<ArrayBuffer> {
    const id = this.nextId++;
    const slot = this.pickSlot(req.z, req.x, req.y);
    slot.busy++;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this.pending.set(id, { slot, resolve, reject });
      signal?.addEventListener('abort', () => slot.worker.postMessage({ type: 'cancel', id }), { once: true });
      slot.worker.postMessage({ ...req, type: 'render', id } satisfies RenderRequest);
    });
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
    p.slot.busy--;
    if (msg.type === 'done') p.resolve(msg.data);
    else p.reject(new Error(msg.message));
  }

  terminate() {
    for (const s of this.slots) s.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('terminated'));
    this.pending.clear();
  }
}
