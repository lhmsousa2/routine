// Everything you can buy for the house, and what it costs. Tune the economy here.
import { MODELS } from './models.js';

// ---------- grid ----------
// Kenney models: 1 unit ≈ 2 m (a wall is 1 wide, a door 1 tall).
// A floor tile is 1 m² = 0.5 units. Furniture snaps to a finer 0.5 m grid (2×2 cells per tile).
export const CELL = 0.25; // world units per placement cell (0.5 m)
export const TILE = 2; // placement cells per floor tile (1 m)
export const WALL_H = 1.29; // wall height in world units (Kenney wall)
export const WALL_T = 0.05; // wall thickness

// ---------- economy ----------
export const tilePrice = (tilesOwned) => 50 + 3 * tilesOwned;
export const SELL_RATE = 0.25; // items in Storage sell for 25% of their price

// ---------- palettes (Kenney material name → colour). House colours never follow app theme. ----------
export const PALETTES = {
  // Cheap: deliberately clashing plastic
  plastic: {
    wood: '#f4f4f0', woodDark: '#d8d8d2', carpet: '#ff3fa4', carpetDarker: '#c2187a', carpetWhite: '#b6ff3b',
    carpetBlue: '#18c1ff', metal: '#ff8a00', metalDark: '#7a2cff', metalMedium: '#00b3a6', metalLight: '#ffffff',
    glass: '#9ef0ff', plant: '#39ff6a', lamp: '#fff36b', fur: '#ff8ad8', _defaultMat: '#ffffff',
  },
  cardboard: {
    wood: '#c9a26b', woodDark: '#a98250', metal: '#8c8c8c', _defaultMat: '#c9a26b',
  },
  // Standard: warm rustic (oak, terracotta, cream linen, black iron)
  rustic: {
    wood: '#a8784e', woodDark: '#714b2f', carpet: '#c46a43', carpetDarker: '#8e4630', carpetWhite: '#efe5d2',
    carpetBlue: '#6b7d55', metal: '#3b3631', metalDark: '#2b2723', metalMedium: '#4a433c', metalLight: '#e9dfca',
    glass: '#c9d8cf', plant: '#5a8a4a', lamp: '#ffd98a', fur: '#8a5a3a', _defaultMat: '#efe5d2',
  },
  // Premium: rustic+ (walnut, forest-green velvet, brass)
  premium: {
    wood: '#7a4e2d', woodDark: '#4f3220', carpet: '#4f6b4a', carpetDarker: '#354a32', carpetWhite: '#f3ead8',
    carpetBlue: '#a2512f', metal: '#b8944f', metalDark: '#6d5a3a', metalMedium: '#8c7246', metalLight: '#2f4b3c',
    glass: '#d7e3da', plant: '#3f7a3a', lamp: '#ffd27a', fur: '#6b4429', _defaultMat: '#f3ead8',
  },
};
// Porcelain things (toilets, sinks, tubs) stay white-ish in good tiers.
const PORCELAIN = { carpetWhite: '#f7f3ea', metalLight: '#f2ede2', _defaultMat: '#f7f3ea' };

// ---------- rooms ----------
export const ROOMS = {
  bedroom: { name: 'Bedroom', unlock: 0, floor: '#b78a5f' },
  hallway: { name: 'Hallway', unlock: 150, floor: '#b5a58c' },
  living: { name: 'Living room', unlock: 300, floor: '#a87a51' },
  kitchen: { name: 'Kitchen', unlock: 400, floor: '#c98a62', tiled: true },
  dining: { name: 'Dining room', unlock: 250, floor: '#9c6b45' },
  bathroom: { name: 'Bathroom', unlock: 350, floor: '#e3d8c5', tiled: true },
  office: { name: 'Office', unlock: 250, floor: '#b08560' },
  laundry: { name: 'Laundry', unlock: 200, floor: '#d2c7b4', tiled: true },
};
// Shop sections: rooms + general sections
export const SECTIONS = [
  ...Object.entries(ROOMS).map(([id, r]) => ({ id, name: r.name })),
  { id: 'decor', name: 'Decor' },
  { id: 'structure', name: 'Doors & windows' },
];

export const TIERS = { cheap: 'Cheap', standard: 'Standard', premium: 'Premium' };

