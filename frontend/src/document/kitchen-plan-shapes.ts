/**
 * Les formes d'un plan de cuisine, vu de dessus : ses modèles (droite, en L, en U, en G avec une péninsule, parallèle),
 * l'îlot face au mur A, et les zones qu'ils font — une par linéaire —, séparées par leurs côtés ; les angles et le mur qui
 * y passe ; ce qui le rend impossible. Les murs viennent du Plan de dressing (plan-shapes.ts) : même repère, mêmes zones,
 * même choix du mur qui passe. La péninsule est un mur C (ou B) sans mur derrière ; l'îlot tourne ses façades vers le mur A.
 * Pur.
 *
 * Chaque linéaire se mesure de gauche à droite, vu de face (`u`, depuis le bout gauche de sa ligne de dos). Ses bouts sont
 * libres, ou à un angle où il passe (il va jusqu'au mur et l'angle est à lui) ou s'arrête contre les meubles de l'autre.
 */
import { cornerJoints, PLAN, planZones, rect, runPoint, type PlanZone, type Point } from "./plan-shapes";
import type { DressingPlan, KitchenFloorPlan } from "./types";
import { freeStretches, type RunInfo, type Span } from "../features/room-runs";

export type KitchenModel = KitchenFloorPlan["model"];
export type KitchenField = "lengthB" | "lengthC" | "lengthD" | "aisle";
export type RunEnd = "free" | "pass" | "stop";
export type RestSide = "end" | "start" | "both";

export const KITCHEN_MODELS: Record<KitchenModel, { label: string; fields: Partial<Record<KitchenField, string>>; noIsland?: boolean }> = {
  I: { label: "Droite (I)", fields: {} },
  "L-left": { label: "En L à gauche", fields: { lengthB: "Longueur mur B" } },
  "L-right": { label: "En L à droite", fields: { lengthC: "Longueur mur C" } },
  U: { label: "En U", fields: { lengthB: "Longueur mur B", lengthC: "Longueur mur C" } },
  "G-left": { label: "En G : mur B et péninsule à droite", fields: { lengthB: "Longueur mur B", lengthD: "Longueur péninsule" } },
  "G-right": { label: "En G : mur C et péninsule à gauche", fields: { lengthC: "Longueur mur C", lengthD: "Longueur péninsule" } },
  facing: { label: "Parallèle : deux murs face à face", fields: { lengthD: "Longueur mur D", aisle: "Passage" }, noIsland: true },
};

export const KITCHEN_PLAN: KitchenFloorPlan = {
  model: "L-left", lengthA: 3600, lengthB: 2400, lengthC: 2400, lengthD: 1800, aisle: 1200, islandLength: 1800, islandDepth: 600, passage: 1100,
  height: 2500, depth: 600, wallDepth: 350, worktopHeight: 900, corner: "dead",
};

/** Fronts, worktop, the gap a dead corner keeps for the fronts to open, a corner unit's door, wall units (mm). */
export const FRONT = 19;
export const WORKTOP = 38;
const OVERHANG = 21;
const CORNER_GAP = 50;
export const CORNER_DOOR = 450;
const WALL_GAP = 550;
const WALL_HEIGHT = 700;
/** Kept free on both sides of a door's frame or a window (mm). */
const MARGIN = 50;

/** The sizes that follow from the plan: the cabinets' depth, the base units' height, the wall units' bottom and top, a corner. */
export function kitchenSizes(p: KitchenFloorPlan): { cabinet: number; base: number; wallBottom: number; wallTop: number; corner: number } {
  const cabinet = p.depth - FRONT - OVERHANG;
  const wallBottom = p.worktopHeight + WALL_GAP;
  return { cabinet, base: p.worktopHeight - WORKTOP, wallBottom, wallTop: wallBottom + WALL_HEIGHT, corner: cabinet + FRONT + CORNER_GAP };
}

/** A run of the plan: its zone (plan-shapes.ts), its back line, its two ends, a wall behind it or not. */
export interface KitchenRun {
  id: string;
  label: string;
  zone: PlanZone;
  /** The zone's along at the left end of its back line, and that line's length. */
  line: number;
  length: number;
  left: RunEnd;
  right: RunEnd;
  /** A wall behind it: wall units and a splashback. */
  wall: boolean;
  /** Its units' backs off its line (the island's stand at its front). */
  back: number;
}

