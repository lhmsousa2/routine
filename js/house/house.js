// House game rules: pure logic on the saved state (no DOM, no 3D). Unit-tested.
//
// Coordinates:
// - Floor tiles are 1 m² at integer (x, z).
// - Furniture snaps to placement cells of 0.5 m: tile (x, z) contains cells (2x..2x+1, 2z..2z+1).
// - Wall openings (doors/windows) sit on a tile side: { x, z, side: 'n'|'e'|'s'|'w' }.
import { ITEMS, ROOMS, TILE, tilePrice, SELL_RATE, footprint, height, TIER_ORDER } from './catalog.js';
import { balance, dateStr, makeId } from '../engine.js';

const OPENINGS = ['window', 'door', 'frontdoor'];
export const isOpening = (item) => OPENINGS.includes(item.kind);
const SIDE_DIR = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
// Direction an item's back faces for each rotation (0 = back to the north).
const BACK = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_SIDE = { '0,-1': 'n', '1,0': 'e', '0,1': 's', '-1,0': 'w' };

const tileOfCell = (c) => Math.floor(c / TILE);
const key = (x, z) => `${x},${z}`;

// ---------- floor ----------

function tileMap(house) {
  return new Map(house.tiles.map((t) => [key(t.x, t.z), t]));
}

export function tilesOwned(state) {
  return state.house.tiles.length;
}

export function nextTilePrice(state) {
  return tilePrice(tilesOwned(state));
}

// Empty tiles touching the house (where a new tile can be bought).
export function candidateTiles(state) {
  const map = tileMap(state.house);
  const out = new Map();
  for (const t of state.house.tiles)
    for (const [dx, dz] of Object.values(SIDE_DIR)) {
      const k = key(t.x + dx, t.z + dz);
      if (!map.has(k)) out.set(k, { x: t.x + dx, z: t.z + dz });
    }
  return [...out.values()];
}

// A wall stands on this tile side if the neighbour is empty (outside) or a different room.
export function wallType(house, x, z, side, map = tileMap(house)) {
  const t = map.get(key(x, z));
  if (!t) return null;
  const [dx, dz] = SIDE_DIR[side];
  const n = map.get(key(x + dx, z + dz));
  if (!n) return 'exterior';
  return n.room !== t.room ? 'interior' : null;
}

// Canonical id for the edge between two tiles, so both sides of an inner wall match.
export function edgeId(x, z, side) {
  if (side === 's') return edgeId(x, z + 1, 'n');
  if (side === 'e') return edgeId(x + 1, z, 'w');
  return `${side}:${x},${z}`;
}

// Every wall segment: { x, z, side, type, id }. Inner walls are listed once.
export function walls(house) {
  const map = tileMap(house);
  const seen = new Set();
  const out = [];
  for (const t of house.tiles)
    for (const side of ['n', 'e', 's', 'w']) {
      const type = wallType(house, t.x, t.z, side, map);
      if (!type) continue;
      const id = edgeId(t.x, t.z, side);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ x: t.x, z: t.z, side, type, id });
    }
  return out;
}

// ---------- money ----------

export const canAfford = (state, price) => balance(state) >= price;

function spend(state, amount, note, now) {
  state.ledger.push({ date: dateStr(now), type: 'purchase', amount: -amount, note });
}

function notEnough(state, price) {
  const bal = balance(state);
  return bal < 0 ? 'You are in debt. Complete goals to get back above zero.' : `Not enough coins (${bal} of ${price}).`;
}

export function buyTile(state, x, z, room, now) {
  const h = state.house;
  if (!h.rooms.includes(room)) return { ok: false, reason: 'Unlock that room first.' };
  if (!candidateTiles(state).some((c) => c.x === x && c.z === z)) return { ok: false, reason: 'Floor must touch your house.' };
  const price = nextTilePrice(state);
  if (!canAfford(state, price)) return { ok: false, reason: notEnough(state, price) };
  spend(state, price, `Floor tile (${ROOMS[room].name})`, now);
  h.tiles.push({ x, z, room });
  // New floor can remove a wall: anything hanging on it goes to Storage.
  const stored = revalidate(state);
  return { ok: true, price, stored };
}

