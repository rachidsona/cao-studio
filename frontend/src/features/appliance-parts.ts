/**
 * Les pièces d'un appareil de la bibliothèque (features/appliance-library.ts), dans son repère : x le long de sa
 * largeur depuis sa gauche, y depuis sa face avant (0) vers le mur, z depuis son dessous (une plaque, un évier : le
 * dessous de leur corps, sous le plan de travail ; leur plateau en haut, posé dessus). Chaque pièce est une ou plusieurs formes
 * simples (pavé, pavé évidé de trous, cuve ouverte, cylindre entre deux points) avec son apparence, pour qu'un four
 * ait sa porte vitrée, sa poignée et ses manettes, un robinet son col de cygne. Pur.
 */
import type { Vec3 } from "../document/types";
import { applianceDef, finishLooks, type ApplianceCategory } from "./appliance-library";

export type ApplianceShape =
  | { kind: "box"; from: Vec3; to: Vec3; holes?: [Vec3, Vec3][] }
  | { kind: "bowl"; from: Vec3; to: Vec3; wall: number }
  | { kind: "cyl"; a: Vec3; b: Vec3; r: number };

export interface AppliancePart {
  name: string;
  /** An appearance of appearance/library.ts. */
  look: string;
  /** Joined into one body. */
  shapes: ApplianceShape[];
}

export interface ApplianceSpec {
  model: string;
  width: number;
  height: number;
  depth: number;
  finish: string;
}

const box = (from: Vec3, to: Vec3, holes?: [Vec3, Vec3][]): ApplianceShape => ({ kind: "box", from, to, ...(holes ? { holes } : {}) });
const cyl = (a: Vec3, b: Vec3, r: number): ApplianceShape => ({ kind: "cyl", a, b, r });

/** A bar handle along x (or z) in front of a face at y = `face`, on two standoffs. */
function handle(axis: "x" | "z", a: number, b: number, at: [number, number], face: number, out = 32, r = 8): ApplianceShape[] {
  const y = face - out;
  if (axis === "x") return [cyl([a, y, at[1]], [b, y, at[1]], r), cyl([a + 15, face, at[1]], [a + 15, y, at[1]], r * 0.7), cyl([b - 15, face, at[1]], [b - 15, y, at[1]], r * 0.7)];
  return [cyl([at[0], y, a], [at[0], y, b], r), cyl([at[0], face, a + 15], [at[0], y, a + 15], r * 0.7), cyl([at[0], face, b - 15], [at[0], y, b - 15], r * 0.7)];
}

function oven(W: number, H: number, D: number, L: ReturnType<typeof finishLooks>): AppliancePart[] {
  const strip = Math.min(100, H * 0.18);
  return [
    { name: "Caisse", look: L.body, shapes: [box([8, 0, 4], [W - 8, D, H - 4])] },
    { name: "Porte", look: L.face, shapes: [box([0, -22, 0], [W, 0, H - strip])] },
    { name: "Vitre", look: L.glass, shapes: [box([55, -23, 70], [W - 55, -22, H - strip - 90])] },
    { name: "Bandeau de commande", look: L.face, shapes: [box([0, -22, H - strip], [W, 0, H])] },
    { name: "Écran", look: "glass-lacquered-black", shapes: [box([W / 2 - 70, -23.5, H - strip * 0.75], [W / 2 + 70, -22, H - strip * 0.25])] },
    { name: "Manettes", look: L.trim, shapes: [cyl([90, -22, H - strip / 2], [90, -44, H - strip / 2], 17), cyl([W - 90, -22, H - strip / 2], [W - 90, -44, H - strip / 2], 17)] },
    { name: "Poignée", look: L.trim, shapes: handle("x", 45, W - 45, [0, H - strip - 40], -22) },
  ];
}

function microwave(W: number, H: number, D: number, L: ReturnType<typeof finishLooks>, free: boolean): AppliancePart[] {
  const door = W * 0.7;
  return [
    { name: "Caisse", look: free ? L.face : L.body, shapes: [box([free ? 0 : 6, 0, free ? 0 : 4], [W - (free ? 0 : 6), D, H - (free ? 0 : 4)])] },
    { name: "Porte", look: L.face, shapes: [box([0, -18, 0], [door, 0, H])] },
    { name: "Vitre", look: L.glass, shapes: [box([35, -19, 40], [door - 45, -18, H - 40])] },
    { name: "Commandes", look: "glass-lacquered-black", shapes: [box([door + 2, -18, 0], [W, 0, H])] },
    { name: "Manette", look: L.trim, shapes: [cyl([door + (W - door) / 2, -18, H * 0.45], [door + (W - door) / 2, -36, H * 0.45], 18)] },
    { name: "Poignée", look: L.trim, shapes: handle("z", 50, H - 50, [door - 25, 0], -18, 28, 7) },
  ];
}

