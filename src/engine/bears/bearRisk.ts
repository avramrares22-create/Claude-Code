/**
 * Bear risk estimate around the user (10 km and 1 km).
 *
 * Built from public data only, and an estimate, not a guarantee:
 *  - Bear density grid (public/bears/density.bin, ~1 km cells). It comes from
 *    the 2025 national genetic census (bears per county), spread over habitat
 *    by a model trained on bear sightings, land cover and terrain
 *    (ml/bears/build_bear_grid.py).
 *  - Live bear sightings from iNaturalist (last 30 days). Coordinates are
 *    obscured to ~20 km for bears, so they are weighted by the chance they
 *    really fall inside the radius.
 *  - Season, light (dawn/dusk/night) and travel mode, which change how likely
 *    a close encounter is.
 *
 * The result is a 1–100 index on a log scale of expected bear density
 * (encounter likelihood). It is not a probability of being attacked.
 */
import { BASE_URL } from '../util/base';
import { fetchJson, fetchSafe } from '../util/net';

export interface BearGridMeta {
  west: number;
  north: number;
  res: number;
  width: number;
  height: number;
  encoding: { zero: number; log10Min: number; log10Max: number; steps: number };
  validation?: Record<string, unknown>;
  sources?: string[];
}

export interface FineMeta {
  res: number;
  tile: number;
  tiles: string[];
}

export class BearGrid {
  /** ~200 m tiles (1° each), loaded for the area around you. */
  private fine = new Map<string, Uint8Array | null>();
  private fineMeta: FineMeta | null = null;

  constructor(
    readonly meta: BearGridMeta,
    private readonly data: Uint8Array,
  ) {}

  setFineMeta(m: FineMeta) {
    this.fineMeta = m;
  }

  /** Adds a fine tile (for tests and loaders). */
  addFineTile(key: string, bytes: Uint8Array | null) {
    this.fine.set(key, bytes);
  }

  /** Loads the fine tiles around a point (no-op where there are none or already loaded). */
  async ensureFine(lng: number, lat: number, load: (key: string) => Promise<Uint8Array | null>) {
    const fm = this.fineMeta;
    if (!fm) return;
    const keys = new Set<string>();
    for (const dx of [-0.06, 0, 0.06]) for (const dy of [-0.05, 0, 0.05]) keys.add(`${Math.floor(lng + dx)}_${Math.floor(lat + dy)}`);
    await Promise.all(
      [...keys].filter((k) => !this.fine.has(k) && fm.tiles.includes(k)).map(async (k) => this.fine.set(k, await load(k).catch(() => null))),
    );
  }

  /** Raw bytes of one loaded ~200 m tile (for drawing the bear-zones layer). */
  fineTile(key: string): Uint8Array | null | undefined {
    return this.fine.get(key);
  }

  get fineInfo(): FineMeta | null {
    return this.fineMeta;
  }

  /** Fine density at a point, or null where no fine tile is loaded. */
  fineAt(lng: number, lat: number): number | null {
    const fm = this.fineMeta;
    if (!fm) return null;
    const tx = Math.floor(lng);
    const ty = Math.floor(lat);
    const t = this.fine.get(`${tx}_${ty}`);
    if (!t) return this.fineMeta?.tiles.includes(`${tx}_${ty}`) ? null : 0;
    const x = Math.min(fm.tile - 1, Math.floor((lng - tx) / fm.res));
    const y = Math.min(fm.tile - 1, Math.floor((ty + 1 - lat) / fm.res));
    return this.decode(t[y * fm.tile + x]);
  }

  /** Bears per km² in the cell containing the point (0 outside Romania). */
  densityAt(lng: number, lat: number): number {
    const { west, north, res, width, height } = this.meta;
    const x = Math.floor((lng - west) / res);
    const y = Math.floor((north - lat) / res);
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return this.decode(this.data[y * width + x]);
  }

  decode(q: number): number {
    const e = this.meta.encoding;
    if (q === e.zero) return 0;
    return 10 ** (e.log10Min + ((q - 1) / e.steps) * (e.log10Max - e.log10Min));
  }

