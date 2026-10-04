/**
 * Routable graph built from trails. Ways connect where they share OSM node ids,
 * which is how OSM encodes junctions.
 */
import { haversine } from '../geo/geodesy';
import type { ElevationProvider } from '../terrain/elevation';
import type { Trail } from '../trails/types';

export interface Edge {
  to: number;
  length: number;
  /** Index into graph.trails. */
  trail: number;
}

const CELL = 0.005; // ~400-550 m grid buckets for nearest-node lookup

export class TrailGraph {
  readonly lng: number[] = [];
  readonly lat: number[] = [];
  readonly adj: Edge[][] = [];
  elev: Float32Array = new Float32Array(0);
  readonly trails: Trail[];
  private index = new Map<number, number>();
  private buckets = new Map<string, number[]>();

  constructor(trails: Trail[]) {
    this.trails = trails;
    trails.forEach((t, ti) => {
      let prev = -1;
      for (let k = 0; k < t.nodeIds.length; k++) {
        const [lng, lat] = t.coords[k];
        const id = this.nodeIndex(t.nodeIds[k], lng, lat);
        if (prev >= 0 && prev !== id) {
          const len = haversine(this.lng[prev], this.lat[prev], lng, lat);
          this.adj[prev].push({ to: id, length: len, trail: ti });
          this.adj[id].push({ to: prev, length: len, trail: ti });
        }
        prev = id;
      }
    });
  }

  get size(): number {
    return this.lng.length;
  }

  private nodeIndex(osmId: number, lng: number, lat: number): number {
    let i = this.index.get(osmId);
    if (i === undefined) {
      i = this.lng.length;
      this.index.set(osmId, i);
      this.lng.push(lng);
      this.lat.push(lat);
      this.adj.push([]);
      const key = `${Math.floor(lng / CELL)}:${Math.floor(lat / CELL)}`;
      const b = this.buckets.get(key);
      if (b) b.push(i);
      else this.buckets.set(key, [i]);
    }
    return i;
  }

  /** Nearest node within maxDist metres (searches the surrounding buckets). */
  nearest(lng: number, lat: number, maxDist = 500): { node: number; dist: number } | null {
    const r = Math.ceil(maxDist / 400) + 1;
    const cx = Math.floor(lng / CELL);
    const cy = Math.floor(lat / CELL);
    let best = -1;
    let bestD = maxDist;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (const i of this.buckets.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (this.adj[i].length === 0) continue;
          const d = haversine(lng, lat, this.lng[i], this.lat[i]);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best >= 0 ? { node: best, dist: bestD } : null;
  }

  bbox(): [number, number, number, number] {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (let i = 0; i < this.size; i++) {
      w = Math.min(w, this.lng[i]);
      e = Math.max(e, this.lng[i]);
      s = Math.min(s, this.lat[i]);
      n = Math.max(n, this.lat[i]);
    }
    return [w, s, e, n];
  }

  /** Samples elevation for every node (call after provider.prepare). Unknown -> NaN. */
  attachElevation(provider: ElevationProvider) {
    this.elev = new Float32Array(this.size);
    for (let i = 0; i < this.size; i++) this.elev[i] = provider.get(this.lng[i], this.lat[i]) ?? NaN;
  }
}
