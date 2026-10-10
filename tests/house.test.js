import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as H from '../js/house/house.js';
import { ITEMS, footprint, tilePrice } from '../js/house/catalog.js';

const now = new Date('2026-10-10T12:00:00');
const give = (s, n) => s.ledger.push({ date: '2026-10-09', type: 'sale', amount: n, note: 'test coins' });
function fresh(coins = 0) {
  const s = E.newState(now);
  if (coins) give(s, coins);
  return s;
}
// Grow a rectangle of bedroom tiles from (0,0) to (w-1, d-1) for free.
function room(s, w, d, roomId = 'bedroom') {
  s.house.tiles = [];
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) s.house.tiles.push({ x, z, room: roomId });
}
const buyPlace = (s, itemId, pos) => {
  const b = H.buyItem(s, itemId, now);
  assert.equal(b.ok, true, b.reason);
  const p = H.placeItem(s, b.uid, pos);
  return { uid: b.uid, ...p };
};

test('new state has a 1 m² bedroom with a sleeping bag', () => {
  const s = fresh();
  assert.equal(s.house.tiles.length, 1);
  assert.equal(s.house.items[0].itemId, 'bed-starter');
  assert.equal(E.validateState(s), true);
});

test('v1 save migrates to v2 keeping goals, history and coins', () => {
  const s = fresh(123);
  s.goals.push({ id: 'a', gid: 'a', name: 'Read', target: null, unit: null, carryOverExtra: null, deadline: null, activeFrom: '2026-10-09', activeUntil: null });
  const v1 = JSON.parse(JSON.stringify(s));
  delete v1.house;
  v1.schemaVersion = 1;
  const m = E.migrate(v1);
  assert.equal(m.schemaVersion, 2);
  assert.equal(E.validateState(m), true);
  assert.equal(E.balance(m), 123);
  assert.equal(m.goals[0].name, 'Read');
  assert.equal(m.house.tiles.length, 1);
});

test('tile price rises 3 per tile; must touch the house; needs coins', () => {
  const s = fresh(1000);
  assert.equal(H.nextTilePrice(s), 53);
  assert.equal(H.buyTile(s, 5, 5, 'bedroom', now).ok, false, 'not adjacent');
  assert.equal(H.buyTile(s, 1, 0, 'bedroom', now).ok, true);
  assert.equal(E.balance(s), 1000 - 53);
  assert.equal(H.nextTilePrice(s), 56);
  assert.equal(H.buyTile(s, 1, 0, 'bedroom', now).ok, false, 'already owned');
  assert.equal(H.buyTile(s, 0, 1, 'kitchen', now).ok, false, 'room locked');
  assert.equal(tilePrice(59), 227);
});

test('cannot buy in debt or beyond balance', () => {
  const s = fresh(30);
  assert.equal(H.buyTile(s, 1, 0, 'bedroom', now).ok, false);
  s.ledger.push({ date: '2026-10-09', type: 'day', amount: -100, note: 'x' });
  const r = H.buyItem(s, 'plant-cheap', now);
  assert.equal(r.ok, false);
  assert.match(r.reason, /debt/);
});

test('floor items: must be on floor, cannot overlap; rotation swaps footprint', () => {
  const s = fresh(5000);
  room(s, 3, 3);
  s.house.items = [];
  const bed = ITEMS['bed-premium'];
  assert.deepEqual(footprint(bed), { w: 4, d: 5 });
  assert.deepEqual(H.rotatedSize(bed, 1), { w: 5, d: 4 });
  const a = buyPlace(s, 'bed-premium', { x: 0, z: 0, rot: 0 });
  assert.equal(a.ok, true);
  const b = H.buyItem(s, 'nightstand-standard', now);
  assert.equal(H.placeItem(s, b.uid, { x: 3, z: 0, rot: 0 }).ok, false, 'overlaps bed');
  assert.equal(H.placeItem(s, b.uid, { x: 4, z: 0, rot: 0 }).ok, true);
  assert.equal(H.placeItem(s, b.uid, { x: 6, z: 0, rot: 0 }).ok, false, 'off the floor');
});

