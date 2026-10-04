/**
 * Skeleton chains → routable Trail objects. Ends are snapped onto nearby OSM
 * nodes (sharing their ids) so detected trails join the routing graph.
 */
import { haversine } from '../geo/geodesy';
import { accessFor, surfaceClass } from '../trails/classify';
import type { OsmWay, Tags, Trail } from '../trails/types';
import { Grid, simplify } from './raster';

export interface VectorizeOptions {
  source: 'gps' | 'imagery';
  /** Drop lines shorter than this (metres). */
  minLength: number;
  /** Douglas–Peucker tolerance in metres. */
  simplifyM: number;
  /** Max distance to snap an end onto an OSM node. */
  snapM: number;
  /** Per-cell evidence (e.g. distinct GPS traces, model probability). */
  score: ArrayLike<number>;
  /** score → confidence 0..1 */
  confidence: (meanScore: number) => number;
  /** Extra tags, fixed or per chain (e.g. inferred usage from GPS speeds). */
  tags?: Tags | ((chain: number[]) => Tags);
}

let nextWayId = -1;
let nextNodeId = -1;

class NodeIndex {
  private b = new Map<string, Array<{ id: number; lng: number; lat: number }>>();
  private static C = 0.0005;
  constructor(ways: Iterable<OsmWay>) {
    for (const w of ways) {
      w.nodes.forEach((id, k) => {
        const { lon, lat } = w.geometry[k];
        const key = `${Math.floor(lon / NodeIndex.C)}:${Math.floor(lat / NodeIndex.C)}`;
        const list = this.b.get(key);
        const n = { id, lng: lon, lat };
        if (list) list.push(n);
        else this.b.set(key, [n]);
      });
    }
  }
  nearest(lng: number, lat: number, maxM: number) {
    const cx = Math.floor(lng / NodeIndex.C), cy = Math.floor(lat / NodeIndex.C);
    let best: { id: number; lng: number; lat: number } | null = null;
    let bestD = maxM;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const n of this.b.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const d = haversine(lng, lat, n.lng, n.lat);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    return best;
  }
}

export function chainsToTrails(g: Grid, chains: number[][], osmWays: Iterable<OsmWay>, o: VectorizeOptions): Trail[] {
  const index = new NodeIndex(osmWays);
  const junctionIds = new Map<number, number>();
  const out: Trail[] = [];

  for (const chain of chains) {
    // Cell chain → metric points for simplification, remembering the cell index.
    const pts = chain.map((i) => {
      const x = i % g.width;
      return [x, (i - x) / g.width] as [number, number];
    });
    const simple = simplify(pts, o.simplifyM / g.groundCell);
    const coords = simple.map(([x, y]) => g.toLngLat(x, y));
    let length = 0;
    for (let k = 1; k < coords.length; k++) length += haversine(...coords[k - 1], ...coords[k]);
    if (length < o.minLength) continue;

    const extra = typeof o.tags === 'function' ? o.tags(chain) : o.tags;
    const tags: Tags = { highway: 'path', source: o.source, ...extra };
    let sum = 0;
    for (const i of chain) sum += o.score[i];
    const confidence = Math.max(0, Math.min(1, o.confidence(sum / chain.length)));

    const nodeIds = coords.map(() => nextNodeId--);
    // Ends: snap to OSM, else share an id with other chains meeting at the same cell.
    // Last end first: unshifting at the start would shift the last index.
    for (const end of [coords.length - 1, 0]) {
      const cell = chain[end === 0 ? 0 : chain.length - 1];
      const snap = index.nearest(coords[end][0], coords[end][1], o.snapM);
      if (snap) {
        // Extend the line to the OSM node so the geometry visibly connects.
        if (end === 0) {
          coords.unshift([snap.lng, snap.lat]);
          nodeIds.unshift(snap.id);
        } else {
          coords.push([snap.lng, snap.lat]);
          nodeIds.push(snap.id);
        }
      } else {
        let id = junctionIds.get(cell);
        if (id === undefined) junctionIds.set(cell, (id = nodeIds[end]));
        nodeIds[end] = id;
      }
    }

    out.push({
      wayId: nextWayId--,
      nodeIds,
      coords,
      kind: 'detected',
      hiddenScore: 1,
      difficulty: 0,
      surfaceClass: surfaceClass(tags),
      trackGrade: 0,
      mtbScale: -1,
      access: { foot: accessFor(tags, 'foot'), bike: accessFor(tags, 'bike'), moto: accessFor(tags, 'moto') },
      routes: [],
      source: o.source,
      confidence,
      tags,
    });
  }
  return out;
}
