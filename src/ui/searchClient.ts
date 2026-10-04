/**
 * Main-thread client for the search worker. Falls back gracefully: if the
 * index can't load (first launch offline), callers use Photon / local data.
 */
import type { Cat } from '../engine/search/categories';
import type { SearchResult } from '../engine/search/search';
import { BASE_URL } from '../engine/util/base';

export type { SearchResult };
export interface LocalSearch {
  results: SearchResult[];
  anchor?: string | null;
  confidence?: number;
  cue?: string[];
  nearMe?: boolean;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let readyP: Promise<number> | null = null;

function ensure(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../engine/search/search.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const m = ev.data as { type: string; id?: number; out?: unknown; message?: string; entries?: number };
    if (m.type === 'ready') return readyResolve?.(m.entries ?? 0);
    const p = pending.get(m.id ?? -1);
    if (m.type === 'error' && m.id === -1) {
      readyReject?.(new Error(m.message));
      return;
    }
    if (!p) return;
    pending.delete(m.id!);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m.out);
  };
  worker.onerror = () => {
    for (const p of pending.values()) p.reject(new Error('search worker crashed'));
    pending.clear();
    worker?.terminate();
    worker = null;
    readyP = null;
  };
  return worker;
}
let readyResolve: ((n: number) => void) | null = null;
let readyReject: ((e: Error) => void) | null = null;

/** Starts loading the index (call early, e.g. when the search box gets focus). */
export function warmUp(): Promise<number> {
  readyP ??= new Promise<number>((res, rej) => {
    readyResolve = res;
    readyReject = rej;
    ensure().postMessage({ type: 'init', base: BASE_URL });
  }).catch((e) => {
    readyP = null;
    throw e;
  });
  return readyP;
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ensure().postMessage({ ...msg, id });
  });
}

export async function searchOffline(q: string, focus: [number, number], focusIsUser = false): Promise<LocalSearch> {
  await warmUp();
  return call<LocalSearch>({ type: 'search', q, focus, focusIsUser });
}

export async function browse(cats: Cat[], focus: [number, number]): Promise<LocalSearch> {
  await warmUp();
  return call<LocalSearch>({ type: 'browse', cats, focus });
}

export async function routeGeometry(osm: string, lng: number, lat: number): Promise<Array<Array<[number, number]>> | null> {
  await warmUp();
  return call({ type: 'route', osm, lng, lat });
}
