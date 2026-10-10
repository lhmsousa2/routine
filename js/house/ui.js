// House tab: toolbar, shop, storage, floor buying, and placing items. Rules live in house.js.
import { HouseScene } from './scene.js';
import * as H from './house.js';
import { ITEMS, ROOMS, SECTIONS, TIERS, shopProducts } from './catalog.js';
import { balance } from '../engine.js';

let ctx; // { getState, commit, toast, now }
let root;
let scene;
let mode = { type: 'view' };
let floorRoom = 'bedroom';
let shopSection = 'bedroom';
const WALL_MODES = ['cutaway', 'up', 'down'];
const WALL_LABEL = { cutaway: 'Walls: cut', up: 'Walls: up', down: 'Walls: down' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = () => ctx.getState();
const posOf = (it) => (it.side ? { x: it.x, z: it.z, side: it.side } : { x: it.x, z: it.z, rot: it.rot });
const findItem = (uid) => state().house.items.find((i) => i.uid === uid);

export function mount(container, context) {
  ctx = context;
  root = container;
  root.innerHTML = `
    <div class="house-canvas"></div>
    <div class="house-hint" hidden></div>
    <div class="house-bar"></div>
    <dialog class="sheet" id="house-sheet"><div class="sheet-body"></div></dialog>`;
  scene = new HouseScene(root.querySelector('.house-canvas'), { onTap, onDrag, onDragEnd: () => {} });
  if (new URLSearchParams(location.search).has('debug')) window.__house = { scene, H, state, onTap };
  root.querySelector('.house-bar').addEventListener('click', onBar);
  root.querySelector('.house-hint').addEventListener('click', onBar);
  const sheet = root.querySelector('#house-sheet');
  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet) sheet.close();
    else onSheet(ev);
  });
  scene.setState(state());
  renderBar();
}

// Called by the app whenever state changes or the tab is shown.
export function refresh() {
  if (!scene) return;
  if (mode.type === 'selected' && !findItem(mode.uid)?.placed) mode = { type: 'view' };
  scene.setState(state());
  scene.setMode(sceneMode());
  scene.resize();
  renderBar();
}

function sceneMode() {
  if (mode.type === 'selected') {
    const it = findItem(mode.uid);
    return { type: 'selected', uid: mode.uid, itemId: it.itemId, pos: posOf(it) };
  }
  if (mode.type === 'place') return { ...mode, opening: H.isOpening(ITEMS[mode.itemId]) };
  return mode;
}

function setMode(m) {
  mode = m;
  scene.setMode(sceneMode());
  renderBar();
}

// ---------- toolbar ----------

function renderBar() {
  const bar = root.querySelector('.house-bar');
  const hint = root.querySelector('.house-hint');
  const s = state();
  const stored = s.house.items.filter((i) => !i.placed).length;
  let hintHtml = '';
  let html = '';
  if (mode.type === 'view') {
    html = `
      <button data-act="shop"><span>🛒</span>Shop</button>
      <button data-act="floor"><span>⬚</span>Floor</button>
      <button data-act="storage"><span>📦</span>Storage${stored ? ` <b class="count">${stored}</b>` : ''}</button>
      <button data-act="walls"><span>◧</span>${WALL_LABEL[scene.wallMode]}</button>
      <button data-act="center"><span>⌖</span>Center</button>`;
  } else if (mode.type === 'selected') {
    const it = findItem(mode.uid);
    const item = ITEMS[it.itemId];
    const ups = H.upgradesFor(it.itemId);
    hintHtml = `<div><strong>${esc(item.name)}</strong> <span class="muted">· ${esc(TIERS[item.tier] ?? 'Starter')}</span></div>`;
    html = `
      <button data-act="move"><span>✥</span>Move</button>
      ${H.isOpening(item) ? '' : '<button data-act="rotate"><span>↻</span>Rotate</button>'}
      ${ups.length ? '<button data-act="upgrade"><span>⬆</span>Upgrade</button>' : ''}
      <button data-act="store"><span>📦</span>Store</button>
      <button data-act="deselect"><span>✕</span>Done</button>`;
  } else if (mode.type === 'place') {
    const item = ITEMS[mode.itemId];
    const opening = H.isOpening(item);
    const v = mode.valid;
    hintHtml = v?.ok
      ? `<div><strong>${esc(item.name)}</strong> <span class="muted">· ${opening ? 'tap a wall to move it' : 'drag it or tap the floor'}</span></div>`
      : `<div class="neg">${esc(v?.reason ?? (opening ? 'Tap a wall to place it.' : 'Tap the floor to place it.'))}</div>`;
    html = `
      ${opening ? '' : '<button data-act="place-rotate"><span>↻</span>Rotate</button>'}
      <button data-act="place-cancel"><span>✕</span>Cancel</button>
      <button data-act="place-ok" class="primary" ${v?.ok ? '' : 'disabled'}><span>✓</span>Place</button>`;
  } else if (mode.type === 'floor') {
    const price = H.nextTilePrice(s);
    hintHtml = `
      <div>Tap a green square to buy 1 m² · <strong>${price}</strong> coins</div>
      <div class="chips">
        ${s.house.rooms.map((r) => `<button class="chip ${r === floorRoom ? 'on' : ''}" data-act="floor-room" data-room="${r}">${esc(ROOMS[r].name)}</button>`).join('')}
        ${s.house.rooms.length < Object.keys(ROOMS).length ? '<button class="chip add" data-act="rooms">+ Room</button>' : ''}
      </div>`;
    html = `<button data-act="floor-done" class="primary"><span>✓</span>Done</button>`;
  }
  hint.hidden = !hintHtml;
  hint.innerHTML = hintHtml;
  bar.innerHTML = html;
}

