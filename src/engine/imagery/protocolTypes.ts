import type { ImageryMode } from './renderTile';

export interface RenderRequest {
  type: 'render';
  id: number;
  z: number;
  x: number;
  y: number;
  mode: ImageryMode;
  scenes: Array<{ id: string; epsg: number }>;
  /** Cache API key; changes whenever the chosen scenes or the renderer change. */
  cacheKey: string;
  /** Scene-independent key, so offline packs still match after the scene index refreshes. */
  stableKey: string;
  /** Store in the offline-pack cache (never trimmed). */
  persist?: boolean;
}

export type WorkerRequest = RenderRequest | { type: 'cancel'; id: number };

export type WorkerReply =
  | { type: 'done'; id: number; data: ArrayBuffer }
  | { type: 'error'; id: number; message: string };