test('small items sit on surfaces or floor, never half-and-half; travel with the surface', () => {
  const s = fresh(5000);
  room(s, 3, 3);
  s.house.items = [];
  const desk = buyPlace(s, 'desk-standard', { x: 0, z: 0, rot: 0 }); // 3x2 cells
  assert.equal(desk.ok, true);
  const lamp = H.buyItem(s, 'desklamp-standard', now);
  const onDesk = H.checkPlacement(s, lamp.uid, 'desklamp-standard', { x: 0, z: 0, rot: 0 });
  assert.equal(onDesk.ok, true);
  assert.ok(onDesk.y > 0.3, 'rests on desk height');
  H.placeItem(s, lamp.uid, { x: 0, z: 0, rot: 0 });
  const floorSpot = H.checkPlacement(s, null, 'desklamp-standard', { x: 5, z: 5, rot: 0 });
  assert.equal(floorSpot.ok, true);
  assert.equal(floorSpot.y, 0);
  // A 2-wide TV half on the desk edge is rejected
  const tvHalf = H.checkPlacement(s, null, 'tv-standard', { x: 2, z: 0, rot: 0 });
  assert.equal(tvHalf.ok, false);
  // Move the desk: lamp moves with it
  assert.equal(H.placeItem(s, desk.uid, { x: 0, z: 3, rot: 0 }).ok, true);
  const l = s.house.items.find((i) => i.uid === lamp.uid);
  assert.deepEqual([l.placed, l.x, l.z], [true, 0, 3]);
  // Rotate the desk: lamp goes to storage
  const r = H.placeItem(s, desk.uid, { x: 0, z: 3, rot: 1 });
  assert.equal(r.ok, true);
  assert.equal(s.house.items.find((i) => i.uid === lamp.uid).placed, false);
  assert.deepEqual(r.stored, ['Iron lamp']);
});

test('rugs can be under furniture but not under other rugs', () => {
  const s = fresh(5000);
  room(s, 4, 4);
  s.house.items = [];
  assert.equal(buyPlace(s, 'bedrug-standard', { x: 0, z: 0, rot: 0 }).ok, true);
  assert.equal(buyPlace(s, 'bed-standard', { x: 0, z: 0, rot: 0 }).ok, true);
  assert.equal(buyPlace(s, 'bedrug-premium', { x: 1, z: 1, rot: 0 }).ok, false);
});

test('wall items need a wall behind them; adding floor behind removes the wall and stores them', () => {
  const s = fresh(5000);
  room(s, 2, 2);
  s.house.items = [];
  // Mirror (2 cells wide), back to the north wall at z=0
  assert.equal(buyPlace(s, 'mirror-standard', { x: 0, z: 0, rot: 0 }).ok, true);
  // Not against a wall (middle of the room)
  assert.equal(H.checkPlacement(s, null, 'mirror-standard', { x: 1, z: 1, rot: 0 }).ok, false);
  // Facing the other way at the south wall works (rot 2 = back to the south)
  assert.equal(H.checkPlacement(s, null, 'mirror-standard', { x: 0, z: 3, rot: 2 }).ok, true);
  // Buy floor north of it: the wall disappears, mirror goes to storage
  const t = H.buyTile(s, 0, -1, 'bedroom', now);
  assert.equal(t.ok, true);
  assert.deepEqual(t.stored, ['Oak mirror']);
});

test('windows go on outside walls, inside doors between rooms, one per wall segment', () => {
  const s = fresh(5000);
  room(s, 2, 1);
  s.house.rooms.push('office');
  s.house.tiles.push({ x: 2, z: 0, room: 'office' });
  s.house.items = [];
  assert.equal(H.checkPlacement(s, null, 'window-standard', { x: 0, z: 0, side: 'n' }).ok, true);
  assert.equal(H.checkPlacement(s, null, 'window-standard', { x: 0, z: 0, side: 'e' }).ok, false, 'no wall between same-room tiles');
  assert.equal(H.checkPlacement(s, null, 'door-standard', { x: 1, z: 0, side: 'e' }).ok, true, 'between bedroom and office');
  assert.equal(H.checkPlacement(s, null, 'door-standard', { x: 0, z: 0, side: 'n' }).ok, false, 'inside door not outside');
  assert.equal(buyPlace(s, 'door-standard', { x: 2, z: 0, side: 'w' }).ok, true);
  // Same edge seen from the other tile is taken
  assert.equal(H.checkPlacement(s, null, 'door-cheap', { x: 1, z: 0, side: 'e' }).ok, false);
  assert.equal(H.walls(s.house).filter((w) => w.type === 'interior').length, 1);
});