function hob(W: number, H: number, D: number, L: ReturnType<typeof finishLooks>, gas: boolean): AppliancePart[] {
  // Its body under the worktop, its top (glass, or a plate) on it: the worktop's face is at z = H − top.
  const top = gas ? 8 : 6;
  const z = H - top;
  const body = { name: "Corps", look: "plastic-black", shapes: [box([25, 25, 0], [W - 25, D - 25, z])] };
  if (!gas) {
    const zones: [number, number, number][] = W < 400 ? [[W / 2, D * 0.3, 95], [W / 2, D * 0.72, 80]] : W >= 780 ? [[W * 0.2, D * 0.3, 95], [W * 0.2, D * 0.72, 80], [W * 0.8, D * 0.3, 80], [W * 0.8, D * 0.72, 95], [W / 2, D * 0.5, 125]] : [[W * 0.27, D * 0.3, 105], [W * 0.27, D * 0.72, 85], [W * 0.73, D * 0.3, 85], [W * 0.73, D * 0.72, 105]];
    return [
      { name: "Verre vitrocéramique", look: "glass-lacquered-black", shapes: [box([0, 0, z], [W, D, H])] },
      body,
      { name: "Foyers", look: "plastic-grey", shapes: zones.map(([x, y, r]) => cyl([x, y, H], [x, y, H + 0.4], r)) },
      { name: "Commandes tactiles", look: "plastic-grey", shapes: [box([W / 2 - Math.min(120, W * 0.35), 14, H], [W / 2 + Math.min(120, W * 0.35), 40, H + 0.4])] },
    ];
  }
  const burners: [number, number, number][] = W >= 700 ? [[W * 0.18, D * 0.5, 38], [W * 0.42, D * 0.28, 30], [W * 0.42, D * 0.72, 30], [W * 0.75, D * 0.5, 50]] : [[W * 0.27, D * 0.3, 38], [W * 0.27, D * 0.72, 28], [W * 0.73, D * 0.3, 28], [W * 0.73, D * 0.72, 45]];
  return [
    { name: "Plateau", look: L.face, shapes: [box([0, 0, z], [W, D, H])] },
    body,
    { name: "Brûleurs", look: "steel-black", shapes: burners.flatMap(([x, y, r]) => [cyl([x, y, H], [x, y, H + 18], r + 10), cyl([x, y, H + 18], [x, y, H + 24], r)]) },
    { name: "Grilles en fonte", look: "steel-black", shapes: [box([12, D * 0.12, H + 26], [W - 12, D * 0.12 + 10, H + 36]), box([12, D * 0.92 - 10, H + 26], [W - 12, D * 0.92, H + 36]), box([12, D * 0.52 - 5, H + 26], [W - 12, D * 0.52 + 5, H + 36]), ...[0.04, 0.5, 0.96].map((f) => box([W * f - 5, D * 0.12, H + 26], [W * f + 5, D * 0.92, H + 36]))] },
    { name: "Manettes", look: L.trim, shapes: [0.2, 0.4, 0.6, 0.8].map((f) => cyl([W * f, D * 0.06, H], [W * f, D * 0.06, H + 22], 16)) },
  ];
}

function hood(model: string, W: number, H: number, D: number, L: ReturnType<typeof finishLooks>): AppliancePart[] {
  if (model === "hood-builtin") {
    return [
      { name: "Groupe", look: L.body, shapes: [box([0, 0, 0], [W, D, H])] },
      { name: "Visière", look: L.face, shapes: [box([0, -6, 0], [W, 0, 45])] },
      { name: "Filtres", look: "aluminium-brushed", shapes: [box([20, 20, -1], [W - 20, D - 20, 0])] },
    ];
  }
  const canopy = model === "hood-glass" ? 380 : 70;
  return [
    { name: model === "hood-glass" ? "Façade en verre" : "Hotte", look: model === "hood-glass" ? L.face : L.face, shapes: [box([0, 0, 0], [W, D, canopy])] },
    { name: "Filtres", look: "aluminium-brushed", shapes: [box([30, 30, -1], [W - 30, D - 30, 0])] },
    { name: "Corps", look: L.face === "glass-lacquered-black" ? "steel-black" : L.face, shapes: [box([W / 2 - 150, D - 290, canopy], [W / 2 + 150, D, canopy + 180])] },
    { name: "Cheminée", look: L.face === "glass-lacquered-black" ? "steel-black" : L.face, shapes: [box([W / 2 - 125, D - 260, canopy + 180], [W / 2 + 125, D, H])] },
    { name: "Boutons", look: L.trim, shapes: [0, 1, 2, 3].map((k) => cyl([W - 60 - k * 28, 0, Math.min(35, canopy / 2)], [W - 60 - k * 28, -5, Math.min(35, canopy / 2)], 8)) },
  ];
}

