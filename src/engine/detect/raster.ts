/**
 * Raster toolkit shared by the trail detectors (GPS traces, imagery model):
 * a metric grid over a bbox, line rasterisation, morphology, Zhang–Suen
 * thinning and skeleton → polyline tracing.
 *
 * Pure and allocation-light so it runs in a worker or in Node tests.
 */
import type { BBox } from '../config';
import { EARTH_RADIUS } from '../geo/mercator';

const DEG = Math.PI / 180;

/** Grid in Web Mercator metres; `cell` is the ground size of one cell at the bbox centre. */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly x0: number;
  readonly y1: number;
  /** Cell size in Mercator metres. */
  readonly step: number;
  readonly groundCell: number;

  constructor(
    readonly bbox: BBox,
    groundCell: number,
  ) {
    const lat = (bbox[1] + bbox[3]) / 2;
    this.groundCell = groundCell;
    this.step = groundCell / Math.cos(lat * DEG);
    this.x0 = mercX(bbox[0]);
    this.y1 = mercY(bbox[3]);
    this.width = Math.ceil((mercX(bbox[2]) - this.x0) / this.step);
    this.height = Math.ceil((this.y1 - mercY(bbox[1])) / this.step);
  }

  get size() {
    return this.width * this.height;
  }

  /** Fractional cell coordinates of a lng/lat. */
  toCell(lng: number, lat: number): [number, number] {
    return [(mercX(lng) - this.x0) / this.step, (this.y1 - mercY(lat)) / this.step];
  }

  /** lng/lat of a cell centre. */
  toLngLat(cx: number, cy: number): [number, number] {
    const x = this.x0 + (cx + 0.5) * this.step;
    const y = this.y1 - (cy + 0.5) * this.step;
    return [(x / EARTH_RADIUS) / DEG, (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / DEG];
  }
}

export const mercX = (lng: number) => EARTH_RADIUS * lng * DEG;
export const mercY = (lat: number) => EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));

/** Disc offsets for a radius in cells (precomputed per radius). */
function disc(r: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) if (dx * dx + dy * dy <= r * r + 0.25) out.push([dx, dy]);
  return out;
}

/**
 * Walks the segment a→b in ~half-cell steps and calls `visit` for every cell in a
 * disc of `radius` cells around each step (cells may repeat; callers dedupe).
 */
export function forEachCellOnLine(
  g: Grid,
  a: [number, number],
  b: [number, number],
  radius: number,
  visit: (idx: number) => void,
) {
  const offs = disc(radius);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(len * 2));
  for (let i = 0; i <= n; i++) {
    const cx = Math.floor(a[0] + ((b[0] - a[0]) * i) / n);
    const cy = Math.floor(a[1] + ((b[1] - a[1]) * i) / n);
    for (const [dx, dy] of offs) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && y >= 0 && x < g.width && y < g.height) visit(y * g.width + x);
    }
  }
}

/** Marks every cell within `radiusM` metres of the given lines. */
export function rasterizeLines(g: Grid, lines: Iterable<Array<[number, number]>>, radiusM: number): Uint8Array {
  const out = new Uint8Array(g.size);
  const r = radiusM / g.groundCell;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      forEachCellOnLine(g, g.toCell(...line[i - 1]), g.toCell(...line[i]), r, (idx) => (out[idx] = 1));
    }
  }
  return out;
}

export function dilate(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i] || (x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || (y < h - 1 && m[i + w])) out[i] = 1;
    }
  }
  return out;
}

export function erode(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) out[i] = 1;
    }
  }
  return out;
}

/** Removes 8-connected components smaller than minCells. */
export function removeSmall(m: Uint8Array, w: number, h: number, minCells: number): Uint8Array {
  const out = new Uint8Array(m.length);
  const seen = new Uint8Array(m.length);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    stack.push(s);
    seen[s] = 1;
    comp.length = 0;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (m[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (comp.length >= minCells) for (const i of comp) out[i] = 1;
  }
  return out;
}

/** Zhang–Suen thinning to a 1-cell-wide, 8-connected skeleton (in place copy). */
export function skeletonize(src: Uint8Array, w: number, h: number): Uint8Array {
  const m = src.slice();
  const del: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1];
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            +(!p2 && p3) + +(!p3 && p4) + +(!p4 && p5) + +(!p5 && p6) +
            +(!p6 && p7) + +(!p7 && p8) + +(!p8 && p9) + +(!p9 && p2);
          if (a !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          del.push(i);
        }
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

const N8: Array<[number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * Splits a skeleton into polylines of cell indices. Lines break at junctions
 * (≥3 neighbours) and endpoints, so each returned chain is a simple path.
 */
export function traceSkeleton(sk: Uint8Array, w: number, h: number): number[][] {
  const deg = new Uint8Array(sk.length);
  const nbrs = (i: number): number[] => {
    const x = i % w, y = (i - x) / w;
    const out: number[] = [];
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) out.push(ny * w + nx);
    }
    return out;
  };
  for (let i = 0; i < sk.length; i++) if (sk[i]) deg[i] = nbrs(i).length;
  const visitedEdge = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const chains: number[][] = [];
  const isNode = (i: number) => deg[i] !== 2;

  const walk = (start: number, next: number) => {
    const chain = [start, next];
    visitedEdge.add(key(start, next));
    let prev = start, cur = next;
    while (!isNode(cur)) {
      const n = nbrs(cur).find((j) => j !== prev && !visitedEdge.has(key(cur, j)));
      if (n === undefined) break;
      visitedEdge.add(key(cur, n));
      chain.push(n);
      prev = cur;
      cur = n;
    }
    chains.push(chain);
  };

  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || !isNode(i)) continue;
    for (const n of nbrs(i)) if (!visitedEdge.has(key(i, n))) walk(i, n);
  }
  // Pure loops (every cell degree 2) have no node to start from.
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i] || deg[i] !== 2) continue;
    for (const n of nbrs(i)) if (!visitedEdge.has(key(i, n))) walk(i, n);
  }
  return chains;
}

/** Douglas–Peucker on planar points. */
export function simplify(pts: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
