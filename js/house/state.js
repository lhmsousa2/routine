// House part of the saved state: defaults and validation. Pure, no DOM.
import { ITEMS, ROOMS } from './catalog.js';

export function newHouse(makeId) {
  return {
    rooms: ['bedroom'],
    tiles: [{ x: 0, z: 0, room: 'bedroom' }],
    // Starter sleeping bag, placed on the first tile.
    items: [{ uid: makeId(), itemId: 'bed-starter', placed: true, x: 0, z: 0, rot: 0 }],
  };
}

const isInt = (v) => Number.isInteger(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SIDES = ['n', 'e', 's', 'w'];

// Repair house data instead of rejecting the whole save (protects goals/coins if the catalogue changes):
// unknown items are dropped, unknown rooms become bedroom, and items with bad positions go to Storage.
export function sanitizeHouse(h) {
  if (!isObj(h) || !Array.isArray(h.rooms) || !Array.isArray(h.tiles) || !Array.isArray(h.items)) return h;
  h.rooms = h.rooms.filter((r) => typeof r === 'string' && ROOMS[r]);
  if (!h.rooms.includes('bedroom')) h.rooms.unshift('bedroom');
  for (const t of h.tiles) if (isObj(t) && !h.rooms.includes(t.room)) t.room = 'bedroom';
  h.items = h.items.filter((it) => isObj(it) && ITEMS[it.itemId]);
  for (const it of h.items) {
    if (it.placed && !placementShapeOk(it)) {
      it.placed = false;
      for (const k of ['x', 'z', 'rot', 'side']) delete it[k];
    }
  }
  return h;
}

const OPENING_KINDS = ['window', 'door', 'frontdoor'];
function placementShapeOk(it) {
  if (!isInt(it.x) || !isInt(it.z)) return false;
  return OPENING_KINDS.includes(ITEMS[it.itemId].kind)
    ? SIDES.includes(it.side) && it.rot === undefined
    : isInt(it.rot) && it.rot >= 0 && it.rot <= 3 && it.side === undefined;
}

export function validateHouse(h) {
  if (!isObj(h) || !Array.isArray(h.rooms) || !Array.isArray(h.tiles) || !Array.isArray(h.items)) return false;
  if (!h.rooms.every((r) => typeof r === 'string' && ROOMS[r])) return false;
  const seen = new Set();
  for (const t of h.tiles) {
    if (!isObj(t) || !isInt(t.x) || !isInt(t.z) || !h.rooms.includes(t.room)) return false;
    const k = `${t.x},${t.z}`;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  const uids = new Set();
  for (const it of h.items) {
    if (!isObj(it) || typeof it.uid !== 'string' || uids.has(it.uid) || !ITEMS[it.itemId] || typeof it.placed !== 'boolean') return false;
    uids.add(it.uid);
    if (it.placed && !placementShapeOk(it)) return false;
  }
  return true;
}