function fridge(model: string, W: number, H: number, D: number, L: ReturnType<typeof finishLooks>): AppliancePart[] {
  if (model === "fridge-builtin") {
    return [
      { name: "Caisse", look: "plastic-white", shapes: [box([0, 0, 0], [W, D, H])] },
      { name: "Joint", look: "plastic-grey", shapes: [box([0, -2, H * 0.32], [W, 0, H * 0.32 + 8])] },
    ];
  }
  const sides = L.face === "glass-lacquered-black" ? "steel-black" : L.face === "glass-lacquered-white" ? "plastic-white" : L.face;
  if (model === "fridge-american") {
    return [
      { name: "Caisse", look: sides, shapes: [box([0, 45, 0], [W, D, H])] },
      { name: "Porte congélateur", look: L.face, shapes: [box([0, 0, 40], [W / 2 - 2, 45, H])] },
      { name: "Porte réfrigérateur", look: L.face, shapes: [box([W / 2 + 2, 0, 40], [W, 45, H])] },
      { name: "Distributeur d'eau", look: "glass-lacquered-black", shapes: [box([W * 0.12, -2, H * 0.48], [W * 0.36, 0, H * 0.72])] },
      { name: "Poignées", look: L.trim, shapes: [...handle("z", H * 0.3, H * 0.85, [W / 2 - 40, 0], 0, 34, 10), ...handle("z", H * 0.3, H * 0.85, [W / 2 + 40, 0], 0, 34, 10)] },
      { name: "Socle", look: "plastic-black", shapes: [box([0, 45, 0], [W, 120, 40])] },
    ];
  }
  const split = H * 0.36;
  return [
    { name: "Caisse", look: sides, shapes: [box([0, 40, 0], [W, D, H])] },
    { name: "Porte congélateur", look: L.face, shapes: [box([0, 0, 40], [W, 40, split])] },
    { name: "Porte réfrigérateur", look: L.face, shapes: [box([0, 0, split + 6], [W, 40, H])] },
    { name: "Poignées", look: L.trim, shapes: [...handle("z", split - 260, split - 40, [W - 45, 0], 0, 32, 9), ...handle("z", split + 80, split + 560, [W - 45, 0], 0, 32, 9)] },
    { name: "Socle", look: "plastic-black", shapes: [box([0, 40, 0], [W, 110, 40])] },
  ];
}

function dishwasher(model: string, W: number, H: number, D: number, L: ReturnType<typeof finishLooks>): AppliancePart[] {
  if (model === "dishwasher-builtin") {
    return [
      { name: "Cuve", look: "steel-brushed", shapes: [box([0, 20, 0], [W, D, H])] },
      { name: "Bandeau", look: "plastic-black", shapes: [box([0, 0, H - 45], [W, 20, H])] },
    ];
  }
  return [
    { name: "Caisse", look: L.face === "glass-lacquered-black" ? "steel-black" : L.face === "glass-lacquered-white" ? "plastic-white" : L.face, shapes: [box([0, 0, 0], [W, D, H])] },
    { name: "Porte", look: L.face, shapes: [box([0, -20, 90], [W, 0, H - 110])] },
    { name: "Bandeau de commande", look: "glass-lacquered-black", shapes: [box([0, -20, H - 110], [W, 0, H])] },
    { name: "Poignée", look: L.trim, shapes: handle("x", 70, W - 70, [0, H - 160], -20, 26, 7) },
    { name: "Socle", look: "plastic-black", shapes: [box([20, -5, 0], [W - 20, 0, 90])] },
  ];
}

