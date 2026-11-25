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
import { CORNER_GAP } from "./joinery-defaults";

export type KitchenModel = KitchenFloorPlan["model"];
export type KitchenField = "lengthB" | "lengthC" | "lengthD" | "aisle";
export type RunEnd = "free" | "pass" | "stop";
/** Where the rest of a run goes: at its end, its start, half at each, or between the walls and its corner units. */
export type RestSide = "end" | "start" | "both" | "walls";

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
  height: 2500, depth: 640, wallDepth: 350, worktopHeight: 900, corner: "dead",
  plinth: 150, worktopThickness: 38, fronts: "mixed", wallUnits: true, appliances: true, fridge: true, ovenColumn: false, splashback: true, kick: true,
};

/** Fronts, worktop, the gap a dead corner keeps for the fronts to open, a corner unit's door, wall units (mm). */
export const FRONT = 19;
/** The base units' caissons off the wall, under a 64 cm worktop (mm). */
export const BASE_DEPTH = 580;
export const WORKTOP = 38;
const PLINTH = 150;
export const CORNER_DOOR = 450;
/** A corner unit with a door stands this far off the corner's wall, taken from its fixed part (mm). */
export const CORNER_WALL_GAP = 100;
const WALL_GAP = 550;
const WALL_HEIGHT = 700;
/** Kept free on both sides of a door's frame or a window (mm). */
const MARGIN = 50;

export type CornerKind = NonNullable<NonNullable<KitchenFloorPlan["corners"]>["left"]>;
export type Joint = "left" | "right";

/** The corner at an end of a run: wall A's own sides, the right end of B (or its peninsula), the left end of C. */
export const jointOf = (run: KitchenRun, side: Joint): Joint => (run.zone.id === "A" ? side : run.zone.id === "B" ? "left" : "right");

/** What stands in a corner. */
export const cornerKind = (p: KitchenFloorPlan, joint: Joint): CornerKind => p.corners?.[joint] ?? p.corner ?? "dead";
/** An L cabinet on both walls, a folding door (the carousel's trays turn in it); a blind corner unit with a door (a LeMans's or a Magic Corner's fittings in it). */
export const isLCorner = (kind: CornerKind): boolean => kind === "l" || kind === "carousel" || kind === "diagonal";
export const isDoorCorner = (kind: CornerKind): boolean => kind === "unit" || kind === "lemans" || kind === "magic";

export type WallCornerKind = NonNullable<NonNullable<KitchenFloorPlan["wallCorners"]>["left"]>;

/** An arm of an L corner unit, from the corner's wall (mm): as set, else 90 cm with 56 cm deep cabinets. */
export const lArm = (p: KitchenFloorPlan, joint?: Joint): number => (joint && p.cornerSizes?.[joint]?.arm) || kitchenSizes(p).cabinet + 340;

/** A blind corner unit's door (mm): as set, else 45 cm. */
export const cornerDoor = (p: KitchenFloorPlan, joint: Joint): number => p.cornerSizes?.[joint]?.door || CORNER_DOOR;

/** What stands in a corner up in the wall row, and its sizes: a door of 30 cm, an L of 60 cm with 35 cm deep units. */
export const wallCornerKind = (p: KitchenFloorPlan, joint: Joint): WallCornerKind => p.wallCorners?.[joint] ?? "none";
export const wallCornerDoor = (p: KitchenFloorPlan, joint: Joint): number => p.cornerSizes?.[joint]?.wallDoor || 300;
export const wallArm = (p: KitchenFloorPlan, joint: Joint): number => p.cornerSizes?.[joint]?.wallArm || p.wallDepth + 250;
/** In the wall row, the other run's units stop this far from the corner's wall, for the fronts to open (mm). */
export const wallCorner = (p: KitchenFloorPlan): number => p.wallDepth + FRONT + CORNER_GAP;

/** How far from the corner's wall the wall row of a run starts: as the base row with nothing there. */
export function wallReach(p: KitchenFloorPlan, run: KitchenRun, side: Joint): number {
  if (run[side] === "free") return 0;
  const joint = jointOf(run, side);
  const kind = wallCornerKind(p, joint);
  if (kind === "none") return kitchenSizes(p).corner;
  if (kind === "l") return wallArm(p, joint);
  return wallCorner(p) + (run[side] === "pass" ? wallCornerDoor(p, joint) : 0);
}

