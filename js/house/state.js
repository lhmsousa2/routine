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
    if (it.placed) {
      if (!isInt(it.x) || !isInt(it.z)) return false;
      if (it.side != null ? !SIDES.includes(it.side) : !(isInt(it.rot) && it.rot >= 0 && it.rot <= 3)) return false;
    }
  }
  return true;
}
