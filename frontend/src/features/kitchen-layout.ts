/**
 * Implantation d'une cuisine, en nombres : le long d'un mur (I) ou de deux murs en angle (L), des meubles bas aux
 * largeurs du commerce (600 d'abord, puis le plus grand module qui tient dans le reste, et un fileur pour le
 * dernier jeu), leurs façades, le plan de travail, les meubles hauts au-dessus si on veut, et les murs.
 *
 * Repère : le mur A a sa face intérieure dans le plan Y = 0 et va vers +X ; les meubles sont devant lui (Y < 0).
 * En L, le mur B a sa face intérieure dans le plan X = 0 et va vers −Y ; ses meubles sont tournés de 90° (face vers
 * +X). L'angle est un angle mort fermé par deux fileurs, pour que portes et tiroirs s'ouvrent sans se heurter.
 */
import type { Vec3 } from "../document/types";

export interface KitchenSettings {
  layout: "I" | "L";
  /** Inner length of wall A and of wall B (mm). */
  lengthA: number;
  lengthB: number;
  wallHeight: number;
  /** Base units: total height (plinth included), depth, plinth. */
  baseHeight: number;
  baseDepth: number;
  plinth: number;
  fronts: "doors" | "drawers" | "mixed";
  worktopThickness: number;
  wallUnits: boolean;
  /** Fronts' thickness (mm), for the corner and the worktop overhang. */
  frontThickness: number;
}

export const KITCHEN: KitchenSettings = {
  layout: "I", lengthA: 3000, lengthB: 2400, wallHeight: 2500, baseHeight: 870, baseDepth: 560, plinth: 150,
  fronts: "mixed", worktopThickness: 38, wallUnits: true, frontThickness: 19,
};

/** Commercial widths of the units (mm). */
export const MODULES = [300, 400, 450, 500, 600, 800, 900];
const PREFERRED = 600;
const WALL_THICKNESS = 100;
/** Gap left at the corner so the fronts of both runs open (mm). */
const CORNER_GAP = 50;
const OVERHANG = 20;
const WALL_UNIT = { height: 700, depth: 350, bottom: 1450 };
const MIN_FILLER = 3;

export interface KitchenUnit {
  name: string;
  origin: Vec3;
  rotation: 0 | 90;
  width: number;
  height: number;
  depth: number;
  plinth: number;
  shelves: number;
  /** The fronts it gets. */
  layout: "door" | "doors" | "drawers";
}

export interface KitchenBox {
  name: string;
  from: Vec3;
  to: Vec3;
  kind: "wall" | "worktop" | "filler";
}

/** The units of a run of `length`: as many 600 as fit, then the widest module that fits, and the rest (filler). */
export function splitRun(length: number): { widths: number[]; filler: number } {
  const widths: number[] = Array.from({ length: Math.max(0, Math.floor(length / PREFERRED)) }, () => PREFERRED);
  let rest = length - widths.length * PREFERRED;
  const fits = [...MODULES].reverse().find((w) => w <= rest + 1e-9);
  if (fits) {
    widths.push(fits);
    rest -= fits;
  }
  return { widths, filler: Number(rest.toFixed(3)) };
}

export function kitchenProblem(s: KitchenSettings): string | null {
  const corner = s.layout === "L" ? s.baseDepth + s.frontThickness + CORNER_GAP : 0;
  if (!(s.lengthA - corner >= MODULES[0]!)) return `Le mur A est trop court pour un meuble (au moins ${MODULES[0]! + corner} mm).`;
  if (s.layout === "L" && !(s.lengthB - corner >= MODULES[0]!)) return `Le mur B est trop court pour un meuble (au moins ${MODULES[0]! + corner} mm).`;
  if (!(s.baseDepth >= 300 && s.baseDepth <= 700)) return "La profondeur des meubles bas va de 300 à 700 mm.";
  if (!(s.plinth >= 0 && s.baseHeight - s.plinth >= 300)) return "Les meubles bas doivent avoir au moins 300 mm au-dessus du socle.";
  if (!(s.worktopThickness > 0)) return "L'épaisseur du plan de travail doit être positive.";
  if (s.wallUnits && !(s.wallHeight >= WALL_UNIT.bottom + WALL_UNIT.height)) return `Le plafond est trop bas pour des meubles hauts (au moins ${WALL_UNIT.bottom + WALL_UNIT.height} mm).`;
  return null;
}