export function unlockRoom(state, room, now) {
  const r = ROOMS[room];
  if (!r) return { ok: false, reason: 'Unknown room.' };
  if (state.house.rooms.includes(room)) return { ok: false, reason: 'Already unlocked.' };
  if (!canAfford(state, r.unlock)) return { ok: false, reason: notEnough(state, r.unlock) };
  spend(state, r.unlock, `Unlocked ${r.name}`, now);
  state.house.rooms.push(room);
  return { ok: true };
}

// ---------- placement ----------

export function rotatedSize(item, rot) {
  const { w, d } = footprint(item);
  return rot % 2 ? { w: d, d: w } : { w, d };
}

function cellsOf(item, x, z, rot) {
  const { w, d } = rotatedSize(item, rot);
  const out = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([x + i, z + j]);
  return out;
}

// Wall segments (as edge ids) that a wall-mounted item's back covers, or null if not against a wall.
function wallSegmentsBehind(house, item, x, z, rot, map) {
  const { w, d } = rotatedSize(item, rot);
  const [dx, dz] = BACK[rot];
  const side = DIR_SIDE[`${dx},${dz}`];
  const back = [];
  if (dz === -1) for (let i = 0; i < w; i++) back.push([x + i, z]);
  if (dz === 1) for (let i = 0; i < w; i++) back.push([x + i, z + d - 1]);
  if (dx === 1) for (let j = 0; j < d; j++) back.push([x + w - 1, z + j]);
  if (dx === -1) for (let j = 0; j < d; j++) back.push([x, z + j]);
  const segs = new Set();
  for (const [cx, cz] of back) {
    // The cell behind must be in another tile, across a wall.
    if (tileOfCell(cx + dx) === tileOfCell(cx) && tileOfCell(cz + dz) === tileOfCell(cz)) return null;
    const tx = tileOfCell(cx);
    const tz = tileOfCell(cz);
    if (!wallType(house, tx, tz, side, map)) return null;
    segs.add(edgeId(tx, tz, side));
  }
  return segs;
}

// True if two neighbouring cells of a footprint sit on different sides of a wall.
function crossesWall(house, cells, map) {
  const set = new Set(cells.map(([a, b]) => key(a, b)));
  for (const [cx, cz] of cells) {
    const tx = tileOfCell(cx);
    const tz = tileOfCell(cz);
    if (set.has(key(cx + 1, cz)) && tileOfCell(cx + 1) !== tx && wallType(house, tx, tz, 'e', map)) return true;
    if (set.has(key(cx, cz + 1)) && tileOfCell(cz + 1) !== tz && wallType(house, tx, tz, 's', map)) return true;
  }
  return false;
}

const placedOthers = (house, uid) => house.items.filter((it) => it.placed && it.uid !== uid);

function cellSet(house, items) {
  const s = new Set();
  for (const it of items) for (const [cx, cz] of cellsOf(ITEMS[it.itemId], it.x, it.z, it.rot)) s.add(key(cx, cz));
  return s;
}

// Where a small item would rest: 'floor', 'surface' (+ height), or null if half on furniture.
function smallSupport(house, cells, uid) {
  const supports = placedOthers(house, uid).filter((it) => ITEMS[it.itemId].surface);
  const heights = new Set();
  let covered = 0;
  for (const [cx, cz] of cells) {
    const under = supports.filter((s) => cellsOf(ITEMS[s.itemId], s.x, s.z, s.rot).some(([a, b]) => a === cx && b === cz));
    if (under.length) {
      covered++;
      for (const s of under) heights.add(Math.round(height(ITEMS[s.itemId]) * 100) / 100);
    }
  }
  if (covered === 0) return { on: 'floor', y: 0 };
  // Fully supported, and level (not bridging two surfaces of different heights).
  if (covered === cells.length && heights.size === 1) return { on: 'surface', y: [...heights][0] };
  return null;
}

