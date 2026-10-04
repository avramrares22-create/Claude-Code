/**
 * Decoder for the compact trail cells built by scripts/data/build_trail_cells.py
 * (see that file for the format). Produces the same OsmElement[] the Overpass
 * loader returns, so the rest of the engine doesn't care where data came from.
 */
import type { OsmElement, OsmWay, Tags } from './types';

export interface TrailCellV1 {
  v: 1;
  t: Tags[];
  w: Array<[number, number, number[], Array<[number, number]>]>;
  r: Array<[number, Tags, number[]]>;
  p: Array<[number, number, number, Tags]>;
}

/**
 * Ids for nodes that are not junctions only need to be unique and stable;
 * derive them from the way id so decoding is deterministic across cells.
 */
export const interiorNodeId = (wayId: number, k: number) => -(wayId * 4096 + k + 1);

export function decodeCell(cell: TrailCellV1): OsmElement[] {
  if (cell.v !== 1) throw new Error(`Unsupported trail cell version ${cell.v}`);
  const out: OsmElement[] = [];
  for (const [id, ti, coords, junctions] of cell.w) {
    const n = coords.length / 2;
    const geometry: OsmWay['geometry'] = new Array(n);
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) {
      x += coords[k * 2];
      y += coords[k * 2 + 1];
      geometry[k] = { lon: x / 1e6, lat: y / 1e6 };
    }
    const nodes = Array.from({ length: n }, (_, k) => interiorNodeId(id, k));
    for (const [k, nodeId] of junctions) nodes[k] = nodeId;
    out.push({ type: 'way', id, nodes, geometry, tags: cell.t[ti] });
  }
  for (const [id, tags, wayIds] of cell.r) {
    out.push({ type: 'relation', id, tags, members: wayIds.map((ref) => ({ type: 'way', ref, role: '' })) });
  }
  for (const [id, x, y, tags] of cell.p) out.push({ type: 'node', id, lon: x / 1e6, lat: y / 1e6, tags });
  return out;
}