function frontsFor(style: KitchenSettings["fronts"], width: number, index: number): KitchenUnit["layout"] {
  const doors = width > PREFERRED ? "doors" : "door";
  if (style === "doors") return doors;
  if (style === "drawers") return "drawers";
  return index % 2 === 0 ? "drawers" : doors;
}

/** Everything of the kitchen: units (base, then wall), and boxes (walls, worktops, fillers). */
export function kitchenLayout(s: KitchenSettings): { units: KitchenUnit[]; boxes: KitchenBox[] } {
  if (kitchenProblem(s)) return { units: [], boxes: [] };
  const D = s.baseDepth;
  const T = s.frontThickness;
  const H = s.baseHeight;
  const L = s.layout === "L";
  const corner = L ? D + T + CORNER_GAP : 0;
  const units: KitchenUnit[] = [];
  const walls: KitchenUnit[] = [];
  const boxes: KitchenBox[] = [];
  const top = H + s.worktopThickness;
  const depthTop = D + T + OVERHANG;

  // Run A, along +X from the corner.
  const a = splitRun(s.lengthA - corner);
  let x = corner;
  a.widths.forEach((w, i) => {
    units.push({ name: `Bas A${i + 1}`, origin: [x, -D, 0], rotation: 0, width: w, height: H, depth: D, plinth: s.plinth, shelves: 1, layout: frontsFor(s.fronts, w, i) });
    if (s.wallUnits) walls.push({ name: `Haut A${i + 1}`, origin: [x, -WALL_UNIT.depth, WALL_UNIT.bottom], rotation: 0, width: w, height: WALL_UNIT.height, depth: WALL_UNIT.depth, plinth: 0, shelves: 1, layout: w > PREFERRED ? "doors" : "door" });
    x += w;
  });
  if (a.filler >= MIN_FILLER) boxes.push({ name: "Fileur A", from: [x, -(D + T), s.plinth], to: [x + a.filler, -D, H], kind: "filler" });
  boxes.push({ name: "Plan de travail A", from: [0, -depthTop, H], to: [s.lengthA, 0, top], kind: "worktop" });
  boxes.push({ name: "Mur A", from: [L ? -WALL_THICKNESS : 0, 0, 0], to: [s.lengthA, WALL_THICKNESS, s.wallHeight], kind: "wall" });

  if (L) {
    // Run B, along −Y from the corner, turned to face +X: its origin is the front-left corner seen from the room.
    const b = splitRun(s.lengthB - corner);
    let y = -corner;
    b.widths.forEach((w, i) => {
      units.push({ name: `Bas B${i + 1}`, origin: [D, y - w, 0], rotation: 90, width: w, height: H, depth: D, plinth: s.plinth, shelves: 1, layout: frontsFor(s.fronts, w, i) });
      if (s.wallUnits) walls.push({ name: `Haut B${i + 1}`, origin: [WALL_UNIT.depth, y - w, WALL_UNIT.bottom], rotation: 90, width: w, height: WALL_UNIT.height, depth: WALL_UNIT.depth, plinth: 0, shelves: 1, layout: w > PREFERRED ? "doors" : "door" });
      y -= w;
    });
    if (b.filler >= MIN_FILLER) boxes.push({ name: "Fileur B", from: [D, y - b.filler, s.plinth], to: [D + T, y, H], kind: "filler" });
    // The dead corner, closed in the planes of both runs' fronts.
    boxes.push({ name: "Fileur d'angle A", from: [D, -(D + T), s.plinth], to: [corner, -D, H], kind: "filler" });
    boxes.push({ name: "Fileur d'angle B", from: [D, -corner, s.plinth], to: [D + T, -(D + T), H], kind: "filler" });
    boxes.push({ name: "Plan de travail B", from: [0, -s.lengthB, H], to: [depthTop, -depthTop, top], kind: "worktop" });
    boxes.push({ name: "Mur B", from: [-WALL_THICKNESS, -s.lengthB, 0], to: [0, 0, s.wallHeight], kind: "wall" });
  }
  return { units: [...units, ...walls], boxes };
}