// Procedural models (not in the Kenney kit): drawn in code. Sizes in world units.
export const PROC = {
  '@sleepingBag': { min: [0, 0, -0.45], max: [0.22, 0.06, 0] },
  '@window': { min: [0, 0.35, -0.09], max: [0.5, 1.0, 0] },
  '@poster': { min: [0, 0, -0.02], max: [0.3, 0.4, 0] },
  '@painting': { min: [0, 0, -0.03], max: [0.4, 0.3, 0] },
  '@paintingLarge': { min: [0, 0, -0.03], max: [0.45, 0.35, 0] },
  '@towelRack': { min: [0, 0, -0.06], max: [0.35, 0.2, 0] },
  '@fireplace': { min: [0, 0, -0.22], max: [0.7, 0.62, 0] },
  '@heater': { min: [0, 0, -0.1], max: [0.25, 0.3, 0] },
  '@basket': { min: [0, 0, -0.18], max: [0.22, 0.2, 0] },
};

// ---------- items ----------
// kind:
//   floor  – stands on the floor (beds, sofas). `surface: true` lets small items sit on top.
//   small  – lamps, plants, TV… on the floor or on top of a surface item.
//   rug    – lies on the floor, furniture can stand on it.
//   wall   – hangs on a wall; `mount` = height of its bottom edge.
//   ceiling– hangs from the ceiling.
//   window / door / frontdoor – placed in a wall segment.
// Each product has 3 tiers. Format: [product, name, section, kind, extras, cheap, standard, premium]
// where each tier is [model, palette, price, displayName?].
const P = (product, name, section, kind, extras, cheap, standard, premium) => ({ product, name, section, kind, extras, tiers: { cheap, standard, premium } });

