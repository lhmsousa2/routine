// 3D view of the house (three.js). Draws state; reports taps/drags back to the UI.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ITEMS, ROOMS, PALETTES, CELL, TILE, WALL_H, WALL_T, bounds } from './catalog.js';
import { walls, isOpening, checkPlacement, rotatedSize, candidateTiles } from './house.js';

const TW = TILE * CELL; // tile width in world units (0.5)
const SIDE_ROT = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 };
const SIDE_OUT = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const BACK = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const WALL_COLOR = '#efe3cf';
const WALL_TOP = '#cdb894';
const LOW_WALL = 0.06;
const DOOR_H = 1.01;
const WIN_LO = 0.35;
const WIN_HI = 1.0;

// Model path relative to the app root
const MODEL_URL = (name) => `assets/models/${name}.glb`;

// ---------- materials & models ----------

const matCache = new Map();
function mat(color, opts = {}) {
  const k = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(k);
}

function box(x0, y0, z0, x1, y1, z1, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(color, opts));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const loader = new GLTFLoader();
const gltfCache = new Map();
function loadGltf(name) {
  if (!gltfCache.has(name)) {
    const p = loader.loadAsync(MODEL_URL(name)).then((g) => g.scene);
    p.catch(() => gltfCache.delete(name)); // retry next time (e.g. was offline)
    gltfCache.set(name, p);
  }
  return gltfCache.get(name);
}

// Simple box in the item's bounds, used if its model can't load (e.g. offline), so it stays tappable.
function placeholder(item) {
  const b = bounds(item);
  const g = new THREE.Group();
  g.add(box(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], '#c9bba4', { transparent: true, opacity: 0.7 }));
  return g;
}

async function buildModelSafe(item) {
  try {
    return await buildModel(item);
  } catch (e) {
    console.warn('Model failed to load', item.model, e);
    return placeholder(item);
  }
}

function paletteFor(item) {
  return { ...PALETTES[item.palette], ...(item.colors ?? {}) };
}

// Procedural models for things the Kenney kit doesn't have. Built inside the item's bounds.
function procModel(name, pal, item) {
  const g = new THREE.Group();
  const add = (...a) => g.add(box(...a));
  switch (name) {
    case '@sleepingBag':
      add(0, 0, -0.45, 0.22, 0.05, 0, pal.carpet);
      add(0.03, 0.05, -0.43, 0.19, 0.06, -0.34, pal.carpetWhite);
      break;
    case '@poster':
      add(0, 0, -0.02, 0.3, 0.4, 0, pal.carpet);
      add(0.05, 0.08, 0, 0.25, 0.32, 0.005, pal.carpetWhite);
      break;
    case '@painting':
    case '@paintingLarge': {
      const [w, h] = name === '@painting' ? [0.4, 0.3] : [0.45, 0.35];
      add(0, 0, -0.03, w, h, 0, pal.wood);
      add(0.03, 0.03, 0, w - 0.03, h - 0.03, 0.004, pal.carpetBlue);
      add(0.08, 0.06, 0.004, w * 0.55, h * 0.45, 0.008, pal.carpet);
      add(w * 0.6, h * 0.55, 0.004, w * 0.8, h * 0.8, 0.008, pal.lamp);
      break;
    }
    case '@towelRack':
      add(0, 0.17, -0.06, 0.35, 0.19, -0.04, pal.metal);
      add(0.05, 0.02, -0.04, 0.3, 0.18, -0.01, pal.carpetWhite);
      break;
    case '@fireplace': {
      const stone = item.tier === 'premium' ? '#b9b2a6' : '#9b4f36';
      add(0, 0, -0.22, 0.7, 0.55, 0, stone);
      add(0.15, 0.03, -0.12, 0.55, 0.32, 0.001, '#2a2420');
      add(0.22, 0.03, -0.1, 0.48, 0.14, 0.002, '#ff9a3c', { emissive: '#ff6a00', emissiveIntensity: 0.8 });
      add(-0.03, 0.55, -0.24, 0.73, 0.62, 0.02, pal.wood);
      break;
    }
    case '@heater':
      add(0, 0, -0.1, 0.25, 0.3, 0, pal.metal);
      for (let i = 0; i < 4; i++) add(0.03, 0.06 + i * 0.05, 0, 0.22, 0.08 + i * 0.05, 0.005, '#ff5a1f', { emissive: '#ff3a00', emissiveIntensity: 0.6 });
      break;
    case '@basket':
      add(0, 0, -0.18, 0.22, 0.2, 0, pal.wood);
      add(0.02, 0.15, -0.16, 0.2, 0.21, -0.02, pal.carpetWhite);
      break;
    case '@window': {
      // Built in wall-segment space (x along the wall 0..0.5, z = wall plane)
      const f = pal.wood;
      add(0, WIN_LO - 0.02, -0.09, TW, WIN_LO + 0.02, 0.03, f); // sill
      add(0, WIN_HI - 0.03, -0.07, TW, WIN_HI, 0.01, f);
      add(0, WIN_LO, -0.07, 0.04, WIN_HI, 0.01, f);
      add(TW - 0.04, WIN_LO, -0.07, TW, WIN_HI, 0.01, f);
      add(TW / 2 - 0.015, WIN_LO, -0.06, TW / 2 + 0.015, WIN_HI, 0, f);
      const glass = new THREE.MeshLambertMaterial({ color: pal.glass, transparent: true, opacity: 0.45 });
      const pane = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.08, WIN_HI - WIN_LO - 0.05, 0.01), glass);
      pane.position.set(TW / 2, (WIN_LO + WIN_HI) / 2, -0.03);
      g.add(pane);
      break;
    }
  }
  return g;
}