function onBar(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const s = state();
  switch (act) {
    case 'shop':
      return openShop();
    case 'storage':
      return openStorage();
    case 'floor':
      if (!s.house.rooms.includes(floorRoom)) floorRoom = s.house.rooms[0];
      return setMode({ type: 'floor' });
    case 'floor-done':
      return setMode({ type: 'view' });
    case 'floor-room':
      floorRoom = b.dataset.room;
      return renderBar();
    case 'rooms':
      return openRooms();
    case 'walls':
      scene.setWallMode(WALL_MODES[(WALL_MODES.indexOf(scene.wallMode) + 1) % WALL_MODES.length]);
      return renderBar();
    case 'center':
      scene.frameHouse();
      return scene.requestRender();
    case 'deselect':
      return setMode({ type: 'view' });
    case 'move': {
      const it = findItem(mode.uid);
      return startPlacing(it.uid, posOf(it));
    }
    case 'rotate':
      return rotateSelected();
    case 'upgrade':
      return openUpgrade(mode.uid);
    case 'store': {
      const r = H.storeItem(s, mode.uid);
      if (!r.ok) return ctx.toast(r.reason);
      mode = { type: 'view' };
      ctx.commit();
      return ctx.toast(r.stored.length ? `Stored, with ${r.stored.join(', ')}` : 'Moved to Storage');
    }
    case 'place-rotate': {
      const pos = { ...mode.pos, rot: ((mode.pos?.rot ?? 0) + 1) % 4 };
      return updatePlacing(pos);
    }
    case 'place-cancel':
      mode = { type: 'view' };
      scene.clearGhost();
      return refresh();
    case 'place-ok': {
      const r = H.placeItem(s, mode.uid, mode.pos);
      if (!r.ok) return ctx.toast(r.reason);
      const uid = mode.uid;
      mode = { type: 'selected', uid };
      scene.clearGhost();
      ctx.commit();
      if (r.stored?.length) ctx.toast(`Moved to Storage: ${r.stored.join(', ')}`);
      return;
    }
  }
}

function rotateSelected() {
  const it = findItem(mode.uid);
  for (let k = 1; k <= 3; k++) {
    const pos = { x: it.x, z: it.z, rot: (it.rot + k) % 4 };
    if (H.checkPlacement(state(), it.uid, it.itemId, pos).ok) {
      const r = H.placeItem(state(), it.uid, pos);
      ctx.commit();
      if (r.stored?.length) ctx.toast(`Moved to Storage: ${r.stored.join(', ')}`);
      return;
    }
  }
  // No free rotation in place: let the user move it while rotated.
  startPlacing(it.uid, { x: it.x, z: it.z, rot: (it.rot + 1) % 4 });
}

// ---------- placing ----------

function startPlacing(uid, pos) {
  const it = findItem(uid);
  const p = pos ?? H.findSpot(state(), it.itemId);
  if (!p) {
    setMode({ type: 'view' });
    return ctx.toast('No free spot right now. It’s in Storage. Buy more floor.');
  }
  mode = { type: 'place', uid, itemId: it.itemId, pos: p, valid: H.checkPlacement(state(), uid, it.itemId, p) };
  scene.setMode(sceneMode());
  renderBar();
}