const PRODUCTS = [
  // Bedroom
  P('bed', 'Bed', 'bedroom', 'floor', {}, ['bedSingle', 'plastic', 40, 'Air mattress'], ['bedSingle', 'rustic', 200, 'Pine bed'], ['bedDouble', 'premium', 500, 'Walnut double bed']),
  P('nightstand', 'Nightstand', 'bedroom', 'floor', { surface: true }, ['cardboardBoxClosed', 'cardboard', 10, 'Cardboard box'], ['cabinetBed', 'rustic', 60, 'Oak nightstand'], ['cabinetBedDrawer', 'premium', 150, 'Walnut nightstand']),
  P('bedlamp', 'Bedside lamp', 'bedroom', 'small', {}, ['lampSquareTable', 'plastic', 10, 'Clip lamp'], ['lampRoundTable', 'rustic', 40, 'Linen lamp'], ['lampRoundTable', 'premium', 120, 'Brass lamp']),
  P('wardrobe', 'Wardrobe', 'bedroom', 'floor', {}, ['coatRackStanding', 'plastic', 30, 'Clothes rack'], ['bookcaseClosedDoors', 'rustic', 180, 'Pine wardrobe'], ['bookcaseClosedWide', 'premium', 450, 'Walnut armoire']),
  P('dresser', 'Dresser', 'bedroom', 'floor', { surface: true }, ['cardboardBoxOpen', 'cardboard', 20, 'Box drawers'], ['sideTableDrawers', 'rustic', 120, 'Oak dresser'], ['bathroomCabinetDrawer', 'premium', 300, 'Walnut chest']),
  P('mirror', 'Mirror', 'bedroom', 'wall', { mount: 0.45 }, ['bathroomMirror', 'plastic', 15, 'Plastic mirror'], ['bathroomMirror', 'rustic', 60, 'Oak mirror'], ['bathroomMirror', 'premium', 150, 'Brass mirror']),
  P('bedrug', 'Bedroom rug', 'bedroom', 'rug', {}, ['rugDoormat', 'plastic', 10, 'Bath mat'], ['rugRectangle', 'rustic', 80, 'Wool rug'], ['rugRound', 'premium', 200, 'Round velvet rug']),

  // Hallway
  P('coatrack', 'Coat hooks', 'hallway', 'wall', { mount: 0.6 }, ['coatRack', 'plastic', 10, 'Plastic hooks'], ['coatRack', 'rustic', 50, 'Iron hooks'], ['coatRack', 'premium', 120, 'Brass hooks']),
  P('shoecab', 'Shoe cabinet', 'hallway', 'floor', { surface: true }, ['bookcaseOpenLow', 'plastic', 15, 'Plastic shoe rack'], ['bookcaseOpenLow', 'rustic', 80, 'Oak shoe cabinet'], ['bookcaseOpenLow', 'premium', 180, 'Walnut shoe cabinet']),
  P('bench', 'Bench', 'hallway', 'floor', {}, ['benchCushionLow', 'plastic', 20, 'Plastic stool'], ['bench', 'rustic', 80, 'Oak bench'], ['benchCushion', 'premium', 200, 'Cushioned bench']),
  P('sconce', 'Wall light', 'hallway', 'wall', { mount: 0.75 }, ['lampWall', 'plastic', 10, 'Plastic sconce'], ['lampWall', 'rustic', 50, 'Iron sconce'], ['lampWall', 'premium', 130, 'Brass sconce']),
  P('doormat', 'Doormat', 'hallway', 'rug', {}, ['rugDoormat', 'plastic', 5, 'Neon mat'], ['rugDoormat', 'rustic', 20, 'Coir mat'], ['rugDoormat', 'premium', 50, 'Wool mat']),

  // Living room
  P('sofa', 'Sofa', 'living', 'floor', {}, ['loungeDesignSofa', 'plastic', 60, 'Inflatable sofa'], ['loungeSofa', 'rustic', 250, 'Linen sofa'], ['loungeSofaCorner', 'premium', 650, 'Velvet corner sofa']),
  P('armchair', 'Armchair', 'living', 'floor', {}, ['loungeDesignChair', 'plastic', 30, 'Plastic chair'], ['loungeChair', 'rustic', 150, 'Linen armchair'], ['loungeChairRelax', 'premium', 350, 'Velvet recliner']),
  P('coffeetable', 'Coffee table', 'living', 'floor', { surface: true }, ['tableCoffeeGlassSquare', 'plastic', 20, 'Plastic table'], ['tableCoffee', 'rustic', 100, 'Oak coffee table'], ['tableCoffee', 'premium', 250, 'Walnut coffee table']),
  P('tv', 'TV', 'living', 'small', {}, ['televisionVintage', 'plastic', 40, 'Old CRT'], ['televisionModern', 'rustic', 200, 'Flat TV'], ['televisionModern', 'premium', 450, 'Big flat TV']),
  P('tvstand', 'TV stand', 'living', 'floor', { surface: true }, ['bookcaseOpenLow', 'plastic', 20, 'Plastic shelf'], ['cabinetTelevision', 'rustic', 120, 'Oak TV bench'], ['cabinetTelevisionDoors', 'premium', 300, 'Walnut media cabinet']),
  P('bookshelf', 'Bookshelf', 'living', 'floor', {}, ['bookcaseOpenLow', 'plastic', 25, 'Plastic shelf'], ['bookcaseOpen', 'rustic', 120, 'Oak bookshelf'], ['bookcaseOpen', 'premium', 300, 'Walnut bookshelf']),
  P('floorlamp', 'Floor lamp', 'living', 'floor', {}, ['lampSquareFloor', 'plastic', 15, 'Plastic lamp'], ['lampRoundFloor', 'rustic', 70, 'Linen floor lamp'], ['lampRoundFloor', 'premium', 180, 'Brass floor lamp']),
  P('sidetable', 'Side table', 'living', 'floor', { surface: true }, ['sideTable', 'plastic', 15, 'Plastic side table'], ['sideTable', 'rustic', 60, 'Oak side table'], ['sideTableDrawers', 'premium', 150, 'Walnut side table']),
  P('livingrug', 'Living room rug', 'living', 'rug', {}, ['rugSquare', 'plastic', 15, 'Neon rug'], ['rugRounded', 'rustic', 120, 'Terracotta rug'], ['rugRectangle', 'premium', 280, 'Velvet rug']),
  P('fireplace', 'Fireplace', 'living', 'floor', { surface: true }, ['@heater', 'plastic', 30, 'Electric heater'], ['@fireplace', 'rustic', 300, 'Brick fireplace'], ['@fireplace', 'premium', 700, 'Stone fireplace']),
  P('speaker', 'Music', 'living', 'small', {}, ['radio', 'plastic', 15, 'Plastic radio'], ['speakerSmall', 'rustic', 60, 'Oak speaker'], ['speaker', 'premium', 200, 'Tall speaker']),
  P('fan', 'Ceiling fan', 'living', 'ceiling', {}, ['ceilingFan', 'plastic', 40, 'Plastic fan'], ['ceilingFan', 'rustic', 120, 'Oak fan'], ['ceilingFan', 'premium', 260, 'Brass fan']),

  // Kitchen
  P('counter', 'Counter', 'kitchen', 'floor', { surface: true }, ['kitchenCabinet', 'plastic', 30, 'Plastic counter'], ['kitchenCabinet', 'rustic', 120, 'Oak counter'], ['kitchenCabinetDrawer', 'premium', 250, 'Walnut counter']),
  P('cornercounter', 'Corner counter', 'kitchen', 'floor', { surface: true }, ['kitchenCabinetCornerInner', 'plastic', 30, 'Plastic corner'], ['kitchenCabinetCornerInner', 'rustic', 120, 'Oak corner'], ['kitchenCabinetCornerInner', 'premium', 250, 'Walnut corner']),
  P('kitchensink', 'Kitchen sink', 'kitchen', 'floor', {}, ['kitchenSink', 'plastic', 50, 'Plastic sink'], ['kitchenSink', 'rustic', 180, 'Farmhouse sink'], ['kitchenSink', 'premium', 400, 'Walnut & brass sink']),
  P('stove', 'Stove', 'kitchen', 'floor', {}, ['kitchenStoveElectric', 'plastic', 60, 'Hot plate stove'], ['kitchenStove', 'rustic', 250, 'Cream range'], ['kitchenStove', 'premium', 550, 'Green enamel range']),
  P('fridge', 'Fridge', 'kitchen', 'floor', {}, ['kitchenFridgeSmall', 'plastic', 60, 'Mini fridge'], ['kitchenFridge', 'rustic', 300, 'Cream fridge'], ['kitchenFridgeLarge', 'premium', 650, 'Big green fridge']),
  P('uppercab', 'Wall cabinet', 'kitchen', 'wall', { mount: 0.68 }, ['kitchenCabinetUpperLow', 'plastic', 20, 'Plastic cabinet'], ['kitchenCabinetUpper', 'rustic', 90, 'Oak cabinet'], ['kitchenCabinetUpperDouble', 'premium', 200, 'Walnut cabinet']),
  P('hood', 'Range hood', 'kitchen', 'wall', { mount: 0.72 }, ['hoodModern', 'plastic', 30, 'Plastic hood'], ['hoodLarge', 'rustic', 100, 'Iron hood'], ['hoodLarge', 'premium', 220, 'Brass hood']),
  P('microwave', 'Microwave', 'kitchen', 'small', {}, ['kitchenMicrowave', 'plastic', 30, 'Plastic microwave'], ['kitchenMicrowave', 'rustic', 90, 'Cream microwave'], ['kitchenMicrowave', 'premium', 200, 'Green microwave']),
  P('coffee', 'Coffee machine', 'kitchen', 'small', {}, ['kitchenCoffeeMachine', 'plastic', 20, 'Pod machine'], ['kitchenCoffeeMachine', 'rustic', 80, 'Cream espresso'], ['kitchenCoffeeMachine', 'premium', 220, 'Brass espresso']),
  P('toaster', 'Toaster', 'kitchen', 'small', {}, ['toaster', 'plastic', 10, 'Plastic toaster'], ['toaster', 'rustic', 40, 'Cream toaster'], ['toaster', 'premium', 100, 'Brass toaster']),
  P('stool', 'Bar stool', 'kitchen', 'floor', {}, ['stoolBarSquare', 'plastic', 15, 'Plastic stool'], ['stoolBar', 'rustic', 60, 'Oak stool'], ['stoolBar', 'premium', 140, 'Velvet stool']),
  P('trash', 'Trash can', 'kitchen', 'floor', {}, ['trashcan', 'plastic', 10, 'Plastic bin'], ['trashcan', 'rustic', 40, 'Iron bin'], ['trashcan', 'premium', 90, 'Brass bin']),

  // Dining
  P('diningtable', 'Dining table', 'dining', 'floor', { surface: true }, ['tableGlass', 'plastic', 40, 'Folding table'], ['table', 'rustic', 200, 'Oak table'], ['tableCrossCloth', 'premium', 480, 'Walnut farm table']),
  P('diningchair', 'Dining chair', 'dining', 'floor', {}, ['chairModernCushion', 'plastic', 15, 'Plastic chair'], ['chair', 'rustic', 60, 'Oak chair'], ['chairCushion', 'premium', 150, 'Cushioned chair']),
  P('sideboard', 'Sideboard', 'dining', 'floor', { surface: true }, ['cabinetTelevision', 'plastic', 30, 'Plastic sideboard'], ['cabinetTelevisionDoors', 'rustic', 180, 'Oak sideboard'], ['cabinetTelevisionDoors', 'premium', 400, 'Walnut sideboard']),
  P('pendant', 'Pendant lamp', 'dining', 'ceiling', {}, ['lampSquareCeiling', 'plastic', 15, 'Plastic pendant'], ['lampSquareCeiling', 'rustic', 60, 'Iron pendant'], ['lampSquareCeiling', 'premium', 160, 'Brass pendant']),

  // Bathroom
  P('toilet', 'Toilet', 'bathroom', 'floor', {}, ['toiletSquare', 'plastic', 50, 'Camping toilet'], ['toiletSquare', 'rustic', 150, 'Toilet'], ['toilet', 'premium', 350, 'Classic toilet']),
  P('bathsink', 'Bathroom sink', 'bathroom', 'floor', {}, ['bathroomSink', 'plastic', 40, 'Plastic basin'], ['bathroomSinkSquare', 'rustic', 150, 'Oak vanity'], ['bathroomSinkSquare', 'premium', 350, 'Walnut vanity']),
  P('shower', 'Shower', 'bathroom', 'floor', {}, ['showerRound', 'plastic', 80, 'Plastic shower'], ['shower', 'rustic', 300, 'Tiled shower'], ['shower', 'premium', 600, 'Brass rain shower']),
  P('bathtub', 'Bathtub', 'bathroom', 'floor', {}, ['bathtub', 'plastic', 120, 'Plastic tub'], ['bathtub', 'rustic', 400, 'Enamel tub'], ['bathtub', 'premium', 800, 'Claw-foot tub']),
  P('bathcab', 'Mirror cabinet', 'bathroom', 'wall', { mount: 0.5 }, ['bathroomCabinet', 'plastic', 20, 'Plastic cabinet'], ['bathroomCabinet', 'rustic', 80, 'Oak cabinet'], ['bathroomCabinet', 'premium', 200, 'Brass cabinet']),
  P('towel', 'Towel rack', 'bathroom', 'wall', { mount: 0.4 }, ['@towelRack', 'plastic', 10, 'Plastic rack'], ['@towelRack', 'rustic', 40, 'Iron rack'], ['@towelRack', 'premium', 100, 'Brass rack']),
  P('bathmat', 'Bath mat', 'bathroom', 'rug', {}, ['rugDoormat', 'plastic', 5, 'Neon bath mat'], ['rugDoormat', 'rustic', 25, 'Cotton bath mat'], ['rugDoormat', 'premium', 60, 'Velvet bath mat']),

  // Office
  P('desk', 'Desk', 'office', 'floor', { surface: true }, ['desk', 'plastic', 40, 'Plastic desk'], ['desk', 'rustic', 180, 'Oak desk'], ['deskCorner', 'premium', 420, 'Walnut corner desk']),
  P('officechair', 'Office chair', 'office', 'floor', {}, ['chairModernFrameCushion', 'plastic', 20, 'Plastic chair'], ['chairDesk', 'rustic', 120, 'Desk chair'], ['chairDesk', 'premium', 280, 'Leather desk chair']),
  P('computer', 'Computer', 'office', 'small', {}, ['laptop', 'plastic', 80, 'Old laptop'], ['computerScreen', 'rustic', 250, 'Desktop computer'], ['computerScreen', 'premium', 500, 'Big screen']),
  P('keyboard', 'Keyboard', 'office', 'small', {}, ['computerKeyboard', 'plastic', 10, 'Plastic keyboard'], ['computerKeyboard', 'rustic', 30, 'Keyboard'], ['computerKeyboard', 'premium', 80, 'Brass keyboard']),
  P('filing', 'Filing cabinet', 'office', 'floor', { surface: true }, ['cabinetBedDrawer', 'plastic', 20, 'Plastic drawers'], ['bookcaseClosed', 'rustic', 120, 'Oak archive shelf'], ['bookcaseClosedDoors', 'premium', 280, 'Walnut cabinet']),
  P('desklamp', 'Desk lamp', 'office', 'small', {}, ['lampSquareTable', 'plastic', 10, 'Plastic lamp'], ['lampSquareTable', 'rustic', 40, 'Iron lamp'], ['lampRoundTable', 'premium', 110, 'Brass desk lamp']),

  // Laundry
  P('washer', 'Washing machine', 'laundry', 'floor', { surface: true }, ['washer', 'plastic', 80, 'Mini washer'], ['washer', 'rustic', 300, 'Cream washer'], ['washer', 'premium', 600, 'Green washer']),
  P('dryer', 'Dryer', 'laundry', 'floor', { surface: true }, ['dryer', 'plastic', 80, 'Mini dryer'], ['dryer', 'rustic', 300, 'Cream dryer'], ['dryer', 'premium', 600, 'Green dryer']),
  P('basket', 'Laundry basket', 'laundry', 'floor', {}, ['@basket', 'plastic', 10, 'Plastic basket'], ['@basket', 'rustic', 35, 'Wicker basket'], ['@basket', 'premium', 80, 'Woven basket']),
  P('laundryshelf', 'Laundry shelf', 'laundry', 'wall', { mount: 0.65 }, ['kitchenCabinetUpperLow', 'plastic', 15, 'Plastic shelf'], ['kitchenCabinetUpperLow', 'rustic', 60, 'Oak shelf'], ['kitchenCabinetUpperLow', 'premium', 140, 'Walnut shelf']),

  // Decor (any room)
  P('plant', 'Plant', 'decor', 'small', {}, ['plantSmall1', 'plastic', 10, 'Plastic plant'], ['plantSmall2', 'rustic', 30, 'Small plant'], ['pottedPlant', 'premium', 120, 'Big potted plant']),
  P('art', 'Wall art', 'decor', 'wall', { mount: 0.5 }, ['@poster', 'plastic', 10, 'Neon poster'], ['@painting', 'rustic', 60, 'Framed print'], ['@paintingLarge', 'premium', 200, 'Oil painting']),
  P('books', 'Books', 'decor', 'small', {}, ['books', 'plastic', 10, 'Comics'], ['books', 'rustic', 30, 'Books'], ['books', 'premium', 80, 'Leather books']),
  P('teddy', 'Teddy bear', 'decor', 'small', {}, ['bear', 'plastic', 10, 'Neon teddy'], ['bear', 'rustic', 30, 'Teddy'], ['bear', 'premium', 80, 'Vintage teddy']),

  // Doors & windows (placed in walls)
  P('window', 'Window', 'structure', 'window', {}, ['@window', 'plastic', 40, 'Plastic window'], ['@window', 'rustic', 150, 'Oak window'], ['@window', 'premium', 300, 'Walnut window']),
  P('frontdoor', 'Front door', 'structure', 'frontdoor', {}, ['doorwayFront', 'plastic', 80, 'Plastic door'], ['doorwayFront', 'rustic', 250, 'Oak front door'], ['doorwayFront', 'premium', 500, 'Walnut front door']),
  P('door', 'Inside door', 'structure', 'door', {}, ['doorway', 'plastic', 40, 'Plastic door'], ['doorway', 'rustic', 150, 'Oak door'], ['doorway', 'premium', 300, 'Walnut door']),
];