/** The plan seen as a dressing's, for its walls: a peninsula is a wall C (or B) with no wall behind. */
function proxy(p: KitchenFloorPlan): DressingPlan {
  const g = p.model === "G-left" || p.model === "G-right";
  return {
    ...PLAN, model: g ? "U" : p.model, lengthA: p.lengthA, lengthB: p.model === "G-right" ? p.lengthD : p.lengthB, lengthC: p.model === "G-left" ? p.lengthD : p.lengthC,
    lengthD: p.lengthD, aisle: p.aisle, depth: p.depth, height: p.height, ...(p.through ? { through: p.through } : {}), island: false,
  };
}

const peninsulaOf = (p: KitchenFloorPlan) => (p.model === "G-left" ? "C" : p.model === "G-right" ? "B" : null);

/** The island, facing wall A across the passage, in the middle of it. */
function islandRun(p: KitchenFloorPlan): KitchenRun {
  const y = -(p.depth + p.passage + p.islandDepth);
  const x0 = (p.lengthA - p.islandLength) / 2;
  const start = -(x0 + p.islandLength);
  const zone: PlanZone = {
    id: "I", label: "Îlot", kind: "run", outline: rect(x0, y, x0 + p.islandLength, y + p.islandDepth),
    run: { plane: "XZ", offset: 0, frame: { origin: [0, y, 0], xDir: [-1, 0, 0], normal: [0, 1, 0] }, start, length: p.islandLength, depth: p.islandDepth, origin: [0, y], normal: [0, 1] },
  };
  return { id: "I", label: "Îlot", zone, line: start, length: p.islandLength, left: "free", right: "free", wall: false, back: Math.max(0, p.islandDepth - p.depth) };
}

/** The runs of this plan, from left to right along the walls, then the island. */
export function kitchenRuns(p: KitchenFloorPlan): KitchenRun[] {
  const zones = planZones(proxy(p));
  const peninsula = peninsulaOf(p);
  const has = (id: string) => zones.some((z) => z.id === id);
  const end = (joint: "left" | "right", passes: boolean): RunEnd => ((p.through?.[joint] === true) === passes ? "pass" : "stop");
  const runs = zones.map((zone): KitchenRun => {
    const own = zone.id === peninsula;
    const base = { id: own ? "P" : zone.id, label: own ? "Péninsule" : zone.label, zone, wall: !own, back: 0 };
    if (zone.id === "A") return { ...base, line: 0, length: p.lengthA, left: has("B") ? end("left", false) : "free", right: has("C") ? end("right", false) : "free" };
    if (zone.id === "B") {
      const length = proxy(p).lengthB;
      return { ...base, line: -length, length, left: "free", right: end("left", true) };
    }
    if (zone.id === "C") return { ...base, line: 0, length: proxy(p).lengthC, left: end("right", true), right: "free" };
    return { ...base, line: zone.run.start, length: zone.run.length, left: "free", right: "free" };
  });
  if (p.island && !KITCHEN_MODELS[p.model].noIsland) runs.push(islandRun(p));
  return runs;
}

/** Where a point of a run is on the floor: `u` along it from the left, `off` its back line. */
export const runAt = (run: KitchenRun, u: number, off: number): Point => runPoint(run.zone, run.line + u, off);

/** The part of its line the zone (its worktop) covers. */
export const zoneSpan = (run: KitchenRun): [number, number] => [run.zone.run.start - run.line, run.zone.run.start - run.line + run.zone.run.length];

/** The square corners of this plan: the run that passes at first, then the other. */
export function kitchenJoints(p: KitchenFloorPlan): { joint: "left" | "right"; label: string; walls: [string, string] }[] {
  const peninsula = peninsulaOf(p);
  const name = (wall: string) => (peninsula && wall === `Mur ${peninsula}` ? "Péninsule" : wall);
  return cornerJoints(proxy(p)).flatMap((c) => (c.joint === "far" ? [] : [{ joint: c.joint, label: c.label, walls: [name(c.walls[0]), name(c.walls[1])] as [string, string] }]));
}

/** Where its units go: the base row and the wall row (none with no wall behind), and what is left free along it. */
export interface RunGeometry {
  base: [number, number];
  wall: [number, number] | null;
  spans: Span[];
  /** Under a ceiling too low for wall units. */
  low: boolean;
  rest: RestSide;
  /** Its left and right ends: at a corner, the worktop goes on. */
  ends: [RunEnd, RunEnd];
}

