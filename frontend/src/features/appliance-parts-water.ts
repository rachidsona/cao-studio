/**
 * Les pièces des hottes, des éviers et des robinets : hotte murale (casquette, corps au devant incliné, cheminée
 * télescopique en deux parties, filtres en cassettes, éclairage, boutons), hotte inclinée en verre, hotte îlot (la
 * cheminée au milieu), groupe filtrant intégré (visière, commandes), hotte box (un bloc net, sa cheminée), hotte verticale
 * (un verre droit, aspiration tout autour du bas), hotte suspendue (un cylindre pendu par des câbles) ; évier inox ou granit (plage, bacs, bonde,
 * trop-plein, égouttoir) ; mitigeur (embase, corps et col de cygne, manette, mousseur, ressort). Repère de
 * features/appliance-parts.ts. Pur.
 */
import type { Vec3 } from "../document/types";
import { box, cyl, prism, type AppliancePart, type ApplianceShape, type Looks } from "./appliance-shapes";

/** Its filters, in cassettes side by side under its canopy (z 0…1). */
function filters(W: number, y0: number, y1: number): ApplianceShape[] {
  const n = W >= 800 ? 3 : 2;
  const step = (W - 60) / n;
  return Array.from({ length: n }, (_, k) => box([30 + k * step + 2, y0, 0], [30 + (k + 1) * step - 2, y1, 1]));
}

/** Two lights under its canopy, in its front band (y about `y`). */
const lights = (W: number, y: number): ApplianceShape[] => [W * 0.25, W * 0.75].map((x) => cyl([x, y, 0.2], [x, y, 1], 10));

/**
 * A box hood (a block, square, its touch keys on its front) or a vertical one (upright glass against the wall, drawing
 * in all round its bottom), each with its chimney in two telescopic parts up to its top.
 */
function modern(vertical: boolean, W: number, H: number, D: number, L: Looks, metal: string): AppliancePart[] {
  const head = Math.min(vertical ? 560 : 300, H * (vertical ? 0.6 : 0.4));
  const gap = vertical ? 40 : 0;
  const base = Math.min(head + 20, H - 20);
  const mid = base + (H - base) / 2;
  const [c0, c1] = [D - 260, D];
  return [
    vertical
      ? { name: "Façade en verre", look: L.face, shapes: [box([0, 0, gap], [W, 8, head])] }
      : { name: "Hotte", look: L.face, shapes: [box([0, 0, 1], [W, D, head])] },
    { name: "Filtres", look: "aluminium-brushed", shapes: vertical ? [box([20, 12, gap - 1], [W - 20, D - 20, gap])] : filters(W, 40, D - 30) },
    // The vertical one's body behind its glass, open all round its bottom (perimeter suction).
    { name: "Corps", look: metal, shapes: vertical ? [box([10, 8, gap], [W - 10, D, head])] : [box([W / 2 - 150, D - 300, head], [W / 2 + 150, D, base])] },
    { name: "Cheminée", look: metal, shapes: [box([W / 2 - 130, c0, base], [W / 2 + 130, c1, mid])] },
    { name: "Boutons", look: "display-white", shapes: [0, 1, 2, 3].map((k) => (vertical ? box([W / 2 - 60 + k * 32, -1, head - 50], [W / 2 - 44 + k * 32, 0, head - 42]) : box([W / 2 - 60 + k * 32, -1, head / 2 - 4], [W / 2 - 44 + k * 32, 0, head / 2 + 4]))) },
    { name: "Cheminée haute", look: metal, shapes: [box([W / 2 - 124, c0 + 6, mid], [W / 2 + 124, c1, H])] },
    // A LED band all along the bottom of its glass, or two lights under the box.
    { name: "Éclairage", look: "led-neutral", shapes: vertical ? [box([20, 1, gap], [W - 20, 7, gap + 3])] : lights(W, 20) },
  ];
}