const PORCELAIN_PRODUCTS = new Set(['toilet', 'bathsink', 'shower', 'bathtub']);

export const ITEMS = {};
for (const p of PRODUCTS) {
  for (const [tier, [model, palette, price, displayName]] of Object.entries(p.tiers)) {
    const id = `${p.product}-${tier}`;
    ITEMS[id] = {
      id,
      product: p.product,
      productName: p.name,
      name: displayName ?? p.name,
      section: p.section,
      kind: p.kind,
      tier,
      model,
      palette,
      colors: tier !== 'cheap' && PORCELAIN_PRODUCTS.has(p.product) ? PORCELAIN : null,
      price,
      ...p.extras,
    };
  }
}
// Starter item: free, not sold in the shop.
ITEMS['bed-starter'] = {
  id: 'bed-starter', product: 'bed', productName: 'Bed', name: 'Sleeping bag', section: 'bedroom',
  kind: 'floor', tier: 'starter', model: '@sleepingBag', palette: 'plastic', colors: null, price: 0, hidden: true,
};

export const TIER_ORDER = ['starter', 'cheap', 'standard', 'premium'];

export function bounds(item) {
  return PROC[item.model] ?? MODELS[item.model];
}

// Size in placement cells at rotation 0 (w along x, d along z).
export function footprint(item) {
  if (['window', 'door', 'frontdoor'].includes(item.kind)) return { w: TILE, d: 1 };
  const b = bounds(item);
  const cells = (len) => Math.max(1, Math.ceil(len / CELL - 0.3));
  return { w: cells(b.max[0] - b.min[0]), d: cells(b.max[2] - b.min[2]) };
}

export function height(item) {
  const b = bounds(item);
  return b.max[1] - b.min[1];
}

export function shopProducts(section) {
  const seen = new Map();
  for (const it of Object.values(ITEMS)) {
    if (it.hidden || it.section !== section) continue;
    if (!seen.has(it.product)) seen.set(it.product, { product: it.product, name: it.productName, tiers: [] });
    seen.get(it.product).tiers.push(it);
  }
  return [...seen.values()];
}