  /**
   * Density right around you: a distance-weighted mean (Gaussian, σ = sigmaKm),
   * so the place you stand on counts most and a forest edge 900 m away doesn't
   * dominate a city street.
   */
  local(lng: number, lat: number, sigmaKm: number): number {
    const f = this.localFine(lng, lat, sigmaKm);
    return f ?? this.localCoarse(lng, lat, sigmaKm);
  }

  /** True when ~200 m data covers this point. */
  hasFine(lng: number, lat: number): boolean {
    return this.fineAt(lng, lat) !== null && this.fine.has(`${Math.floor(lng)}_${Math.floor(lat)}`);
  }

  private localFine(lng: number, lat: number, sigmaKm: number): number | null {
    const fm = this.fineMeta;
    if (!fm || !this.hasFine(lng, lat)) return null;
    const kmY = fm.res * 111.32;
    const kmX = fm.res * 111.32 * Math.cos((lat * Math.PI) / 180);
    const r = 3 * sigmaKm;
    let sw = 0;
    let s = 0;
    for (let dy = -r; dy <= r; dy += kmY) {
      for (let dx = -r; dx <= r; dx += kmX) {
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaKm * sigmaKm));
        if (w < 0.01) continue;
        const d = this.fineAt(lng + dx / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + dy / 111.32);
        if (d === null) return null; // edge of loaded data: fall back to the 1 km grid
        s += w * d;
        sw += w;
      }
    }
    void kmY;
    return sw ? s / sw : 0;
  }

  localCoarse(lng: number, lat: number, sigmaKm: number): number {
    const { west, north, res, width, height } = this.meta;
    const kmY = res * 111.32;
    const kmX = res * 111.32 * Math.cos((lat * Math.PI) / 180);
    const cx = (lng - west) / res;
    const cy = (north - lat) / res;
    const r = 3 * sigmaKm;
    let sw = 0;
    let s = 0;
    for (let y = Math.floor(cy - r / kmY); y <= Math.floor(cy + r / kmY); y++) {
      for (let x = Math.floor(cx - r / kmX); x <= Math.floor(cx + r / kmX); x++) {
        const dx = (x + 0.5 - cx) * kmX;
        const dy = (y + 0.5 - cy) * kmY;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaKm * sigmaKm));
        const d = x < 0 || y < 0 || x >= width || y >= height ? 0 : this.decode(this.data[y * width + x]);
        s += w * d;
        sw += w;
      }
    }
    return sw ? s / sw : 0;
  }

  /** Mean density (bears/km²) and expected number of bears within `radiusKm`. */
  area(lng: number, lat: number, radiusKm: number): { density: number; bears: number; peak: number } {
    const { west, north, res, width, height } = this.meta;
    const kmY = res * 111.32;
    const kmX = res * 111.32 * Math.cos((lat * Math.PI) / 180);
    const cx = (lng - west) / res;
    const cy = (north - lat) / res;
    const rx = Math.ceil(radiusKm / kmX) + 1;
    const ry = Math.ceil(radiusKm / kmY) + 1;
    let sum = 0;
    let n = 0;
    let peak = 0;
    for (let y = Math.floor(cy) - ry; y <= Math.floor(cy) + ry; y++) {
      for (let x = Math.floor(cx) - rx; x <= Math.floor(cx) + rx; x++) {
        const dx = (x + 0.5 - cx) * kmX;
        const dy = (y + 0.5 - cy) * kmY;
        // Always include the cell you are in, even for radii smaller than a cell.
        const own = x === Math.floor(cx) && y === Math.floor(cy);
        if (!own && dx * dx + dy * dy > radiusKm * radiusKm) continue;
        const d = x < 0 || y < 0 || x >= width || y >= height ? 0 : this.decode(this.data[y * width + x]);
        sum += d;
        n++;
        if (d > peak) peak = d;
      }
    }
    const density = n ? sum / n : 0;
    return { density, bears: density * Math.PI * radiusKm * radiusKm, peak };
  }
}

let gridPromise: Promise<BearGrid> | null = null;

