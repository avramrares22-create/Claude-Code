/** RouteNet data regions: [west, south] corners of 0.04° boxes. */
// Popular outdoor areas (hiking, MTB, enduro) — where public traces exist.
export const ROUTE_REGIONS: Record<string, [number, number]> = {
  bucegi: [25.44, 45.39], piatra_craiului: [25.22, 45.52], postavarul: [25.55, 45.57], ciucas: [25.92, 45.5],
  baiului: [25.62, 45.38], rodna: [24.78, 47.57], gutai: [23.82, 47.7], maramures: [24.35, 47.73],
  ceahlau: [25.95, 46.95], rarau: [25.58, 47.45], hasmas: [25.82, 46.68], suhard: [25.3, 47.38],
  calimani: [25.2, 47.1], padis: [22.7, 46.6], vladeasa: [22.8, 46.75], bihor: [22.65, 46.48],
  trascau: [23.55, 46.3], retezat: [22.86, 45.37], parang: [23.53, 45.36], cozia: [24.33, 45.31],
  semenic: [22.05, 45.17], mehedinti: [22.62, 44.98], cindrel: [23.85, 45.58], macin: [28.25, 45.2],
  brasov_hills: [25.6, 45.62], sinaia: [25.53, 45.34], busteni: [25.52, 45.41], sibiu_hills: [24.1, 45.75],
  cluj_hills: [23.55, 46.73], iasi_hills: [27.55, 47.1],
  // v2: more trailheads and MTB / enduro areas
  balea: [24.6, 45.58], piatra_mare: [25.65, 45.53], scarisoara: [22.8, 46.47], cheile_turzii: [23.66, 46.55],
  paltinis: [23.92, 45.64], herculane: [22.4, 44.87], azuga: [25.55, 45.44], padina: [25.42, 45.34],
  muntele_mic: [22.46, 45.36], straja: [23.2, 45.3], vatra_dornei: [25.34, 47.33], durau: [26.0, 46.98],
  lacu_rosu: [25.78, 46.77], sovata: [25.06, 46.58], harghita_bai: [25.59, 46.42], tusnad: [25.84, 46.12],
  arieseni: [22.73, 46.46], magura: [25.26, 45.47], rucar: [25.16, 45.39], siriu: [26.24, 45.47],
  voineasa: [23.94, 45.39], ranca: [23.67, 45.28], polovragi: [23.79, 45.16], covasna: [26.17, 45.84],
  comandau: [26.26, 45.75], bran: [25.36, 45.5], rasnov: [25.45, 45.57], sadu: [24.15, 45.62],
  cisnadioara: [24.08, 45.7], baia_sprie: [23.7, 47.65],
  // Brașov focus: the user's home area — dense coverage of local trails and MTB spots.
  // bv_tampa was collected with SIZE=0.025: a 0.04° box reaches the old town and exceeds the OSM API node limit.
  bv_tampa: [25.588, 45.622], bv_racadau: [25.62, 45.6], bv_dambu_morii: [25.7, 45.56], bv_bunloc: [25.72, 45.58],
  bv_sacele: [25.68, 45.61], bv_predeal: [25.57, 45.49], bv_clabucet: [25.6, 45.46], bv_cristian: [25.48, 45.62],
  bv_ghimbav: [25.5, 45.66], bv_vulcan: [25.4, 45.63], bv_holbav: [25.37, 45.66], bv_codlea: [25.43, 45.7],
  bv_zarnesti: [25.3, 45.56], bv_harman: [25.68, 45.71], bv_prejmer: [25.78, 45.72], bv_teliu: [25.85, 45.7],
  bv_tarlungeni: [25.8, 45.63], bv_ciucas_n: [25.92, 45.55], bv_persani: [25.2, 45.78], bv_sinca: [25.15, 45.7],
  bv_feldioara: [25.58, 45.82], bv_timis: [25.6, 45.53], bv_pietrele_lui_solomon: [25.55, 45.6],
  bv_poiana_n: [25.52, 45.6], bv_magura_codlea: [25.45, 45.72],
};

/** Home area: regions within BRASOV_RADIUS_KM get extra training weight and their own evaluation. */
export const BRASOV: [number, number] = [25.6, 45.65];
export const BRASOV_RADIUS_KM = 40;
