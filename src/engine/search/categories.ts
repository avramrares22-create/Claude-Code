/**
 * Search categories (same order as scripts/data/build_gazetteer.py CATS) and
 * the words people use for them in Romanian and English. The words seed
 * QueryNet's training data and give the UI its labels.
 */
export const CATS = [
  'city', 'town', 'village', 'district', 'peak', 'saddle', 'ridge', 'lake', 'river', 'waterfall',
  'spring', 'cave', 'gorge', 'valley', 'forest', 'meadow', 'hut', 'camp', 'lodging', 'viewpoint',
  'attraction', 'castle', 'monument', 'church', 'park', 'ski', 'food', 'station', 'parking',
  'shop', 'health', 'sport', 'trail', 'path', 'street', 'other',
] as const;
export type Cat = (typeof CATS)[number];
export const CAT_INDEX = Object.fromEntries(CATS.map((c, i) => [c, i])) as Record<Cat, number>;

export const CAT_LABEL: Record<Cat, string> = {
  city: 'City', town: 'Town', village: 'Village', district: 'District', peak: 'Peak', saddle: 'Saddle / pass',
  ridge: 'Ridge', lake: 'Lake', river: 'River', waterfall: 'Waterfall', spring: 'Spring', cave: 'Cave',
  gorge: 'Gorge', valley: 'Valley', forest: 'Forest', meadow: 'Meadow', hut: 'Mountain hut', camp: 'Campsite',
  lodging: 'Accommodation', viewpoint: 'Viewpoint', attraction: 'Attraction', castle: 'Castle / fortress',
  monument: 'Monument', church: 'Church / monastery', park: 'Park / reserve', ski: 'Ski area', food: 'Food & drink',
  station: 'Station', parking: 'Parking', shop: 'Shop', health: 'Health', sport: 'Sport', trail: 'Hiking trail',
  path: 'Path / track', street: 'Street', other: 'Place',
};

/**
 * Cue words for each category (folded, base form). Several categories can share
 * a word ("cetate" is both castle and ruin; "drum" is street and path).
 */
export const CUES: Partial<Record<Cat, string[]>> = {
  city: ['oras', 'orasul', 'municipiu', 'city', 'town centre', 'centru', 'centrul'],
  town: ['oras', 'town', 'statiune'],
  village: ['sat', 'satul', 'comuna', 'village', 'localitate', 'villages'],
  district: ['cartier', 'cartierul', 'district', 'neighbourhood', 'neighborhood', 'zona'],
  peak: ['varf', 'varful', 'vf', 'peak', 'summit', 'pisc', 'munte', 'mount', 'top', 'deal', 'peaks', 'mountains'],
  saddle: ['sa', 'saua', 'pas', 'pasul', 'pass', 'col', 'trecatoare'],
  ridge: ['creasta', 'ridge', 'culme', 'culmea', 'abrupt', 'perete', 'stanca', 'colt', 'cliff', 'rock'],
  lake: ['lac', 'lacul', 'lake', 'tau', 'iezer', 'balta', 'baraj', 'reservoir', 'tarn', 'pond', 'lakes'],
  river: ['rau', 'raul', 'parau', 'paraul', 'river', 'stream', 'creek', 'rivers'],
  waterfall: ['cascada', 'waterfall', 'falls', 'cascade', 'saritoare', 'waterfalls'],
  spring: ['izvor', 'izvorul', 'spring', 'fantana', 'apa', 'water', 'cismea', 'springs'],
  cave: ['pestera', 'cave', 'aven', 'grota', 'cavern', 'caves'],
  gorge: ['chei', 'cheile', 'canion', 'canionul', 'gorge', 'canyon', 'defileu', 'gorges', 'canyons'],
  valley: ['vale', 'valea', 'valley'],
  forest: ['padure', 'padurea', 'forest', 'woods', 'codru'],
  meadow: ['poiana', 'meadow', 'pajiste', 'livada'],
  hut: ['cabana', 'refugiu', 'refugiul', 'hut', 'shelter', 'adapost', 'stana', 'cottage', 'huts', 'refuges', 'chalets'],
  camp: ['camping', 'campare', 'camp', 'campsite', 'cort', 'tent', 'campsites'],
  lodging: ['hotel', 'pensiune', 'pensiunea', 'hostel', 'motel', 'vila', 'cazare', 'accommodation', 'sleep', 'dormit', 'hotels', 'guesthouses'],
  viewpoint: ['belvedere', 'viewpoint', 'view', 'panorama', 'priveliste', 'lookout', 'viewpoints'],
  attraction: ['muzeu', 'museum', 'zoo', 'atractie', 'attraction', 'obiectiv', 'turistic'],
  castle: ['castel', 'castelul', 'cetate', 'cetatea', 'citadel', 'fortress', 'castle', 'bastion', 'turn', 'fortareata', 'fort', 'castles', 'fortresses'],
  monument: ['monument', 'ruine', 'ruina', 'memorial', 'statuie', 'ruins'],
  church: ['biserica', 'manastire', 'schit', 'catedrala', 'church', 'monastery', 'cathedral', 'templu', 'churches', 'monasteries'],
  park: ['parc', 'parcul', 'park', 'rezervatie', 'reserve', 'gradina', 'garden', 'national park', 'parks'],
  ski: ['partie', 'ski', 'schi', 'telecabina', 'telegondola', 'telescaun', 'teleschi', 'gondola', 'cable car', 'slope', 'slopes'],
  food: ['restaurant', 'cafenea', 'cafe', 'pizza', 'mancare', 'food', 'bar', 'pub', 'terasa', 'eat', 'coffee', 'restaurants', 'cafes'],
  station: ['gara', 'station', 'autogara', 'statie', 'train', 'tren', 'bus'],
  parking: ['parcare', 'parking', 'car park'],
  shop: ['magazin', 'supermarket', 'mall', 'shop', 'store', 'market'],
  health: ['spital', 'farmacie', 'hospital', 'pharmacy', 'salvamont', 'clinica', 'urgenta'],
  sport: ['stadion', 'piscina', 'bazin', 'pool', 'patinoar', 'sala', 'stadium', 'swim', 'inot', 'climbing', 'catarare'],
  trail: ['traseu', 'traseul', 'trail', 'poteca', 'marcaj', 'hike', 'hiking', 'drumetie', 'route', 'banda', 'cruce', 'punct', 'triunghi', 'trails', 'hikes'],
  path: ['poteca', 'drum', 'drumul', 'path', 'track', 'forestier', 'trail'],
  street: ['strada', 'str', 'bulevard', 'bulevardul', 'bd', 'calea', 'aleea', 'soseaua', 'piata', 'street', 'avenue', 'road'],
};

/** Prepositions that introduce a place the user means "near" ("lacuri lângă Brașov"). */
export const NEAR_WORDS = ['langa', 'aproape', 'near', 'around', 'by', 'la', 'in', 'din', 'from', 'linga', 'zona', 'spre'];
/** Words meaning "near me / here". */
export const ME_WORDS = ['mine', 'me', 'nearby', 'aici', 'here', 'apropiere', 'aproape'];