export function loadBearGrid(): Promise<BearGrid> {
  gridPromise ??= (async () => {
    const meta = await fetchJson<BearGridMeta>(`${BASE_URL}bears/density.json`, { timeoutMs: 20_000 });
    const res = await fetchSafe(`${BASE_URL}bears/density.bin`, { timeoutMs: 30_000 });
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length !== meta.width * meta.height) throw new Error('Bear grid size mismatch');
    const g = new BearGrid(meta, data);
    const fm = await fetchJson<FineMeta>(`${BASE_URL}bears/fine.json`, { timeoutMs: 15_000 }).catch(() => null);
    if (fm) g.setFineMeta(fm);
    return g;
  })().catch((e) => {
    gridPromise = null;
    throw e;
  });
  return gridPromise;
}

// ------------------------------------------------------------------ modifiers

/**
 * Relative bear activity by month in the Romanian Carpathians: denning
 * Dec–Mar (with more winter activity in recent years), spring emergence,
 * summer, then the autumn feeding peak (Aug–Oct) when most conflicts happen.
 */
const SEASON = [0.25, 0.3, 0.6, 0.9, 1.0, 1.0, 1.0, 1.1, 1.25, 1.25, 0.8, 0.35];

export function seasonFactor(d: Date): number {
  return SEASON[d.getMonth()];
}

/** Sun elevation in degrees (NOAA approximation, good to ~1°). */
export function sunElevation(d: Date, lng: number, lat: number): number {
  const rad = Math.PI / 180;
  const jd = d.getTime() / 86_400_000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = ((gmst * 15 + lng) * rad - ra) % (2 * Math.PI);
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha));
  return el / rad;
}

export type LightPhase = 'day' | 'twilight' | 'night';

export function lightPhase(d: Date, lng: number, lat: number): LightPhase {
  const el = sunElevation(d, lng, lat);
  return el > 6 ? 'day' : el > -6 ? 'twilight' : 'night';
}

/** Bears are most active at dawn and dusk; at night they also enter villages. */
const LIGHT: Record<LightPhase, number> = { day: 0.8, twilight: 1.5, night: 1.3 };

/** Quiet, fast travel (MTB) surprises bears most; engines warn them off. */
const MODE: Record<string, number> = { foot: 1.0, bike: 1.3, moto: 0.7 };

// ------------------------------------------------------------------ live sightings

export interface Sighting {
  lng: number;
  lat: number;
  /** Days since the sighting. */
  ageDays: number;
  /** True when the location is randomised within a 0.2° cell (iNaturalist geoprivacy). */
  obscured: boolean;
  /** Metres, when known. */
  accuracy?: number;
}

/** Chance that a sighting's true location lies within `radiusKm` of the user. */
export function chanceWithin(s: Sighting, lng: number, lat: number, radiusKm: number): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  if (!s.obscured) {
    const d = Math.hypot((s.lng - lng) * kx, (s.lat - lat) * 111.32);
    const acc = Math.max(0.05, (s.accuracy ?? 100) / 1000);
    // Soft edge over the location accuracy.
    return Math.max(0, Math.min(1, (radiusKm + acc - d) / (2 * acc)));
  }
  // Obscured: uniform over its 0.2° × 0.2° cell. Sample the cell on a grid.
  const c = 0.2;
  const x0 = Math.floor(s.lng / c) * c;
  const y0 = Math.floor(s.lat / c) * c;
  const N = 24;
  let hit = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const px = x0 + ((i + 0.5) / N) * c;
      const py = y0 + ((j + 0.5) / N) * c;
      if (Math.hypot((px - lng) * kx, (py - lat) * 111.32) <= radiusKm) hit++;
    }
  }
  // A small radius can fall between sample points: use the area ratio as a floor.
  const areaRatio = Math.min(1, (Math.PI * radiusKm * radiusKm) / (c * kx * c * 111.32));
  const inCell = lng >= x0 && lng < x0 + c && lat >= y0 && lat < y0 + c;
  return Math.max(hit / (N * N), inCell ? areaRatio : 0);
}

/** Expected number of recent sightings inside the radius, discounted by age (half-weight at ~10 days). */
export function recentSightings(list: Sighting[], lng: number, lat: number, radiusKm: number): number {
  let n = 0;
  for (const s of list) n += chanceWithin(s, lng, lat, radiusKm) * Math.exp(-s.ageDays / 14);
  return n;
}

const INAT = 'https://api.inaturalist.org/v1/observations';