/** Where what is left goes, unless set: at the free end of a run with one, shared on an island, at the end otherwise. */
export const restOf = (p: KitchenFloorPlan, run: KitchenRun): RestSide => p.rest?.[run.id] ?? (run.id === "I" ? "both" : run.left === "free" && run.right !== "free" ? "start" : "end");

/** The base and wall rows of a run, between its corners (and a corner unit), on what its wall of the room leaves free. */
export function runGeometry(p: KitchenFloorPlan, run: KitchenRun, info?: RunInfo): RunGeometry {
  const s = kitchenSizes(p);
  const unit = p.corner === "unit" ? CORNER_DOOR : 0;
  const cut = (side: RunEnd, wall: boolean) => (side === "free" ? 0 : s.corner + (side === "pass" && !wall ? unit : 0));
  const [a, b] = zoneSpan(run);
  const low = Math.min(p.height, info?.ceiling(0) ?? p.height) < s.wallTop;
  return {
    base: [run.left === "free" ? a : cut(run.left, false), run.right === "free" ? b : run.length - cut(run.right, false)],
    wall: run.wall && !low ? [cut(run.left, true), run.length - cut(run.right, true)] : null,
    spans: info?.spans ?? [],
    low: run.wall && low,
    rest: restOf(p, run),
    ends: [run.left, run.right],
  };
}

/** The free stretches of a row: around the doors, and the windows that come down into it. */
export const rowStretches = (g: RunGeometry, [from, to]: [number, number], low: number, high: number): [number, number][] => freeStretches(g.spans, from, to, low, high, MARGIN);

/** Its smallest and largest X and Y. */
function bounds(outline: Point[]): [number, number, number, number] {
  const [xs, ys] = [outline.map((q) => q[0]), outline.map((q) => q[1])];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Why this plan cannot be made, or null. */
export function kitchenPlanProblem(p: KitchenFloorPlan): string | null {
  if (!(p.height >= 2000 && p.height <= 4000)) return "La hauteur sous plafond va de 200 à 400 cm.";
  if (!(p.depth >= 450 && p.depth <= 800)) return "La profondeur des meubles bas va de 45 à 80 cm.";
  if (!(p.wallDepth >= 200 && p.wallDepth <= 500)) return "La profondeur des meubles hauts va de 20 à 50 cm.";
  if (!(p.worktopHeight >= 700 && p.worktopHeight <= 1100)) return "Le plan de travail est de 70 à 110 cm du sol.";
  if (p.model === "facing" && !(p.aisle >= 800)) return "Le passage entre les deux linéaires fait 80 cm au moins.";
  const runs = kitchenRuns(p);
  const short = runs.find((r) => r.zone.run.length < 300);
  if (short) return `${short.label} est trop court : 30 cm au moins, après l'angle.`;
  const island = runs.find((r) => r.id === "I");
  if (island) {
    if (!(p.passage >= 700)) return "Le passage devant l'îlot fait 70 cm au moins.";
    if (!(p.islandDepth >= 450 && p.islandDepth <= 1500)) return "La profondeur de l'îlot va de 45 à 150 cm.";
    if (!(p.islandLength >= 300 && p.islandLength <= p.lengthA)) return "L'îlot va de 30 cm à la longueur du mur A.";
    const [x0, y0, x1, y1] = bounds(island.zone.outline);
    const hit = runs.find((r) => {
      if (r === island) return false;
      const [a, b, c, d] = bounds(r.zone.outline);
      return x0 < c && a < x1 && y0 < d && b < y1;
    });
    if (hit) return `L'îlot touche ${hit.label} : réduisez-le ou changez le passage.`;
  }
  return null;
}

/** The lines of the plan: the outline of each run, the sides between them once. */
export function kitchenLines(p: KitchenFloorPlan): [Point, Point][] {
  const lines = new Map<string, [Point, Point]>();
  for (const { zone } of kitchenRuns(p)) {
    zone.outline.forEach((a, i) => {
      const b = zone.outline[(i + 1) % zone.outline.length] as Point;
      lines.set([a, b].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).sort().join("|"), [a, b]);
    });
  }
  return [...lines.values()];
}