// Is a small item resting on something (vs the floor)? Used to decide floor-layer conflicts.
// Half-supported items count as neither, so they never block anything (revalidate stores them).
function smallOnFloor(house, it) {
  const s = smallSupport(house, cellsOf(ITEMS[it.itemId], it.x, it.z, it.rot), it.uid);
  return s?.on === 'floor';
}
function smallOnSurface(house, it) {
  const s = smallSupport(house, cellsOf(ITEMS[it.itemId], it.x, it.z, it.rot), it.uid);
  return s?.on === 'surface';
}

function openingSegments(house, uid) {
  return new Set(placedOthers(house, uid).filter((it) => isOpening(ITEMS[it.itemId])).map((it) => edgeId(it.x, it.z, it.side)));
}

function wallItemSegments(house, uid, map) {
  const s = new Set();
  for (const it of placedOthers(house, uid)) {
    const item = ITEMS[it.itemId];
    if (item.kind !== 'wall') continue;
    for (const seg of wallSegmentsBehind(house, item, it.x, it.z, it.rot, map) ?? []) s.add(seg);
  }
  return s;
}

// Check a placement. pos = { x, z, rot } for furniture, { x, z, side } for doors/windows.
// Returns { ok, reason?, y? } where y is the height it rests at.
export function checkPlacement(state, uid, itemId, pos) {
  const house = state.house;
  const item = ITEMS[itemId];
  const map = tileMap(house);
  if (!item || !Number.isInteger(pos?.x) || !Number.isInteger(pos?.z)) return { ok: false, reason: 'Invalid position.' };
  if (isOpening(item) ? !SIDE_DIR[pos.side] : !(Number.isInteger(pos.rot) && pos.rot >= 0 && pos.rot <= 3 && pos.side == null))
    return { ok: false, reason: 'Invalid position.' };

  if (isOpening(item)) {
    const type = wallType(house, pos.x, pos.z, pos.side, map);
    if (!type) return { ok: false, reason: 'Doors and windows go in a wall.' };
    if (item.kind === 'door' && type !== 'interior') return { ok: false, reason: 'Inside doors go between two rooms.' };
    if (item.kind !== 'door' && type !== 'exterior') return { ok: false, reason: 'This goes in an outside wall.' };
    const id = edgeId(pos.x, pos.z, pos.side);
    if (openingSegments(house, uid).has(id)) return { ok: false, reason: 'There is already a door or window here.' };
    if (wallItemSegments(house, uid, map).has(id)) return { ok: false, reason: 'Something is hanging on this wall.' };
    return { ok: true, y: 0 };
  }

  const cells = cellsOf(item, pos.x, pos.z, pos.rot);
  if (!cells.every(([cx, cz]) => map.has(key(tileOfCell(cx), tileOfCell(cz))))) return { ok: false, reason: 'Must be on your floor.' };
  if (crossesWall(house, cells, map)) return { ok: false, reason: 'It can’t stand across a wall.' };
  const others = placedOthers(house, uid);
  const sameKind = (k) => others.filter((it) => ITEMS[it.itemId].kind === k);
  const overlaps = (items) => {
    const s = cellSet(house, items);
    return cells.some(([cx, cz]) => s.has(key(cx, cz)));
  };

  switch (item.kind) {
    case 'floor': {
      const floorLayer = [...sameKind('floor'), ...sameKind('small').filter((it) => smallOnFloor(house, it))];
      if (overlaps(floorLayer)) return { ok: false, reason: 'Something is in the way.' };
      return { ok: true, y: 0 };
    }
    case 'small': {
      const support = smallSupport(house, cells, uid);
      if (!support) return { ok: false, reason: 'Put it fully on the floor or fully on one level surface.' };
      if (support.on === 'floor') {
        const floorLayer = [...sameKind('floor'), ...sameKind('small').filter((it) => smallOnFloor(house, it))];
        if (overlaps(floorLayer)) return { ok: false, reason: 'Something is in the way.' };
      } else if (overlaps(sameKind('small').filter((it) => smallOnSurface(house, it)))) {
        return { ok: false, reason: 'Something is in the way.' };
      }
      return { ok: true, y: support.y };
    }
    case 'rug':
      if (overlaps(sameKind('rug'))) return { ok: false, reason: 'Rugs can’t overlap.' };
      return { ok: true, y: 0 };
    case 'ceiling':
      if (overlaps(sameKind('ceiling'))) return { ok: false, reason: 'Something is in the way.' };
      return { ok: true, y: 0 };
    case 'wall': {
      const segs = wallSegmentsBehind(house, item, pos.x, pos.z, pos.rot, map);
      if (!segs) return { ok: false, reason: 'Hang it with its back against a wall.' };
      const openings = openingSegments(house, uid);
      if ([...segs].some((s) => openings.has(s))) return { ok: false, reason: 'There is a door or window here.' };
      if (overlaps(sameKind('wall'))) return { ok: false, reason: 'Something is in the way.' };
      return { ok: true, y: item.mount ?? 0.5 };
    }
  }
  return { ok: false, reason: 'Unknown item type.' };
}

