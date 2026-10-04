/**
 * Picks the best reachable sub-metre imagery source *from the user's device*.
 * ANCPI may only answer requests from Romanian networks, so it has to be probed
 * at runtime; Esri is the global fallback.
 */
import { HIRES, type HiresProvider } from '../config';

const CACHE_KEY = 'nature-engine:hires:v1';
const CACHE_TTL = 24 * 3600 * 1000;

export async function probeProvider(p: HiresProvider, timeoutMs = 6000): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(p.probe, { signal: ac.signal, mode: 'cors' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return false;
    // ArcGIS returns tiny blank/placeholder images when it has no data.
    return (await res.blob()).size > 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** First provider (in preference order) that answers with a real image, or null. */
export async function chooseHires(providers: HiresProvider[] = HIRES): Promise<HiresProvider | null> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { t, id } = JSON.parse(raw) as { t: number; id: string | null };
      if (Date.now() - t < CACHE_TTL) return providers.find((p) => p.id === id) ?? null;
    }
  } catch {
    // ignore unreadable cache
  }
  let chosen: HiresProvider | null = null;
  for (const p of providers) {
    if (await probeProvider(p)) {
      chosen = p;
      break;
    }
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), id: chosen?.id ?? null }));
  } catch {
    // storage unavailable
  }
  return chosen;
}