async function buildModel(item) {
  const pal = paletteFor(item);
  if (item.model.startsWith('@')) return procModel(item.model, pal, item);
  const src = await loadGltf(item.model);
  const obj = src.clone(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material?.name;
    const color = pal[name] ?? (o.material?.color ? `#${o.material.color.getHexString()}` : '#cccccc');
    const transparent = name === 'glass';
    o.material = mat(color, transparent ? { transparent: true, opacity: 0.55 } : {});
    o.userData.sharedGeometry = true; // geometry is shared with the cached model
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return obj;
}

// Wrap a model so its footprint is centred at the origin, bottom at y=0 and back at the footprint's back edge.
function fitModel(model, item, d) {
  const b = bounds(item);
  const inner = new THREE.Group();
  inner.add(model);
  const cx = (b.min[0] + b.max[0]) / 2;
  // back of the model (min z) sits just inside the back edge of the footprint
  const backZ = -(d * CELL) / 2 + 0.02;
  model.position.set(-cx, -b.min[1], backZ - b.min[2]);
  return inner;
}

function floorTexture(color, tiled) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  const shade = (a) => `rgba(60,35,15,${a})`;
  if (tiled) {
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 64) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
  } else {
    // planks
    for (let i = 0; i < 4; i++) {
      g.fillStyle = shade(0.03 + (i % 2) * 0.04);
      g.fillRect(0, i * 32, 128, 32);
      g.fillStyle = shade(0.25);
      g.fillRect(0, i * 32, 128, 1.5);
      const off = (i * 47) % 128;
      g.fillRect(off, i * 32, 1.5, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Free GPU memory of meshes we built (materials are shared via matCache, so only geometries).
function clearGroup(g) {
  g.traverse((o) => {
    if (o.isMesh && !o.userData.sharedGeometry) o.geometry?.dispose();
  });
  g.clear();
}

// ---------- scene ----------

export class HouseScene {
  constructor(container, { onTap, onDrag, onDragEnd } = {}) {
    this.container = container;
    this.cb = { onTap, onDrag, onDragEnd };
    this.wallMode = 'cutaway'; // cutaway | up | down
    this.mode = { type: 'view' }; // view | floor | place
    this.state = null;
    this.itemObjects = new Map(); // uid -> Group
    this.buildToken = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.append(r.domElement);
    r.domElement.style.touchAction = 'none';

    const s = (this.scene = new THREE.Scene());
    s.add(new THREE.HemisphereLight('#fff6e8', '#8a7a66', 2.2));
    const sun = (this.sun = new THREE.DirectionalLight('#fff1dc', 2.0));
    sun.position.set(-3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    s.add(sun, sun.target);

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.cam.position.set(4, 4, 4);
    this.cam.zoom = 1;
    const c = (this.controls = new OrbitControls(this.cam, r.domElement));
    c.enableDamping = false;
    c.screenSpacePanning = false;
    c.minPolarAngle = 0.35;
    c.maxPolarAngle = 1.25;
    c.minZoom = 0.25;
    c.maxZoom = 6;
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.addEventListener('change', () => {
      this.updateWalls();
      this.requestRender();
    });

    this.groups = {};
    for (const k of ['floor', 'walls', 'items', 'overlay']) {
      this.groups[k] = new THREE.Group();
      s.add(this.groups[k]);
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.ShadowMaterial({ opacity: 0.12 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.045;
    ground.receiveShadow = true;
    s.add(ground);

    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  // ---------- rendering ----------

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.renderer.render(this.scene, this.cam);
    });
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    const aspect = w / h;
    const view = 2.2; // world units visible vertically at zoom 1
    Object.assign(this.cam, { left: (-view * aspect) / 2, right: (view * aspect) / 2, top: view / 2, bottom: -view / 2 });
    this.cam.updateProjectionMatrix();
    this.requestRender();
  }

  // Centre the camera on the house, keeping the current angle.
  frameHouse() {
    const t = this.state.house.tiles;
    const xs = t.map((a) => a.x);
    const zs = t.map((a) => a.z);
    const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * TW;
    const cz = ((Math.min(...zs) + Math.max(...zs) + 1) / 2) * TW;
    const span = Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1) * TW;
    const offset = this.cam.position.clone().sub(this.controls.target);
    this.controls.target.set(cx, 0.3, cz);
    this.cam.position.copy(this.controls.target).add(offset.setLength(8));
    this.cam.zoom = Math.min(1.1, Math.max(0.2, 0.75 / Math.max(span, 1)));
    this.cam.updateProjectionMatrix();
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx - 3, 6, cz + 4);
    const sc = this.sun.shadow.camera;
    const r = span + 1.5;
    Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: 20 });
    sc.updateProjectionMatrix();
    this.controls.update();
  }

  // ---------- build from state ----------

  async setState(state, { frame = false } = {}) {
    this.state = state;
    const token = ++this.buildToken;
    this.buildFloor();
    this.buildWalls();
    await this.buildItems(token);
    if (token !== this.buildToken) return;
    if (!this.framed || frame) {
      this.frameHouse();
      this.framed = true;
    }
    this.updateOverlay();
    this.updateWalls();
    this.requestRender();
  }

  buildFloor() {
    const g = this.groups.floor;
    clearGroup(g);
    this.floorTex ??= {};
    for (const t of this.state.house.tiles) {
      const room = ROOMS[t.room];
      this.floorTex[t.room] ??= floorTexture(room.floor, room.tiled);
      const m = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.04, TW), [
        mat('#8a6a4a'), mat('#8a6a4a'),
        new THREE.MeshLambertMaterial({ map: this.floorTex[t.room] }),
        mat('#8a6a4a'), mat('#8a6a4a'), mat('#8a6a4a'),
      ]);
      m.position.set(t.x * TW + TW / 2, -0.02, t.z * TW + TW / 2);
      m.receiveShadow = true;
      m.userData.tile = { x: t.x, z: t.z };
      g.add(m);
    }
  }

  // Each wall segment is a group in "segment space": x along the wall (0..TW), -z = outside.
  buildWalls() {
    const g = this.groups.walls;
    clearGroup(g);
    this.wallSegs = [];
    const openings = new Map();
    for (const it of this.state.house.items) {
      if (it.placed && isOpening(ITEMS[it.itemId])) openings.set(`${it.x},${it.z},${it.side}`, it);
    }
    for (const w of walls(this.state.house)) {
      const seg = new THREE.Group();
      const [ox, oz] = SIDE_OUT[w.side];
      // origin = the edge end such that segment-space +x runs along the edge
      const x0 = w.x * TW + (w.side === 'e' || w.side === 's' ? TW : 0);
      const z0 = w.z * TW + (w.side === 's' || w.side === 'w' ? TW : 0);
      seg.position.set(x0, 0, z0);
      seg.rotation.y = SIDE_ROT[w.side];
      const opening = openings.get(`${w.x},${w.z},${w.side}`) ?? this.findOpeningOnEdge(openings, w);
      seg.userData = { wall: w, out: [ox, oz], opening };
      g.add(seg);
      this.wallSegs.push(seg);
    }
  }

  findOpeningOnEdge(openings, w) {
    // inner walls: the opening may be stored on the neighbouring tile's side
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[w.side];
    const [dx, dz] = SIDE_OUT[w.side];
    return openings.get(`${w.x + dx},${w.z + dz},${opp}`);
  }

  // (Re)build each wall's meshes for the current height (full or cut away).
  updateWalls() {
    if (!this.wallSegs) return;
    const camDir = this.cam.position.clone().sub(this.controls.target).setY(0).normalize();
    const c = this.houseCenter();
    for (const seg of this.wallSegs) {
      const { wall, out, opening } = seg.userData;
      let low = this.wallMode === 'down';
      if (this.wallMode === 'cutaway') {
        if (wall.type === 'interior') {
          // Inner walls: cut the ones in the half of the house nearest the camera
          const mx = seg.position.x + Math.cos(seg.rotation.y) * (TW / 2) - c.x;
          const mz = seg.position.z - Math.sin(seg.rotation.y) * (TW / 2) - c.z;
          low = mx * camDir.x + mz * camDir.z > 0.01;
        } else {
          low = out[0] * camDir.x + out[1] * camDir.z > 0.2;
        }
      }
      const placing = this.mode.type === 'place' && this.mode.opening;
      if (placing) low = false; // show walls to place doors/windows on
      seg.userData.low = low;
      const key = `${low}|${opening?.uid ?? ''}|${opening?.itemId ?? ''}`;
      if (seg.userData.key === key) continue;
      seg.userData.key = key;
      clearGroup(seg);
      this.buildSegment(seg, wall, low, opening);
    }
    // Hide wall-mounted items whose wall is cut away (but never the one being moved)
    for (const [uid, obj] of this.itemObjects) {
      const it = this.state.house.items.find((i) => i.uid === uid);
      if (!it || ITEMS[it.itemId].kind !== 'wall') continue;
      obj.visible = (this.mode.type === 'place' && this.mode.uid === uid) || !this.isItemWallLow(it);
    }
  }

  houseCenter() {
    const t = this.state.house.tiles;
    return {
      x: (t.reduce((a, b) => a + b.x, 0) / t.length + 0.5) * TW,
      z: (t.reduce((a, b) => a + b.z, 0) / t.length + 0.5) * TW,
    };
  }

  isItemWallLow(it) {
    if (this.wallMode === 'down') return true;
    if (this.wallMode === 'up') return false;
    const [bx, bz] = BACK[it.rot];
    const { w, d } = rotatedSize(ITEMS[it.itemId], it.rot);
    const cx = Math.floor((it.x + (bx > 0 ? w - 1 : 0)) / TILE);
    const cz = Math.floor((it.z + (bz > 0 ? d - 1 : 0)) / TILE);
    const side = bz < 0 ? 'n' : bz > 0 ? 's' : bx > 0 ? 'e' : 'w';
    const seg = this.wallSegs.find((s) => {
      const wl = s.userData.wall;
      if (wl.x === cx && wl.z === cz && wl.side === side) return true;
      const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[side];
      return wl.x === cx + bx && wl.z === cz + bz && wl.side === opp;
    });
    return !!seg?.userData.low;
  }

  buildSegment(seg, wall, low, opening) {
    const inner = wall.type === 'interior';
    const z0 = inner ? -WALL_T / 2 : -WALL_T;
    const z1 = inner ? WALL_T / 2 : 0;
    const add = (y0, y1) => {
      seg.add(box(0, y0, z0, TW, y1, z1, WALL_COLOR));
      seg.add(box(0, y1 - 0.006, z0 - 0.002, TW, y1, z1 + 0.002, WALL_TOP));
    };
    const pickable = box(0, 0, z0 - 0.02, TW, low ? 0.3 : WALL_H, z1 + 0.02, '#000', { transparent: true, opacity: 0 });
    pickable.castShadow = false;
    pickable.userData.wallPick = wall;
    seg.add(pickable);
    if (low) {
      add(0, LOW_WALL);
      return;
    }
    if (!opening) {
      add(0, WALL_H);
      return;
    }
    const item = ITEMS[opening.itemId];
    if (item.kind === 'window') {
      add(0, WIN_LO);
      add(WIN_HI, WALL_H);
      const win = procModel('@window', paletteFor(item), item);
      win.position.z = inner ? 0.045 : 0.02;
      seg.add(win);
    } else {
      add(DOOR_H, WALL_H);
      const key = seg.userData.key;
      buildModelSafe(item).then((m) => {
        if (seg.userData.key !== key || !seg.parent) return; // wall was rebuilt meanwhile
        const b = bounds(item);
        m.position.set(TW / 2 - (b.min[0] + b.max[0]) / 2, 0, (z0 + z1) / 2 - (b.min[2] + b.max[2]) / 2);
        seg.add(m);
        this.requestRender();
      });
    }
  }

  async buildItems(token) {
    const items = this.state.house.items.filter((it) => it.placed && !isOpening(ITEMS[it.itemId]));
    const keep = new Set(items.map((it) => it.uid));
    for (const [uid, obj] of this.itemObjects) {
      if (!keep.has(uid)) {
        this.groups.items.remove(obj);
        clearGroup(obj);
        this.itemObjects.delete(uid);
      }
    }
    await Promise.all(
      items.map(async (it) => {
        const item = ITEMS[it.itemId];
        let obj = this.itemObjects.get(it.uid);
        if (!obj || obj.userData.itemId !== it.itemId) {
          const model = await buildModelSafe(item);
          if (token !== this.buildToken) return;
          const old = this.itemObjects.get(it.uid);
          if (old) {
            this.groups.items.remove(old);
            clearGroup(old);
          }
          obj = new THREE.Group();
          obj.userData = { uid: it.uid, itemId: it.itemId };
          obj.add(model);
          this.itemObjects.set(it.uid, obj);
          this.groups.items.add(obj);
        }
        this.positionItem(obj, item, it, checkPlacement(this.state, it.uid, it.itemId, it).y ?? 0);
      }),
    );
  }

  // Place a model group for item `item` at grid position pos {x,z,rot} resting at height y.
  positionItem(obj, item, pos, y) {
    const { w, d } = rotatedSize(item, pos.rot);
    const base = rotatedSize(item, 0);
    const model = obj.children[0];
    if (!obj.userData.fitted) {
      obj.remove(model);
      obj.add(fitModel(model, item, base.d));
      obj.userData.fitted = true;
    }
    obj.position.set((pos.x + w / 2) * CELL, item.kind === 'ceiling' ? WALL_H - (bounds(item).max[1] - bounds(item).min[1]) : y, (pos.z + d / 2) * CELL);
    obj.rotation.y = -pos.rot * (Math.PI / 2);
  }

  // ---------- modes & overlay ----------

  clearGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost.obj);
      clearGroup(this.ghost.obj);
    }
    this.ghost = null;
  }

  setMode(mode) {
    if (mode.type !== 'place' || mode.uid !== this.ghost?.uid) this.clearGhost();
    this.mode = mode;
    this.updateOverlay();
    this.updateWalls();
    this.requestRender();
  }

  setWallMode(m) {
    this.wallMode = m;
    for (const s of this.wallSegs ?? []) s.userData.key = null;
    this.updateWalls();
    this.requestRender();
  }

  async updateOverlay() {
    const gen = (this.overlayGen = (this.overlayGen ?? 0) + 1);
    const g = this.groups.overlay;
    clearGroup(g);
    if (!this.state) return;
    if (this.mode.type === 'floor') {
      for (const c of candidateTiles(this.state)) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(TW * 0.9, TW * 0.9), new THREE.MeshBasicMaterial({ color: '#5f8a55', transparent: true, opacity: 0.35 }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(c.x * TW + TW / 2, 0.003, c.z * TW + TW / 2);
        m.userData.buyTile = c;
        g.add(m);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(TW * 0.12, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(c.x * TW + TW / 2, 0.004, c.z * TW + TW / 2);
        g.add(dot);
      }
    }
    if (this.mode.type === 'place' || this.mode.type === 'selected') {
      const { uid, itemId, pos, valid } = this.mode;
      const item = ITEMS[itemId];
      if (!pos) return this.requestRender();
      if (isOpening(item)) {
        // Highlight the target wall segment
        const seg = this.wallSegs.find((s) => {
          const w = s.userData.wall;
          return (w.x === pos.x && w.z === pos.z && w.side === pos.side) || this.sameEdge(w, pos);
        });
        if (seg) {
          const color = this.mode.type === 'selected' ? '#4e6f9c' : valid?.ok === false ? '#bf4a3c' : '#5f8a55';
          const hl = box(0, 0, -0.09, TW, WALL_H + 0.02, 0.09, color, { transparent: true, opacity: 0.35 });
          hl.castShadow = false;
          const holder = new THREE.Group();
          holder.position.copy(seg.position);
          holder.rotation.copy(seg.rotation);
          holder.add(hl);
          g.add(holder);
        }
        return this.requestRender();
      }
      // The object to move: the placed item, or a ghost for something coming out of Storage.
      let obj = this.itemObjects.get(uid);
      if (!obj && this.mode.type === 'place') {
        if (this.ghost?.uid !== uid || this.ghost.itemId !== itemId) {
          this.clearGhost();
          const model = await buildModelSafe(item);
          // A newer overlay update started while loading: let it finish instead.
          if (gen !== this.overlayGen) return;
          const ghost = new THREE.Group();
          ghost.userData = { uid, itemId, ghost: true };
          ghost.add(model);
          this.scene.add(ghost);
          this.ghost = { uid, itemId, obj: ghost };
        }
        obj = this.ghost.obj;
      }
      const y = valid?.y ?? checkPlacement(this.state, uid, itemId, pos).y ?? 0;
      if (obj) this.positionItem(obj, item, pos, y);
      const { w, d } = rotatedSize(item, pos.rot);
      const ok = this.mode.type === 'selected' || valid?.ok;
      const color = this.mode.type === 'selected' ? '#4e6f9c' : ok ? '#5f8a55' : '#bf4a3c';
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(w * CELL, d * CELL),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthTest: false }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((pos.x + w / 2) * CELL, (item.kind === 'small' ? y : 0) + 0.006, (pos.z + d / 2) * CELL);
      pad.renderOrder = 10;
      pad.userData.pad = true;
      g.add(pad);
    }
    this.requestRender();
  }

  sameEdge(w, pos) {
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[pos.side];
    const [dx, dz] = SIDE_OUT[pos.side];
    return w.x === pos.x + dx && w.z === pos.z + dz && w.side === opp;
  }

  // ---------- pointer ----------

  pick(ev, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.cam);
    const visible = (o) => {
      for (; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    return { hits: this.raycaster.intersectObjects(objects, true).filter((h) => visible(h.object)), ray: this.raycaster.ray };
  }

  groundPoint(ev) {
    const { ray } = this.pick(ev, []);
    const p = new THREE.Vector3();
    return ray.intersectPlane(this.ground, p) ? p : null;
  }

  itemUidFromHit(o) {
    while (o) {
      if (o.userData?.uid) return o.userData.uid;
      o = o.parent;
    }
    return null;
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    let dragging = false;
    let pointers = 0;
    el.addEventListener('pointerdown', (ev) => {
      pointers++;
      down = { x: ev.clientX, y: ev.clientY, t: Date.now() };
      if (pointers > 1) {
        // Second finger: stop dragging the item and hand the gesture to the camera.
        if (dragging) this.cb.onDragEnd?.();
        dragging = false;
        this.controls.enabled = true;
        down = null;
        return;
      }
      dragging = false;
      if (this.mode.type !== 'place') return;
      // Start dragging if the finger lands on the item being placed (or its pad)
      const targets = [this.groups.items, this.groups.overlay, ...(this.ghost ? [this.ghost.obj] : [])];
      const { hits } = this.pick(ev, targets);
      const hitUid = hits.map((h) => this.itemUidFromHit(h.object)).find(Boolean);
      const onPad = hits.some((h) => h.object.userData.pad);
      if (hitUid === this.mode.uid || onPad) {
        dragging = true;
        this.controls.enabled = false;
        el.setPointerCapture(ev.pointerId);
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!dragging || this.mode.type !== 'place') return;
      if (this.mode.opening) {
        const { hits } = this.pick(ev, this.groups.walls.children);
        const w = hits.map((h) => h.object.userData.wallPick).find(Boolean);
        if (w) this.cb.onDrag?.({ x: w.x, z: w.z, side: w.side });
        return;
      }
      const p = this.groundPoint(ev);
      if (!p) return;
      const item = ITEMS[this.mode.itemId];
      const { w, d } = rotatedSize(item, this.mode.pos?.rot ?? 0);
      const x = Math.round(p.x / CELL - w / 2);
      const z = Math.round(p.z / CELL - d / 2);
      if (x !== this.mode.pos?.x || z !== this.mode.pos?.z) this.cb.onDrag?.({ x, z, rot: this.mode.pos?.rot ?? 0 });
    });
    const end = (ev) => {
      pointers = Math.max(0, pointers - 1);
      if (pointers === 0) this.controls.enabled = true;
      if (dragging) {
        dragging = false;
        this.controls.enabled = true;
        this.cb.onDragEnd?.();
        return;
      }
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      if (moved < 8 && Date.now() - down.t < 500) this.handleTap(ev);
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => {
      pointers = Math.max(0, pointers - 1);
      dragging = false;
      this.controls.enabled = true;
      down = null;
    });
  }

  handleTap(ev) {
    if (this.mode.type === 'floor') {
      const { hits } = this.pick(ev, this.groups.overlay.children);
      const t = hits.map((h) => h.object.userData.buyTile).find(Boolean);
      return this.cb.onTap?.({ type: 'tile', tile: t ?? null });
    }
    if (this.mode.type === 'place') {
      if (this.mode.opening) {
        const { hits } = this.pick(ev, this.groups.walls.children);
        const w = hits.map((h) => h.object.userData.wallPick).find(Boolean);
        if (w) this.cb.onDrag?.({ x: w.x, z: w.z, side: w.side });
        return;
      }
      // Tap on the floor moves the item there
      const p = this.groundPoint(ev);
      if (!p) return;
      const item = ITEMS[this.mode.itemId];
      const { w, d } = rotatedSize(item, this.mode.pos?.rot ?? 0);
      this.cb.onDrag?.({ x: Math.round(p.x / CELL - w / 2), z: Math.round(p.z / CELL - d / 2), rot: this.mode.pos?.rot ?? 0 });
      return;
    }
    // view/selected: tap an item (or a door/window) to select it
    const { hits } = this.pick(ev, [this.groups.items, this.groups.walls]);
    for (const h of hits) {
      const uid = this.itemUidFromHit(h.object);
      if (uid) return this.cb.onTap?.({ type: 'item', uid });
      let o = h.object;
      while (o && !o.userData?.wall) o = o.parent;
      if (o?.userData.opening && this.wallSegs.includes(o)) return this.cb.onTap?.({ type: 'item', uid: o.userData.opening.uid });
      if (h.object.userData.wallPick) continue;
    }
    this.cb.onTap?.({ type: 'none' });
  }

  // Render one item to a small image (for shop/storage thumbnails).
  static async thumbnail(item) {
    thumbCache ??= new Map();
    if (thumbCache.has(item.id)) return thumbCache.get(item.id);
    const p = (async () => {
      thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbRenderer.setSize(160, 160, false);
      thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#fff6e8', '#8a7a66', 2.4));
      const l = new THREE.DirectionalLight('#ffffff', 1.6);
      l.position.set(-2, 4, 3);
      scene.add(l);
      let model;
      if (item.kind === 'window') model = procModel('@window', paletteFor(item), item);
      else model = await buildModelSafe(item);
      const box3 = new THREE.Box3().setFromObject(model);
      const size = box3.getSize(new THREE.Vector3());
      const center = box3.getCenter(new THREE.Vector3());
      model.position.sub(center);
      scene.add(model);
      const r = Math.max(size.x, size.y, size.z) * 0.8 || 0.3;
      const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 50);
      cam.position.set(2, 1.6, 2.4);
      cam.lookAt(0, 0, 0);
      thumbRenderer.render(scene, cam);
      return thumbRenderer.domElement.toDataURL('image/png');
    })();
    p.catch(() => thumbCache.delete(item.id));
    thumbCache.set(item.id, p);
    return p;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

let thumbCache;
let thumbRenderer;