const findItem = (state, uid) => state.house.items.find((it) => it.uid === uid);

function setPos(it, pos) {
  it.placed = true;
  it.x = pos.x;
  it.z = pos.z;
  if (pos.side) {
    it.side = pos.side;
    delete it.rot;
  } else {
    it.rot = pos.rot;
    delete it.side;
  }
}

function unplace(it) {
  it.placed = false;
  for (const k of ['x', 'z', 'rot', 'side']) delete it[k];
}

// Small items resting entirely on a surface item.
function itemsOnTop(state, base) {
  const baseItem = ITEMS[base.itemId];
  if (!base.placed || !baseItem.surface) return [];
  const baseCells = new Set(cellsOf(baseItem, base.x, base.z, base.rot).map(([a, b]) => key(a, b)));
  return state.house.items.filter((it) => {
    if (!it.placed || it.uid === base.uid || ITEMS[it.itemId].kind !== 'small') return false;
    const cells = cellsOf(ITEMS[it.itemId], it.x, it.z, it.rot);
    return smallOnSurface(state.house, it) && cells.every(([a, b]) => baseCells.has(key(a, b)));
  });
}

// Anything no longer valid (e.g. a wall it hung on disappeared) goes to Storage. Returns their names.
export function revalidate(state) {
  const stored = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of state.house.items) {
      if (!it.placed) continue;
      const pos = it.side ? { x: it.x, z: it.z, side: it.side } : { x: it.x, z: it.z, rot: it.rot };
      if (!checkPlacement(state, it.uid, it.itemId, pos).ok) {
        unplace(it);
        stored.push(ITEMS[it.itemId].name);
        changed = true;
      }
    }
  }
  return stored;
}

// Place or move an item. Small items on top of a moved surface item travel with it.
export function placeItem(state, uid, pos) {
  const it = findItem(state, uid);
  if (!it) return { ok: false, reason: 'Item not found.' };
  const check = checkPlacement(state, uid, it.itemId, pos);
  if (!check.ok) return check;
  const rotated = it.placed && !it.side && pos.rot !== it.rot;
  const carried = it.placed && !it.side ? itemsOnTop(state, it) : [];
  const dx = it.placed ? pos.x - it.x : 0;
  const dz = it.placed ? pos.z - it.z : 0;
  setPos(it, pos);
  for (const c of carried) {
    if (rotated) unplace(c);
    else setPos(c, { x: c.x + dx, z: c.z + dz, rot: c.rot });
  }
  const stored = revalidate(state);
  if (rotated) stored.push(...carried.map((c) => ITEMS[c.itemId].name));
  return { ok: true, stored };
}

export function storeItem(state, uid) {
  const it = findItem(state, uid);
  if (!it || !it.placed) return { ok: false, reason: 'Not placed.' };
  const onTop = itemsOnTop(state, it);
  unplace(it);
  for (const c of onTop) unplace(c);
  const stored = revalidate(state);
  return { ok: true, stored: [...onTop.map((c) => ITEMS[c.itemId].name), ...stored] };
}