/** Bear observations from the last 30 days within ~35 km (iNaturalist, CORS-enabled, no key). */
export async function fetchSightings(lng: number, lat: number, signal?: AbortSignal, now = new Date()): Promise<Sighting[]> {
  const d1 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    taxon_id: '41641', // Ursus arctos
    lat: String(lat),
    lng: String(lng),
    radius: '35',
    d1,
    captive: 'false',
    per_page: '200',
    order_by: 'observed_on',
  });
  type Obs = { location?: string; obscured?: boolean; positional_accuracy?: number | null; time_observed_at?: string | null; observed_on?: string | null };
  const r = await fetchJson<{ results: Obs[] }>(`${INAT}?${params}`, { signal, timeoutMs: 12_000, retries: 1 });
  const out: Sighting[] = [];
  for (const o of r.results) {
    if (!o.location) continue;
    const [la, lo] = o.location.split(',').map(Number);
    const t = Date.parse(o.time_observed_at ?? o.observed_on ?? '');
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !Number.isFinite(t)) continue;
    out.push({ lng: lo, lat: la, ageDays: Math.max(0, (now.getTime() - t) / 86_400_000), obscured: !!o.obscured, accuracy: o.positional_accuracy ?? undefined });
  }
  return out;
}

// ------------------------------------------------------------------ index

/**
 * Densities mapped to 1 and 100 (log scale): 1 bear per 500 km² … 3 bears per km².
 * Calibrated so Brașov county's average (~0.3/km², Europe's highest) reads "High",
 * and "Very high" is kept for real hotspots and dusk/autumn peaks there.
 */
const D_LOW = 0.002;
const D_HIGH = 3;

export function riskIndex(effectiveDensity: number): number {
  if (!(effectiveDensity > 0)) return 1;
  const t = (Math.log10(effectiveDensity) - Math.log10(D_LOW)) / (Math.log10(D_HIGH) - Math.log10(D_LOW));
  return Math.max(1, Math.min(100, Math.round(1 + 99 * t)));
}

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very-high';

export function riskLevel(index: number): RiskLevel {
  return index >= 70 ? 'very-high' : index >= 45 ? 'high' : index >= 20 ? 'moderate' : 'low';
}

export const RISK_LABEL: Record<RiskLevel, string> = { low: 'Low', moderate: 'Moderate', high: 'High', 'very-high': 'Very high' };

export interface RiskInput {
  lng: number;
  lat: number;
  when?: Date;
  mode?: string;
  sightings?: Sighting[];
  /** Fine-scale habitat multiplier for the 1 km reading (from map outlines), see habitatFactor. */
  localFactor?: number;
}

export interface RadiusRisk {
  index: number;
  level: RiskLevel;
  /** Bears per km² from the census-based grid (before season/time). */
  density: number;
  /** Expected bears living within the radius (census-based). */
  bears: number;
  /** Expected recent sightings within the radius. */
  recent: number;
}

export interface BearRisk {
  r10: RadiusRisk;
  r1: RadiusRisk;
  season: number;
  light: LightPhase;
  modeFactor: number;
  liveData: boolean;
}

export function assessBearRisk(grid: BearGrid, input: RiskInput): BearRisk {
  const when = input.when ?? new Date();
  const season = seasonFactor(when);
  const light = lightPhase(when, input.lng, input.lat);
  const modeFactor = MODE[input.mode ?? 'foot'] ?? 1;
  const base = season * LIGHT[light] * modeFactor;
  const at = (radiusKm: number): RadiusRisk => {
    const a = grid.area(input.lng, input.lat, radiusKm);
    // 1 km: the ~200 m layer weighted around you (map outlines refine it where that layer is missing).
    // 10 km: the surrounding area, nearer places weighing more.
    const fine = radiusKm <= 1 && grid.hasFine(input.lng, input.lat);
    const density = radiusKm <= 1 ? grid.local(input.lng, input.lat, 0.3) * (fine ? 1 : (input.localFactor ?? 1)) : grid.localCoarse(input.lng, input.lat, 3);
    const recent = input.sightings ? recentSightings(input.sightings, input.lng, input.lat, radiusKm) : 0;
    // A confirmed recent bear nearby raises the risk; capped so it can't dominate the census.
    const boost = Math.min(3, 1 + 0.6 * recent);
    // Time of day changes what's right around you, not how many bears live in the wider area.
    const index = riskIndex(density * (radiusKm <= 1 ? base : season * modeFactor) * boost);
    return { index, level: riskLevel(index), density, bears: a.bears, recent };
  };
  return { r10: at(10), r1: at(1), season, light, modeFactor, liveData: !!input.sightings };
}

