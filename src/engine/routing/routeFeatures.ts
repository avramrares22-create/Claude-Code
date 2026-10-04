/**
 * Feature vector for RouteNet. Shared by the training script and the app so
 * both see exactly the same inputs.
 */
import type { SurfaceClass, Trail } from '../trails/types';

const SURFACES: SurfaceClass[] = ['paved', 'gravel', 'dirt', 'grass', 'rock', 'unknown'];

export function wayClass(hw: string | undefined): 'path' | 'track' | 'road' | 'cycleway' | 'steps' {
  if (hw === 'track') return 'track';
  if (hw === 'cycleway') return 'cycleway';
  if (hw === 'steps' || hw === 'via_ferrata') return 'steps';
  if (hw === 'path' || hw === 'footway' || hw === 'bridleway') return 'path';
  return 'road';
}
const CLASSES = ['path', 'track', 'road', 'cycleway', 'steps'] as const;

export const FEATURE_NAMES = [
  ...CLASSES.map((c) => `class:${c}`),
  ...SURFACES.map((s) => `surface:${s}`),
  'grade',
  'grade_known',
  'sac',
  'mtb',
  'mtb_known',
  'marked',
  'slope',
  'slope_sq',
  'uphill',
  'downhill',
] as const;

export const N_FEATURES = FEATURE_NAMES.length;

export function routeFeatures(t: Trail, slope: number, out = new Float64Array(N_FEATURES)): Float64Array {
  out.fill(0);
  let k = 0;
  const cls = wayClass(t.tags.highway);
  for (const c of CLASSES) out[k++] = cls === c ? 1 : 0;
  for (const s of SURFACES) out[k++] = t.surfaceClass === s ? 1 : 0;
  out[k++] = t.trackGrade / 5;
  out[k++] = t.trackGrade ? 1 : 0;
  out[k++] = t.difficulty / 6;
  out[k++] = t.mtbScale >= 0 ? (t.mtbScale + 1) / 7 : 0;
  out[k++] = t.mtbScale >= 0 ? 1 : 0;
  out[k++] = t.kind === 'marked' ? 1 : 0;
  const s = Math.max(-0.5, Math.min(0.5, slope));
  out[k++] = s * 4;
  out[k++] = s * s * 16;
  out[k++] = Math.max(0, s) * 4;
  out[k++] = Math.max(0, -s) * 4;
  return out;
}