export const saleValue = (item) => Math.floor(item.price * SELL_RATE);

export function sellItem(state, uid, now) {
  const it = findItem(state, uid);
  if (!it) return { ok: false, reason: 'Item not found.' };
  if (it.placed) return { ok: false, reason: 'Move it to Storage first.' };
  const item = ITEMS[it.itemId];
  const value = saleValue(item);
  state.house.items = state.house.items.filter((x) => x.uid !== uid);
  if (value > 0) state.ledger.push({ date: dateStr(now), type: 'sale', amount: value, note: `Sold ${item.name}` });
  return { ok: true, value };
}

// Buy an item; it starts in Storage (the UI then places it).
export function buyItem(state, itemId, now) {
  const item = ITEMS[itemId];
  if (!item || item.hidden) return { ok: false, reason: 'Not for sale.' };
  if (!canAfford(state, item.price)) return { ok: false, reason: notEnough(state, item.price) };
  spend(state, item.price, `Bought ${item.name}`, now);
  const it = { uid: makeId(), itemId, placed: false };
  state.house.items.push(it);
  return { ok: true, uid: it.uid };
}

// Higher tiers of the same product.
export function upgradesFor(itemId) {
  const item = ITEMS[itemId];
  const rank = TIER_ORDER.indexOf(item.tier);
  return Object.values(ITEMS).filter((i) => i.product === item.product && !i.hidden && TIER_ORDER.indexOf(i.tier) > rank);
}

// Buy a better version: it takes the old one's spot if it fits; the old one goes to Storage.
export function upgradeItem(state, uid, newItemId, now) {
  const old = findItem(state, uid);
  if (!old) return { ok: false, reason: 'Item not found.' };
  if (!upgradesFor(old.itemId).some((i) => i.id === newItemId)) return { ok: false, reason: 'Not an upgrade for this item.' };
  const bought = buyItem(state, newItemId, now);
  if (!bought.ok) return bought;
  if (!old.placed) return { ok: true, uid: bought.uid, inPlace: false, stored: [] };
  const pos = old.side ? { x: old.x, z: old.z, side: old.side } : { x: old.x, z: old.z, rot: old.rot };
  const onTop = itemsOnTop(state, old);
  // Try the new item in the old spot, with the old one out of the way.
  const snapshot = { ...old };
  unplace(old);
  for (const c of onTop) c.placed = false;
  const fits = checkPlacement(state, bought.uid, newItemId, pos).ok;
  for (const c of onTop) c.placed = true;
  if (!fits) {
    Object.assign(old, snapshot);
    return { ok: true, uid: bought.uid, inPlace: false, stored: [] };
  }
  setPos(findItem(state, bought.uid), pos);
  const stored = revalidate(state); // items on top stay if they still fit on the new one
  return { ok: true, uid: bought.uid, inPlace: true, stored };
}

// First free spot for an item (used when placing something new). Prefers spots near the house centre.
export function findSpot(state, itemId) {
  const item = ITEMS[itemId];
  const house = state.house;
  const cx = house.tiles.reduce((s, t) => s + t.x, 0) / house.tiles.length;
  const cz = house.tiles.reduce((s, t) => s + t.z, 0) / house.tiles.length;
  const byDistance = [...house.tiles].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  if (isOpening(item)) {
    for (const t of byDistance)
      for (const side of ['n', 'e', 's', 'w']) {
        const pos = { x: t.x, z: t.z, side };
        if (checkPlacement(state, null, itemId, pos).ok) return pos;
      }
    return null;
  }
  for (const t of byDistance)
    for (const rot of [0, 1, 2, 3])
      for (let i = 0; i < TILE; i++)
        for (let j = 0; j < TILE; j++) {
          const pos = { x: t.x * TILE + i, z: t.z * TILE + j, rot };
          if (checkPlacement(state, null, itemId, pos).ok) return pos;
        }
  return null;
}