function updatePlacing(pos) {
  mode = { ...mode, pos, valid: H.checkPlacement(state(), mode.uid, mode.itemId, pos) };
  scene.setMode(sceneMode());
  renderBar();
}

function onDrag(pos) {
  if (mode.type === 'place') updatePlacing(pos);
}

function onTap(hit) {
  if (mode.type === 'floor') {
    if (!hit.tile) return;
    const price = H.nextTilePrice(state());
    if (!confirm(`Buy 1 m² of ${ROOMS[floorRoom].name} for ${price} coins?`)) return;
    const r = H.buyTile(state(), hit.tile.x, hit.tile.z, floorRoom, ctx.now());
    if (!r.ok) return ctx.toast(r.reason);
    ctx.commit();
    ctx.toast(r.stored.length ? `Bought! Moved to Storage: ${r.stored.join(', ')}` : `+1 m² · −${r.price} coins`);
    return;
  }
  if (mode.type === 'place') return;
  if (hit.type === 'item') return setMode({ type: 'selected', uid: hit.uid });
  if (mode.type === 'selected') setMode({ type: 'view' });
}

// ---------- sheets ----------

function sheet(html) {
  const d = root.querySelector('#house-sheet');
  d.querySelector('.sheet-body').innerHTML = html;
  if (!d.open) d.showModal();
  loadThumbs(d);
  return d;
}

function loadThumbs(el) {
  for (const img of el.querySelectorAll('img[data-thumb]')) {
    HouseScene.thumbnail(ITEMS[img.dataset.thumb]).then((src) => (img.src = src)).catch(() => {});
  }
}

const tierClass = (t) => `tier-${t}`;

function openShop() {
  const s = state();
  const bal = balance(s);
  const owned = new Map();
  for (const it of s.house.items) owned.set(it.itemId, (owned.get(it.itemId) ?? 0) + 1);
  const products = shopProducts(shopSection);
  sheet(`
    <div class="sheet-head"><h2>Shop</h2><span class="coin-pill ${bal < 0 ? 'negative' : ''}"><span class="coin">●</span> ${bal}</span></div>
    <div class="chips scroll">${SECTIONS.map((sec) => `<button class="chip ${sec.id === shopSection ? 'on' : ''}" data-sheet="section" data-id="${sec.id}">${esc(sec.name)}</button>`).join('')}</div>
    ${products
      .map(
        (p) => `
      <div class="product">
        <h3>${esc(p.name)}</h3>
        <div class="tiers">
          ${p.tiers
            .map(
              (t) => `
            <div class="tier-card ${tierClass(t.tier)}">
              <img data-thumb="${t.id}" alt="">
              <div class="tier-label">${esc(TIERS[t.tier])}</div>
              <div class="tier-name">${esc(t.name)}</div>
              ${owned.get(t.id) ? `<div class="owned">owned ${owned.get(t.id)}</div>` : ''}
              <button class="btn small ${bal >= t.price ? 'primary' : ''}" data-sheet="buy" data-id="${t.id}" ${bal >= t.price ? '' : 'disabled'}>● ${t.price}</button>
            </div>`,
            )
            .join('')}
        </div>
      </div>`,
      )
      .join('')}
    <button class="btn block" data-sheet="close">Close</button>`);
}

function openStorage() {
  const items = state().house.items.filter((i) => !i.placed);
  sheet(`
    <div class="sheet-head"><h2>Storage</h2></div>
    ${
      items.length
        ? `<ul class="storage">${items
            .map((it) => {
              const item = ITEMS[it.itemId];
              const v = H.saleValue(item);
              return `<li>
                <img data-thumb="${item.id}" alt="">
                <div class="grow"><div class="tier-name">${esc(item.name)}</div><div class="muted small">${esc(TIERS[item.tier] ?? 'Starter')}</div></div>
                <button class="btn small primary" data-sheet="place" data-uid="${esc(it.uid)}">Place</button>
                <button class="btn small" data-sheet="sell" data-uid="${esc(it.uid)}">${v ? `Sell +${v}` : 'Discard'}</button>
              </li>`;
            })
            .join('')}</ul>`
        : '<p class="muted">Nothing in Storage. Upgraded or stored items end up here.</p>'
    }
    <button class="btn block" data-sheet="close">Close</button>`);
}