function sink(model: string, W: number, H: number, D: number, L: ReturnType<typeof finishLooks>): AppliancePart[] {
  const granite = model === "sink-granite";
  const t = granite ? 10 : 1.5;
  const wall = granite ? 10 : 1.2;
  const [y0, y1] = [D * 0.12, D * 0.86];
  const bowls: [number, number][] = model === "sink-steel-2" ? [[W * 0.05, W * 0.48], [W * 0.52, W * 0.95]] : granite ? [[W * 0.07, W * (W < 700 ? 0.93 : 0.6)]] : [[W * 0.06, W * 0.52]];
  // Its bowls under the worktop, its plate on it (the worktop's face at z = H − t).
  const z = H - t;
  const parts: AppliancePart[] = [
    { name: "Plage", look: L.face, shapes: [box([0, 0, z], [W, D, H], bowls.map(([a, b]) => [[a, y0, z - 1], [b, y1, H + 1]]))] },
    { name: bowls.length > 1 ? "Bacs" : "Bac", look: L.body, shapes: bowls.map(([a, b]) => ({ kind: "bowl", from: [a, y0, 0], to: [b, y1, z], wall }) as ApplianceShape) },
    { name: "Bonde", look: "chrome", shapes: bowls.map(([a, b]) => cyl([(a + b) / 2, (y0 + y1) / 2, wall], [(a + b) / 2, (y0 + y1) / 2, wall + 2], 45)) },
  ];
  // The drainer: ribs on the plate beside the bowl.
  if (model === "sink-steel" || (granite && W >= 700)) {
    const [a, b] = [bowls[0]![1] + W * 0.06, W * 0.95];
    parts.push({ name: "Égouttoir", look: L.face, shapes: Array.from({ length: 7 }, (_, k) => box([a, y0 + 20 + k * ((y1 - y0 - 60) / 6), H], [b, y0 + 30 + k * ((y1 - y0 - 60) / 6), H + 2])) });
  }
  return parts;
}

function tap(model: string, W: number, H: number, D: number, L: ReturnType<typeof finishLooks>): AppliancePart[] {
  // Its base at the back of its footprint, the spout coming forward and down over the sink.
  const [x, yb] = [W / 2, D - W / 2];
  const r = model === "tap-pro" ? 17 : 15;
  const rise = H * (model === "tap-pull" ? 0.72 : 0.82);
  const reach = D - W / 2 - 20;
  // The gooseneck: a half circle from the top of the body to the front, in short straight pieces.
  const radius = reach / 2;
  const centre: Vec3 = [x, yb - radius, rise];
  const arc: ApplianceShape[] = [];
  const steps = 10;
  for (let k = 0; k < steps; k++) {
    const p = (a: number): Vec3 => [x, centre[1] + radius * Math.cos(a), centre[2] + radius * Math.sin(a)];
    arc.push(cyl(p((Math.PI * k) / steps), p((Math.PI * (k + 1)) / steps), r * 0.85));
  }
  const tip: Vec3 = [x, yb - reach, rise];
  const parts: AppliancePart[] = [
    { name: "Embase", look: L.face, shapes: [cyl([x, yb, 0], [x, yb, 12], W / 2)] },
    { name: "Corps", look: L.face, shapes: [cyl([x, yb, 12], [x, yb, rise], r), ...arc, cyl(tip, [tip[0], tip[1], rise - 70], r * 0.85)] },
    { name: "Manette", look: L.face, shapes: [cyl([x, yb, rise * 0.45], [x + 70, yb, rise * 0.45 + 25], 7), cyl([x - r, yb, rise * 0.45], [x + r, yb, rise * 0.45], r + 3)] },
  ];
  if (model === "tap-pro") parts.push({ name: "Ressort", look: L.trim, shapes: Array.from({ length: 12 }, (_, k) => cyl([x - r - 4, yb, 60 + k * ((rise - 120) / 12)], [x + r + 4, yb, 60 + k * ((rise - 120) / 12) + 6], 3)) });
  return parts;
}

/** Every piece of an appliance, in its own frame; none when its model is unknown. */
export function applianceParts(f: ApplianceSpec): AppliancePart[] {
  const def = applianceDef(f.model);
  if (!def) return [];
  const L = finishLooks(f.finish, def.category);
  const [W, H, D] = [f.width, f.height, f.depth];
  const by: Record<ApplianceCategory, () => AppliancePart[]> = {
    oven: () => oven(W, H, D, L),
    microwave: () => microwave(W, H, D, L, f.model === "microwave-free"),
    hob: () => hob(W, H, D, L, f.model === "hob-gas"),
    hood: () => hood(f.model, W, H, D, L),
    fridge: () => fridge(f.model, W, H, D, L),
    dishwasher: () => dishwasher(f.model, W, H, D, L),
    sink: () => sink(f.model, W, H, D, L),
    tap: () => tap(f.model, W, H, D, L),
  };
  return by[def.category]();
}

/** The names of its pieces, in body order. */
export const appliancePartNames = (f: ApplianceSpec): string[] => applianceParts(f).map((p) => p.name);
