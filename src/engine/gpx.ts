/** GPX 1.1 import/export (tracks, routes, waypoints). Pure: works in workers and tests. */

export interface GpxPoint {
  lng: number;
  lat: number;
  ele?: number;
  /** ms since epoch */
  time?: number;
}

export interface GpxData {
  name?: string;
  /** Each track segment / route as a line. */
  lines: GpxPoint[][];
  waypoints: Array<GpxPoint & { name?: string }>;
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number.parseFloat(s));
const unescape = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag)?.[1];
}

function points(xml: string, el: 'trkpt' | 'rtept' | 'wpt'): Array<GpxPoint & { name?: string }> {
  const out: Array<GpxPoint & { name?: string }> = [];
  const re = new RegExp(`<${el}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${el}>)`, 'g');
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const lat = num(attr(m[1], 'lat'));
    const lng = num(attr(m[1], 'lon'));
    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const body = m[2] ?? '';
    const ele = num(/<ele>([^<]+)<\/ele>/.exec(body)?.[1]);
    const t = /<time>([^<]+)<\/time>/.exec(body)?.[1];
    const name = /<name>([\s\S]*?)<\/name>/.exec(body)?.[1];
    out.push({ lat, lng, ele: Number.isFinite(ele) ? ele : undefined, time: t ? Date.parse(t) : undefined, name: name ? unescape(name.trim()) : undefined });
  }
  return out;
}

export function parseGpxFile(xml: string): GpxData {
  if (!/<gpx[\s>]/.test(xml)) throw new Error('Not a GPX file');
  const lines: GpxPoint[][] = [];
  for (const seg of xml.match(/<trkseg\b[\s\S]*?<\/trkseg>/g) ?? []) {
    const pts = points(seg, 'trkpt');
    if (pts.length > 1) lines.push(pts.map(({ name: _n, ...p }) => p));
  }
  for (const rte of xml.match(/<rte\b[\s\S]*?<\/rte>/g) ?? []) {
    const pts = points(rte, 'rtept');
    if (pts.length > 1) lines.push(pts.map(({ name: _n, ...p }) => p));
  }
  // Waypoints live outside tracks/routes.
  const outside = xml.replace(/<trk\b[\s\S]*?<\/trk>/g, '').replace(/<rte\b[\s\S]*?<\/rte>/g, '');
  const name = /<(?:metadata|trk)\b[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(xml)?.[1];
  return { name: name ? unescape(name.trim()) : undefined, lines, waypoints: points(outside, 'wpt') };
}

export function buildGpx(name: string, line: GpxPoint[], creator = 'Natura'): string {
  const pts = line
    .map((p) => {
      const ele = p.ele !== undefined && Number.isFinite(p.ele) ? `<ele>${p.ele.toFixed(1)}</ele>` : '';
      const time = p.time ? `<time>${new Date(p.time).toISOString()}</time>` : '';
      return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}">${ele}${time}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${esc(creator)}" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><time>${new Date().toISOString()}</time></metadata>
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
