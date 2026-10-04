/**
 * Elevation profile for a route: an SVG area chart you can scrub with a finger;
 * the callback receives the matching point on the route (for a map marker).
 */
import { haversine } from '../engine/geo/geodesy';

export interface ProfileData {
  dist: number[];
  elev: number[];
  coords: Array<[number, number]>;
}

export function profileData(coords: Array<[number, number]>, elevations: number[]): ProfileData | null {
  const dist = [0];
  for (let i = 1; i < coords.length; i++) dist.push(dist[i - 1] + haversine(...coords[i - 1], ...coords[i]));
  const ok = elevations.filter(Number.isFinite);
  if (ok.length < 2 || dist[dist.length - 1] < 50) return null;
  // Fill gaps (missing DEM tiles) with the nearest known value.
  let last = ok[0];
  const elev = elevations.map((e) => (Number.isFinite(e) ? (last = e) : last));
  return { dist, elev, coords };
}

const W = 320;
const H = 96;
const PAD = 4;

export function renderProfile(host: HTMLElement, d: ProfileData, onScrub: (p: [number, number] | null, label: string) => void) {
  const total = d.dist[d.dist.length - 1];
  const lo = Math.min(...d.elev), hi = Math.max(...d.elev);
  const span = Math.max(30, hi - lo);
  const x = (m: number) => PAD + (m / total) * (W - 2 * PAD);
  const y = (e: number) => PAD + (1 - (e - lo) / span) * (H - 2 * PAD - 14);
  // Downsample to ~200 points for a light DOM.
  const step = Math.max(1, Math.floor(d.dist.length / 200));
  const pts: string[] = [];
  for (let i = 0; i < d.dist.length; i += step) pts.push(`${x(d.dist[i]).toFixed(1)},${y(d.elev[i]).toFixed(1)}`);
  pts.push(`${x(total).toFixed(1)},${y(d.elev[d.elev.length - 1]).toFixed(1)}`);
  const line = pts.join(' ');
  const base = H - 14;
  host.innerHTML = `
    <svg class="profile" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Elevation profile">
      <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="${x(0)},${base} ${line} ${x(total)},${base}" fill="url(#pf)"/>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <line class="cursor" x1="0" x2="0" y1="0" y2="${base}" stroke="var(--text)" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"/>
    </svg>
    <div class="profile-axis"><span>${Math.round(lo)} m</span><span class="profile-read"></span><span>${Math.round(hi)} m</span></div>`;
  const svgEl = host.querySelector('svg')!;
  const cursor = host.querySelector<SVGLineElement>('.cursor')!;
  const read = host.querySelector<HTMLElement>('.profile-read')!;
  const scrub = (clientX: number) => {
    const r = svgEl.getBoundingClientRect();
    const m = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * total;
    let i = 0;
    while (i < d.dist.length - 1 && d.dist[i + 1] < m) i++;
    const cx = x(d.dist[i]);
    cursor.setAttribute('x1', String(cx));
    cursor.setAttribute('x2', String(cx));
    cursor.setAttribute('opacity', '0.8');
    const label = `${(d.dist[i] / 1000).toFixed(1)} km · ${Math.round(d.elev[i])} m`;
    read.textContent = label;
    onScrub(d.coords[i], label);
  };
  const stop = () => {
    cursor.setAttribute('opacity', '0');
    read.textContent = '';
    onScrub(null, '');
  };
  svgEl.addEventListener('pointerdown', (e) => {
    svgEl.setPointerCapture(e.pointerId);
    scrub(e.clientX);
  });
  svgEl.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pointerType === 'mouse') scrub(e.clientX);
  });
  svgEl.addEventListener('pointerup', stop);
  svgEl.addEventListener('pointerleave', stop);
}
