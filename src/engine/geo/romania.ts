/** Rough outline of Romania (lng, lat), used to skip pre-rendering tiles abroad. */
export const ROMANIA_OUTLINE: Array<[number, number]> = [
  [22.15, 47.95], [22.9, 48.05], [24.0, 47.95], [24.9, 47.75], [26.6, 48.25], [27.4, 48.4],
  [28.2, 47.9], [28.1, 46.8], [28.2, 45.9], [28.6, 45.3], [29.7, 45.25], [29.55, 44.8],
  [28.6, 44.2], [28.55, 43.75], [27.7, 43.75], [27.0, 44.1], [25.4, 43.65], [24.2, 43.7],
  [22.9, 43.85], [22.4, 44.5], [21.4, 44.75], [21.35, 45.2], [20.3, 46.1], [21.2, 46.4],
  [21.6, 47.0], [22.0, 47.4], [22.15, 47.95],
];

export function insideRomania(lng: number, lat: number): boolean {
  let hit = false;
  const p = ROMANIA_OUTLINE;
  for (let i = 1; i < p.length; i++) {
    const [x1, y1] = p[i - 1], [x2, y2] = p[i];
    if (y1 > lat !== y2 > lat && lng < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
  }
  return hit;
}

/** True if any part of the bbox (sampled on a grid, incl. a margin) is in Romania. */
export function bboxTouchesRomania([w, s, e, n]: [number, number, number, number], margin = 0.08): boolean {
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const lng = w - margin + ((e - w + 2 * margin) * i) / 4;
      const lat = s - margin + ((n - s + 2 * margin) * j) / 4;
      if (insideRomania(lng, lat)) return true;
    }
  return false;
}