function openUpgrade(uid) {
  const it = findItem(uid);
  const bal = balance(state());
  const ups = H.upgradesFor(it.itemId);
  sheet(`
    <div class="sheet-head"><h2>Upgrade ${esc(ITEMS[it.itemId].productName.toLowerCase())}</h2><span class="coin-pill"><span class="coin">●</span> ${bal}</span></div>
    <p class="muted small">The new one takes this spot if it fits. The old one goes to Storage (sell it there for 25%).</p>
    <div class="tiers">
      ${ups
        .map(
          (t) => `
        <div class="tier-card ${tierClass(t.tier)}">
          <img data-thumb="${t.id}" alt="">
          <div class="tier-label">${esc(TIERS[t.tier])}</div>
          <div class="tier-name">${esc(t.name)}</div>
          <button class="btn small ${bal >= t.price ? 'primary' : ''}" data-sheet="do-upgrade" data-uid="${esc(uid)}" data-id="${t.id}" ${bal >= t.price ? '' : 'disabled'}>● ${t.price}</button>
        </div>`,
        )
        .join('')}
    </div>
    <button class="btn block" data-sheet="close">Close</button>`);
}

function openRooms() {
  const s = state();
  const bal = balance(s);
  const locked = Object.entries(ROOMS).filter(([id]) => !s.house.rooms.includes(id));
  sheet(`
    <div class="sheet-head"><h2>Unlock a room</h2><span class="coin-pill"><span class="coin">●</span> ${bal}</span></div>
    <p class="muted small">After unlocking, buy its floor next to your house. Walls between rooms appear automatically; add an inside door to connect them.</p>
    <ul class="storage">
      ${locked
        .map(
          ([id, r]) => `<li><span class="room-swatch" style="background:${r.floor}"></span><div class="grow"><div class="tier-name">${esc(r.name)}</div></div>
          <button class="btn small ${bal >= r.unlock ? 'primary' : ''}" data-sheet="unlock" data-id="${id}" ${bal >= r.unlock ? '' : 'disabled'}>● ${r.unlock}</button></li>`,
        )
        .join('')}
    </ul>
    <button class="btn block" data-sheet="close">Close</button>`);
}

function onSheet(ev) {
  const b = ev.target.closest('[data-sheet]');
  if (!b) return;
  const d = root.querySelector('#house-sheet');
  const s = state();
  switch (b.dataset.sheet) {
    case 'close':
      return d.close();
    case 'section':
      shopSection = b.dataset.id;
      return openShop();
    case 'buy': {
      const item = ITEMS[b.dataset.id];
      if (!confirm(`Buy ${item.name} for ${item.price} coins?`)) return;
      const r = H.buyItem(s, item.id, ctx.now());
      if (!r.ok) return ctx.toast(r.reason);
      d.close();
      ctx.commit();
      return startPlacing(r.uid);
    }
    case 'place':
      d.close();
      return startPlacing(b.dataset.uid);
    case 'sell': {
      const it = findItem(b.dataset.uid);
      const item = ITEMS[it.itemId];
      const v = H.saleValue(item);
      if (!confirm(v ? `Sell ${item.name} for ${v} coins?` : `Throw away ${item.name}?`)) return;
      const r = H.sellItem(s, it.uid, ctx.now());
      if (!r.ok) return ctx.toast(r.reason);
      ctx.commit();
      if (v) ctx.toast(`Sold · +${v} coins`);
      return openStorage();
    }
    case 'do-upgrade': {
      const item = ITEMS[b.dataset.id];
      if (!confirm(`Upgrade to ${item.name} for ${item.price} coins?`)) return;
      const r = H.upgradeItem(s, b.dataset.uid, item.id, ctx.now());
      if (!r.ok) return ctx.toast(r.reason);
      d.close();
      if (r.inPlace) {
        mode = { type: 'selected', uid: r.uid };
        ctx.commit();
        return ctx.toast('Upgraded! The old one is in Storage.');
      }
      ctx.commit();
      ctx.toast('It doesn’t fit in the same spot. Place it somewhere.');
      return startPlacing(r.uid);
    }
    case 'unlock': {
      const room = ROOMS[b.dataset.id];
      if (!confirm(`Unlock ${room.name} for ${room.unlock} coins?`)) return;
      const r = H.unlockRoom(s, b.dataset.id, ctx.now());
      if (!r.ok) return ctx.toast(r.reason);
      floorRoom = b.dataset.id;
      d.close();
      ctx.commit();
      return ctx.toast(`${room.name} unlocked. Tap a green square to build it.`);
    }
  }
}