export const BEAR_SAFETY_TIPS = [
  'Make noise on the trail, especially in dense forest, near streams and on blind bends.',
  'Avoid dawn, dusk and night in the forest — bears are most active then.',
  'Never approach or feed a bear, and never come between a mother and cubs.',
  'Keep food and rubbish sealed; don’t leave it at camp or near huts.',
  'If you meet a bear: stay calm, don’t run, speak firmly and back away slowly.',
  'Carry bear spray where allowed and know how to use it. In an emergency call 112.',
];

// ------------------------------------------------------------------ fine-scale habitat (metres, not km)

/** A polygon ring set in lng/lat ([outer, ...holes]). */
export type Poly = Array<Array<[number, number]>>;

function inRing(x: number, y: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPoly(x: number, y: number, p: Poly): boolean {
  if (!p.length || !inRing(x, y, p[0])) return false;
  for (let h = 1; h < p.length; h++) if (inRing(x, y, p[h])) return false;
  return true;
}

export interface HabitatSample {
  /** Share of forest within 500 m and within 1.5 km. */
  forestNear: number;
  forestWide: number;
  /** Share of built-up land / buildings within 300 m. */
  builtNear: number;
  /** Multiplier for the 1 km reading (1 = no change). */
  factor: number;
}

/**
 * Refines the ~1 km census grid with exact forest and built-up outlines from
 * the map tiles: bears live in and next to forest and rarely walk dense
 * streets. Sampled on a 100 m lattice out to 1.5 km.
 */
export function habitatFactor(lng: number, lat: number, forests: Poly[], built: Poly[]): HabitatSample {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const step = 0.1; // km
  const bbox = (p: Poly) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of p[0]) {
      if (x < a) a = x;
      if (y < b) b = y;
      if (x > c) c = x;
      if (y > d) d = y;
    }
    return [a, b, c, d] as const;
  };
  const fb = forests.map(bbox);
  const bb = built.map(bbox);
  const hit = (x: number, y: number, ps: Poly[], boxes: ReadonlyArray<readonly [number, number, number, number]>) => {
    for (let i = 0; i < ps.length; i++) {
      const b = boxes[i];
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (inPoly(x, y, ps[i])) return true;
    }
    return false;
  };
  let fN = 0, nN = 0, fW = 0, nW = 0, bN = 0, nB = 0;
  for (let dy = -1.5; dy <= 1.5001; dy += step) {
    for (let dx = -1.5; dx <= 1.5001; dx += step) {
      const r = Math.hypot(dx, dy);
      if (r > 1.5) continue;
      const x = lng + dx / kx;
      const y = lat + dy / 111.32;
      const f = hit(x, y, forests, fb) ? 1 : 0;
      fW += f;
      nW++;
      if (r <= 0.5) {
        fN += f;
        nN++;
      }
      if (r <= 0.3) {
        bN += hit(x, y, built, bb) ? 1 : 0;
        nB++;
      }
    }
  }
  const forestNear = nN ? fN / nN : 0;
  const forestWide = nW ? fW / nW : 0;
  const builtNear = nB ? bN / nB : 0;
  // More forest right here than in the wider area → higher; town around you → lower.
  let factor = Math.max(0.3, Math.min(2.2, (forestNear + 0.15) / (forestWide + 0.15)));
  factor *= 1 - 0.75 * Math.max(0, Math.min(1, (builtNear - 0.3) / 0.6));
  return { forestNear, forestWide, builtNear, factor: Math.max(0.15, factor) };
}

/** Fetches one ~200 m tile (bears/fine/{lon}_{lat}.bin). */
export async function loadFineTile(key: string): Promise<Uint8Array | null> {
  const res = await fetchSafe(`${BASE_URL}bears/fine/${key}.bin`, { timeoutMs: 30_000 });
  return new Uint8Array(await res.arrayBuffer());
}