test('upgrade: new item takes the spot, old goes to storage; sell for 25%', () => {
  const s = fresh(5000);
  room(s, 3, 3);
  const starter = s.house.items[0];
  const up = H.upgradesFor('bed-starter').map((i) => i.id);
  assert.deepEqual(up, ['bed-cheap', 'bed-standard', 'bed-premium']);
  const r = H.upgradeItem(s, starter.uid, 'bed-standard', now);
  assert.equal(r.ok, true);
  assert.equal(r.inPlace, true);
  assert.equal(starter.placed, false);
  const before = E.balance(s);
  const nb = s.house.items.find((i) => i.uid === r.uid);
  assert.equal(H.storeItem(s, nb.uid).ok, true);
  const sold = H.sellItem(s, nb.uid, now);
  assert.deepEqual(sold, { ok: true, value: 50 });
  assert.equal(E.balance(s), before + 50);
  assert.equal(H.sellItem(s, 'nope', now).ok, false);
  // Can't sell something that's placed
  const p = buyPlace(s, 'plant-standard', { x: 5, z: 5, rot: 0 });
  assert.equal(H.sellItem(s, p.uid, now).ok, false);
});

test('upgrade that does not fit stays in storage and keeps the old item', () => {
  const s = fresh(5000); // 1 tile only
  const starter = s.house.items[0];
  const r = H.upgradeItem(s, starter.uid, 'bed-premium', now);
  assert.equal(r.ok, true);
  assert.equal(r.inPlace, false);
  assert.equal(starter.placed, true);
  assert.equal(s.house.items.find((i) => i.uid === r.uid).placed, false);
});

test('storing a surface item also stores what is on top', () => {
  const s = fresh(5000);
  room(s, 2, 2);
  s.house.items = [];
  const ns = buyPlace(s, 'nightstand-standard', { x: 0, z: 0, rot: 0 });
  const lamp = buyPlace(s, 'bedlamp-standard', { x: 0, z: 0, rot: 0 });
  assert.equal(lamp.ok, true);
  const r = H.storeItem(s, ns.uid);
  assert.deepEqual(r.stored, ['Linen lamp']);
});

test('findSpot finds a valid place or null', () => {
  const s = fresh(5000);
  room(s, 2, 2);
  s.house.items = [];
  const pos = H.findSpot(s, 'sofa-standard');
  assert.ok(pos);
  assert.equal(H.checkPlacement(s, null, 'sofa-standard', pos).ok, true);
  const tiny = fresh(); // 1 tile, sleeping bag on it
  assert.equal(H.findSpot(tiny, 'sofa-premium'), null);
  assert.ok(H.findSpot(tiny, 'window-cheap'));
});

test('unlock room costs coins once', () => {
  const s = fresh(1000);
  assert.equal(H.unlockRoom(s, 'kitchen', now).ok, true);
  assert.equal(E.balance(s), 600);
  assert.equal(H.unlockRoom(s, 'kitchen', now).ok, false);
  assert.equal(H.buyTile(s, 1, 0, 'kitchen', now).ok, true);
});

test('validateHouse rejects broken house data', () => {
  const bad = [
    (s) => (s.house = null),
    (s) => (s.house.tiles.push({ x: 0, z: 0, room: 'bedroom' })), // duplicate tile
    (s) => (s.house.tiles[0].room = 'kitchen'), // room not unlocked
    (s) => (s.house.items[0].itemId = 'nope'),
    (s) => (s.house.items[0].rot = 7),
    (s) => (s.house.items.push({ ...s.house.items[0] })), // duplicate uid
    (s) => (s.house.rooms.push('<script>')),
  ];
  for (const m of bad) {
    const s = fresh();
    m(s);
    assert.equal(E.validateState(s), false, m.toString());
  }
});

test('every catalog item has a model and a sane footprint', () => {
  for (const it of Object.values(ITEMS)) {
    const f = footprint(it);
    assert.ok(f.w >= 1 && f.d >= 1 && f.w <= 8 && f.d <= 8, it.id);
    assert.ok(it.price >= 0, it.id);
  }
});