/** A pendant hood: a cylinder hung from the ceiling by three cables, its filter and its ring of lights underneath. */
function pendant(W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const [x, y, r] = [W / 2, D / 2, Math.min(W, D) / 2 - 1];
  const body = Math.min(420, H * 0.6);
  return [
    { name: "Hotte", look: L.face, shapes: [cyl([x, y, 1], [x, y, body], r)] },
    { name: "Filtres", look: "aluminium-brushed", shapes: [cyl([x, y, 0], [x, y, 1], r * 0.65)] },
    { name: "Câbles", look: "chrome", shapes: [0, 1, 2].map((k) => { const t = (k * 2 * Math.PI) / 3; const [cx, cy] = [x + r * 0.6 * Math.cos(t), y + r * 0.6 * Math.sin(t)]; return cyl([cx, cy, body], [cx, cy, H], 1.5); }) },
    { name: "Éclairage", look: "led-neutral", shapes: Array.from({ length: 6 }, (_, k) => { const t = (k * Math.PI) / 3; const [cx, cy] = [x + r * 0.82 * Math.cos(t), y + r * 0.82 * Math.sin(t)]; return cyl([cx, cy, 0.2], [cx, cy, 1], 8); }) },
  ];
}

/** A hood. The first pieces of each model keep their order (saved documents). */
export function hood(model: string, W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const metal = L.face === "glass-lacquered-black" ? "steel-black" : L.face === "glass-lacquered-white" ? "plastic-white" : L.face;
  if (model === "hood-builtin") {
    return [
      { name: "Groupe", look: L.body, shapes: [box([0, 0, 1], [W, D, H])] },
      { name: "Visière", look: L.face, shapes: [box([0, -6, 1], [W, 0, 45])] },
      { name: "Filtres", look: "aluminium-brushed", shapes: [box([20, 22, 0], [W - 20, D - 20, 1])] },
      { name: "Commandes", look: L.trim, shapes: [0, 1, 2].map((k) => cyl([W - 50 - k * 26, -6, 23], [W - 50 - k * 26, -9, 23], 6)) },
      { name: "Éclairage", look: "led-neutral", shapes: lights(W, 11).map((s) => (s.kind === "cyl" ? { ...s, r: 8 } : s)) },
    ];
  }
  if (model === "hood-pendant") return pendant(W, H, D, L);
  const island = model === "hood-island";
  const glass = model === "hood-glass";
  // Its head (a canopy, or the glass hood's slanted body), its body over it, then its chimney up to its top in two
  // telescopic parts — all inside its height, however low the ceiling.
  const head = glass ? Math.min(400, H * 0.45) : island ? 80 : 70;
  const base = Math.min(head + (glass ? 0 : island ? 160 : 200), H - 20);
  const mid = base + (H - base) / 2;
  const [c0, c1] = island ? [D / 2 - 130, D / 2 + 130] : [D - 260, D];
  const lower = box([W / 2 - 130, c0, base], [W / 2 + 130, c1, mid]);
  const upper = box([W / 2 - 124, c0 + 6, mid], [W / 2 + 124, c1 - (island ? 6 : 0), H]);
  if (model === "hood-box" || model === "hood-vertical") return modern(model === "hood-vertical", W, H, D, L, metal);
  if (glass) {
    // The slanted glass from its bottom front to the top of its head, the body just behind it.
    const [a, b]: [[number, number], [number, number]] = [[0, 8], [D - 180, head]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: [number, number] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const on = (t: number, out: number): Vec3 => [0, a[0] + (b[0] - a[0]) * t + n[0] * out, a[1] + (b[1] - a[1]) * t + n[1] * out];
    return [
      { name: "Façade en verre", look: L.face, shapes: [prism(0, W, [a, b, [b[0] + 5, b[1]], [a[0] + 5, a[1] - 5]])] },
      { name: "Filtres", look: "aluminium-brushed", shapes: filters(W, 40, D - 30) },
      { name: "Corps", look: metal, shapes: [prism(0, W, [[8, 1], [D, 1], [D, head], [D - 174, head]])] },
      { name: "Cheminée", look: metal, shapes: [lower] },
      { name: "Boutons", look: "display-white", shapes: [0, 1, 2, 3].map((k) => { const [, y, z] = on(0.12, 0); const x = W / 2 - 54 + k * 36; return cyl([x, y - n[0] * 0.5, z - n[1] * 0.5], [x, y + n[0] * 1, z + n[1] * 1], 6); }) },
      { name: "Cheminée haute", look: metal, shapes: [upper] },
      { name: "Éclairage", look: "led-neutral", shapes: lights(W, 24) },
    ];
  }
  return [
    { name: "Hotte", look: L.face, shapes: [box([0, 0, 1], [W, D, head])] },
    { name: "Filtres", look: "aluminium-brushed", shapes: filters(W, 40, D - 30) },
    // Its body over the canopy, its front slanted back up to the chimney.
    { name: "Corps", look: metal, shapes: [island ? box([W / 2 - 160, D / 2 - 160, head], [W / 2 + 160, D / 2 + 160, base]) : prism(W / 2 - 150, W / 2 + 150, [[D - 340, head], [D, head], [D, base], [D - 260, base]])] },
    { name: "Cheminée", look: metal, shapes: [lower] },
    { name: "Boutons", look: L.trim, shapes: [0, 1, 2, 3].map((k) => cyl([W - 60 - k * 28, 0, head / 2], [W - 60 - k * 28, -5, head / 2], 8)) },
    { name: "Cheminée haute", look: metal, shapes: [upper] },
    { name: "Éclairage", look: "led-neutral", shapes: lights(W, 20) },
  ];
}

/** A sink: its plate on the worktop, its bowls under it. The first pieces keep their order (saved documents). */
export function sink(model: string, W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const granite = model === "sink-granite";
  const t = granite ? 10 : 1.5;
  const wall = granite ? 10 : 1.2;
  const [y0, y1] = [D * 0.12, D * 0.86];
  const bowls: [number, number][] = model === "sink-steel-2" ? [[W * 0.05, W * 0.48], [W * 0.52, W * 0.95]] : granite ? [[W * 0.07, W * (W < 700 ? 0.93 : 0.6)]] : [[W * 0.06, W * 0.52]];
  // The worktop's face at z = H − t.
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
  parts.push({ name: "Trop-plein", look: "chrome", shapes: bowls.map(([a, b]) => cyl([(a + b) / 2, y1 - wall, z - 45], [(a + b) / 2, y1 - wall - 2, z - 45], 16)) });
  return parts;
}

/** A mixer tap: its base at the back of its footprint, the spout coming forward and down over the sink. */
export function tap(model: string, W: number, H: number, D: number, L: Looks): AppliancePart[] {
  const [x, yb] = [W / 2, D - W / 2];
  const r = model === "tap-pro" ? 17 : 15;
  const reach = D - W / 2 - 20;
  // The gooseneck: a half circle from the top of the body to the front, its top under the tap's height.
  const radius = reach / 2;
  const rise = H - radius - r;
  const centre: Vec3 = [x, yb - radius, rise];
  const arc: ApplianceShape[] = [];
  const steps = 10;
  for (let k = 0; k < steps; k++) {
    const p = (a: number): Vec3 => [x, centre[1] + radius * Math.cos(a), centre[2] + radius * Math.sin(a)];
    arc.push(cyl(p((Math.PI * k) / steps), p((Math.PI * (k + 1)) / steps), r * 0.85));
  }
  const tip: Vec3 = [x, yb - reach, rise];
  const lever = rise * 0.45;
  const parts: AppliancePart[] = [
    { name: "Embase", look: L.face, shapes: [cyl([x, yb, 0], [x, yb, 12], W / 2)] },
    { name: "Corps", look: L.face, shapes: [cyl([x, yb, 12], [x, yb, rise], r), ...arc, cyl(tip, [tip[0], tip[1], rise - 60], r * 0.85)] },
    // Its lever on the side, rising.
    { name: "Manette", look: L.face, shapes: [cyl([x + r - 2, yb, lever], [W - 7, yb, lever + 40], 7), cyl([x - r - 3, yb, lever], [x + r + 3, yb, lever], r + 3)] },
  ];
  if (model === "tap-pro") parts.push({ name: "Ressort", look: L.trim, shapes: Array.from({ length: 12 }, (_, k) => cyl([x - r - 4, yb, 60 + k * ((rise - 120) / 12)], [x + r + 4, yb, 60 + k * ((rise - 120) / 12) + 6], 3)) });
  parts.push({ name: "Mousseur", look: L.trim, shapes: [cyl([tip[0], tip[1], rise - 60], [tip[0], tip[1], rise - 72], r * 0.7)] });
  return parts;
}