/** A corner unit on this end, the run going to the wall: it can stand off it, a filler between. */
export function movable(p: KitchenFloorPlan, run: KitchenRun, side: Joint): boolean {
  const kind = cornerKind(p, jointOf(run, side));
  return run[side] === "pass" && isDoorCorner(kind);
}

/** How far from the corner's wall the base row of a run starts, at an end in a corner. */
export function cornerReach(p: KitchenFloorPlan, run: KitchenRun, side: Joint): number {
  const end = run[side];
  if (end === "free") return 0;
  const kind = cornerKind(p, jointOf(run, side));
  const s = kitchenSizes(p);
  if (isLCorner(kind)) return lArm(p, jointOf(run, side));
  return s.corner + (end === "pass" && isDoorCorner(kind) ? cornerDoor(p, jointOf(run, side)) : 0);
}

/** The sizes that follow from the plan: the cabinets' depth, the base units' height, the wall units' bottom and top, a corner. */
export function kitchenSizes(p: KitchenFloorPlan): { cabinet: number; base: number; wallBottom: number; wallTop: number; corner: number; plinth: number } {
  const cabinet = Math.min(p.baseDepth ?? BASE_DEPTH, p.depth - FRONT);
  const wallBottom = p.worktopHeight + WALL_GAP;
  return { cabinet, base: p.worktopHeight - (p.worktopThickness ?? WORKTOP), wallBottom, wallTop: wallBottom + WALL_HEIGHT, corner: cabinet + FRONT + CORNER_GAP, plinth: p.plinth ?? PLINTH };
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

/** The island, facing wall A across the passage, in the middle of it (or off it, where it was moved). */
function islandRun(p: KitchenFloorPlan): KitchenRun {
  const y = -(p.depth + p.passage + p.islandDepth);
  const x0 = (p.lengthA - p.islandLength) / 2 + (p.islandShift ?? 0);
  const start = -(x0 + p.islandLength);
  const zone: PlanZone = {
    id: "I", label: "Îlot", kind: "run", outline: rect(x0, y, x0 + p.islandLength, y + p.islandDepth),
    run: { plane: "XZ", offset: 0, frame: { origin: [0, y, 0], xDir: [-1, 0, 0], normal: [0, 1, 0] }, start, length: p.islandLength, depth: p.islandDepth, origin: [0, y], normal: [0, 1] },
  };
  return { id: "I", label: "Îlot", zone, line: start, length: p.islandLength, left: "free", right: "free", wall: false, back: Math.max(0, p.islandDepth - p.depth) };
}

/** Up to this far out of square, a side wall is taken (°): the units stay square to wall A, scribed against it. */
export const SKEW_MAX = 5;

/**
 * How far the run of a side wall coming into the room stands off its corner's line, so that its far end clears the
 * wall: its length times the slope (mm). A wall opening away needs none: a gap grows behind its units instead.
 */
export const skewShift = (p: KitchenFloorPlan, wall: "B" | "C"): number => {
  const skew = p.skew?.[wall] ?? 0;
  return skew < 0 ? (wall === "B" ? p.lengthB : p.lengthC) * Math.tan((-skew * Math.PI) / 180) : 0;
};

/** A zone moved across the plan by `dx` (mm). */
function moved(zone: PlanZone, dx: number): PlanZone {
  if (!dx) return zone;
  const { run } = zone;
  return {
    ...zone, outline: zone.outline.map(([x, y]): Point => [x + dx, y]),
    run: { ...run, offset: run.plane === "YZ" && !run.frame ? run.offset + dx : run.offset, origin: [run.origin[0] + dx, run.origin[1]], ...(run.frame ? { frame: { ...run.frame, origin: [run.frame.origin[0] + dx, run.frame.origin[1], run.frame.origin[2]] } } : {}) },
  };
}

/** Wall A's zone between side runs moved off their corners: its units from their fronts; to the wall where A passes. */
function narrowed(zone: PlanZone, run: Pick<KitchenRun, "left" | "right">, left: number, right: number, depth: number): PlanZone {
  const [a0, a1] = [zone.run.start + (run.left === "stop" ? left : 0), zone.run.start + zone.run.length - (run.right === "stop" ? right : 0)];
  return { ...zone, outline: rect(a0, -depth, a1, 0), run: { ...zone.run, start: a0, length: a1 - a0 } };
}

/** The runs of this plan, from left to right along the walls, then the island. */
export function kitchenRuns(p: KitchenFloorPlan): KitchenRun[] {
  const runs = squareRuns(p);
  const [left, right] = [skewShift(p, "B"), skewShift(p, "C")];
  if (!left && !right) return runs;
  // A side wall coming into the room: its run moved off the corner, wall A's units starting from its front.
  return runs.map((r) => {
    if (r.zone.id === "B" && r.id === "B") return { ...r, zone: moved(r.zone, left) };
    if (r.zone.id === "C" && r.id === "C") return { ...r, zone: moved(r.zone, -right) };
    if (r.id !== "A") return r;
    const [l, rr] = [r.left === "free" ? 0 : left, r.right === "free" ? 0 : right];
    return { ...r, line: l, length: r.length - l - rr, zone: narrowed(r.zone, r, l, rr, p.depth) };
  });
}

/** What a wall out of square does to the kitchen, said for the panel: the gap behind its units, the scribed worktop. */
export function skewNotes(p: KitchenFloorPlan): string[] {
  return (["B", "C"] as const).flatMap((wall) => {
    const skew = p.skew?.[wall];
    if (!skew || !kitchenRuns(p).some((r) => r.id === wall)) return [];
    const length = wall === "B" ? p.lengthB : p.lengthC;
    const gap = Math.round(length * Math.tan((Math.abs(skew) * Math.PI) / 180));
    const angle = `${(90 + skew).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}°`;
    return [skew > 0
      ? `Mur ${wall} hors d'équerre (angle de ${angle}) : il s'écarte des meubles, jusqu'à ${gap} mm au bout. Plan de travail et crédence à scribe contre lui, une joue ou un fileur à scribe au bout.`
      : `Mur ${wall} hors d'équerre (angle de ${angle}) : ses meubles sont avancés de ${gap} mm pour ne pas toucher le mur au bout ; ${gap} mm de jour dans l'angle, plan de travail à scribe.`];
  });
}

/** The runs of the plan, every wall square to wall A. */
function squareRuns(p: KitchenFloorPlan): KitchenRun[] {
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
  /** The ends with a corner unit that can stand off the wall, a wall filler behind it (the rest « contre les murs »). */
  movable: [boolean, boolean];
}

/** Where what is left goes, unless set: at the free end of a run with one, shared on an island, at the end otherwise. */
export const restOf = (p: KitchenFloorPlan, run: KitchenRun): RestSide => p.rest?.[run.id] ?? (run.id === "I" ? "both" : run.left === "free" && run.right !== "free" ? "start" : "end");

/** The base and wall rows of a run, between its corners (and a corner unit), on what its wall of the room leaves free. */
export function runGeometry(p: KitchenFloorPlan, run: KitchenRun, info?: RunInfo): RunGeometry {
  const s = kitchenSizes(p);
  const cut = (side: Joint, wall: boolean) => (run[side] === "free" ? 0 : wall ? wallReach(p, run, side) : cornerReach(p, run, side));
  const [a, b] = zoneSpan(run);
  const low = Math.min(p.height, info?.ceiling(0) ?? p.height) < s.wallTop;
  return {
    base: [run.left === "free" ? a : cut("left", false), run.right === "free" ? b : run.length - cut("right", false)],
    wall: run.wall && !low ? [cut("left", true), run.length - cut("right", true)] : null,
    spans: info?.spans ?? [],
    low: run.wall && low,
    rest: restOf(p, run),
    ends: [run.left, run.right],
    movable: [movable(p, run, "left"), movable(p, run, "right")],
  };
}

/** The free stretches of a row: around the doors, and the windows that come down into it. */
export const rowStretches = (g: RunGeometry, [from, to]: [number, number], low: number, high: number): [number, number][] => freeStretches(g.spans, from, to, low, high, MARGIN);

/** Its smallest and largest X and Y. */
function bounds(outline: Point[]): [number, number, number, number] {
  const [xs, ys] = [outline.map((q) => q[0]), outline.map((q) => q[1])];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The casquette of the wall row (kitchen-cap.ts), its usual sizes (mm): a plain one's thickness, a caisson one's height, how far it comes out; a raw panel's length. */
export const CAP = { thickness: 38, height: 80, overhang: 30, board: 19, panel: 2800, unit: 350, unitDepth: 600 };
/** Why the casquette's sizes cannot be used, or null. */
export function capProblem(p: KitchenFloorPlan): string | null {
  if (!p.cap) return null;
  const [t, h, o] = [p.capThickness ?? CAP.thickness, p.capHeight ?? (p.cap === "units" ? CAP.unit : CAP.height), p.capOverhang ?? CAP.overhang];
  if (p.cap === "units") return !(h >= 250 && h <= 600) ? "Les caissons de casquette ont de 25 à 60 cm de hauteur." : !((p.capDepth ?? CAP.unitDepth) >= 300 && (p.capDepth ?? CAP.unitDepth) <= 800) ? "Les caissons de casquette ont de 30 à 80 cm de profondeur." : null;
  if (p.cap === "flat" && !(t >= 16 && t <= 60)) return "La casquette a de 16 à 60 mm d'épaisseur.";
  if (p.cap === "box" && !(h >= 40 && h <= 600)) return "La casquette en caisson a de 4 à 60 cm de hauteur.";
  if (!(o >= 0 && o <= 100)) return "Le débord de la casquette va de 0 à 10 cm.";
  return null;
}

/** Why this plan cannot be made, or null. */
export function kitchenPlanProblem(p: KitchenFloorPlan): string | null {
  if (!(p.height >= 2000 && p.height <= 4000)) return "La hauteur sous plafond va de 200 à 400 cm.";
  if (!(p.depth >= 450 && p.depth <= 800)) return "La profondeur du plan de travail va de 45 à 80 cm.";
  if (p.baseDepth !== undefined && !(p.baseDepth >= 300 && p.baseDepth <= p.depth - FRONT)) return "Les caissons bas ont de 30 cm de profondeur à celle du plan de travail moins les façades.";
  if (!(p.wallDepth >= 200 && p.wallDepth <= 500)) return "La profondeur des meubles hauts va de 20 à 50 cm.";
  if (!(p.worktopHeight >= 700 && p.worktopHeight <= 1100)) return "Le plan de travail est de 70 à 110 cm du sol.";
  if (p.plinth !== undefined && !(p.plinth >= 50 && p.plinth <= 250)) return "Le socle va de 5 à 25 cm.";
  if (p.worktopThickness !== undefined && !(p.worktopThickness >= 10 && p.worktopThickness <= 100)) return "Le plan de travail a de 1 à 10 cm d'épaisseur.";
  const cap = capProblem(p);
  if (cap) return cap;
  if (p.model === "facing" && !(p.aisle >= 800)) return "Le passage entre les deux linéaires fait 80 cm au moins.";
  const runs = kitchenRuns(p);
  const short = runs.find((r) => r.zone.run.length < 300);
  if (short) return `${short.label} est trop court : 30 cm au moins, après l'angle.`;
  const island = runs.find((r) => r.id === "I");
  if (island) {
    if (!(p.passage >= 700)) return "Le passage devant l'îlot fait 70 cm au moins.";
    if (!(p.islandDepth >= 450 && p.islandDepth <= 1500)) return "La profondeur de l'îlot va de 45 à 150 cm.";
    if (!(p.islandLength >= 300 && p.islandLength <= p.lengthA)) return "L'îlot va de 30 cm à la longueur du mur A.";
    if (!(Math.abs(p.islandShift ?? 0) <= p.lengthA)) return "L'îlot se décale d'au plus la longueur du mur A, d'un côté ou de l'autre de son milieu.";
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
