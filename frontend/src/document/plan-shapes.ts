/**
 * Les formes d'un plan de dressing, vu de dessus : les modèles, les zones qu'ils font, leurs lignes et ce qui les rend
 * impossibles. Une zone est un linéaire dos à son mur ou à sa cloison, ou un angle : pentagone d'un pan coupé, quart
 * d'arrondi là où le modèle est arrondi, ou meuble d'angle en L (deux bras le long des murs, façade en équerre). Deux réglages s'ajoutent à la plupart des modèles : un îlot, posé à un passage
 * devant le mur A, et un rampant, un plafond en pente qui coupe tout ce qui est dessous. Pur.
 *
 * Repère de l'assistant Dressing (document/dressing-plan.ts) : le mur A a sa face en Y = 0 et va vers +X, le dressing est
 * devant lui (Y < 0) ; le mur B a sa face en X = 0 à gauche, le mur C en X = longueur de A à droite, tous deux vers −Y.
 */
import type { CornerJoint, DressingPlan, PlaneFrame, PlaneName, SlopedCeiling, Vec3 } from "./types";
import { placePoint, turn } from "../features/room-runs";
import { nearestPlane } from "../sketcher/frame";

export type PlanModel = DressingPlan["model"];
export type Corner = "left" | "right";
export type Point = [number, number];
/** The sizes that depend on the model. */
export type PlanField = "lengthB" | "lengthC" | "lengthD" | "lengthE" | "aisle" | "depthB";

interface ModelShape {
  label: string;
  /** Those it asks for, with their names. */
  fields: Partial<Record<PlanField, string>>;
  /** The corners cut at an angle or rounded. */
  cut: Corner[];
  round?: boolean;
  /** The corners are L-shaped units: an arm along each wall, as deep as the runs, their front square. */
  ell?: boolean;
  /** Runs that stand in the room leave no place for an island. */
  noIsland?: boolean;
  /** Wall A under another name, for a run with no wall behind it. */
  front?: string;
}

const WALL_B = { lengthB: "Longueur mur B" };
const WALL_C = { lengthC: "Longueur mur C" };

export const PLAN_MODELS: Record<PlanModel, ModelShape> = {
  I: { label: "Droit", fields: {}, cut: [] },
  "L-left": { label: "En L à gauche", fields: WALL_B, cut: [] },
  "L-right": { label: "En L à droite", fields: WALL_C, cut: [] },
  U: { label: "En U", fields: { ...WALL_B, ...WALL_C }, cut: [] },
  "L-left-cut": { label: "En L à gauche, pan coupé", fields: WALL_B, cut: ["left"] },
  "L-right-cut": { label: "En L à droite, pan coupé", fields: WALL_C, cut: ["right"] },
  "U-cut": { label: "En U, pans coupés", fields: { ...WALL_B, ...WALL_C }, cut: ["left", "right"] },
  facing: { label: "Face à face", fields: { lengthD: "Longueur mur D", aisle: "Passage" }, cut: [], noIsland: true },
  "U-cut-left": { label: "En U, pan coupé à gauche", fields: { ...WALL_B, ...WALL_C }, cut: ["left"] },
  "U-cut-right": { label: "En U, pan coupé à droite", fields: { ...WALL_B, ...WALL_C }, cut: ["right"] },
  "G-left": { label: "En U presque fermé, entrée à droite", fields: { ...WALL_B, ...WALL_C, lengthE: "Longueur mur D" }, cut: [] },
  "G-right": { label: "En U presque fermé, entrée à gauche", fields: { ...WALL_B, ...WALL_C, lengthE: "Longueur mur D" }, cut: [] },
  T: { label: "Cloison centrale", fields: { lengthB: "Longueur de la cloison" }, cut: [], noIsland: true },
  back: { label: "Dos à dos", fields: {}, cut: [], noIsland: true, front: "Face avant" },
  depths: { label: "Deux profondeurs", fields: { lengthE: "Longueur 2e partie", depthB: "2e profondeur" }, cut: [] },
  "L-left-round": { label: "En L à gauche, angle arrondi", fields: WALL_B, cut: ["left"], round: true },
  "L-right-round": { label: "En L à droite, angle arrondi", fields: WALL_C, cut: ["right"], round: true },
  "U-round": { label: "En U, angles arrondis", fields: { ...WALL_B, ...WALL_C }, cut: ["left", "right"], round: true },
  "L-left-ell": { label: "En L à gauche, coin en L", fields: WALL_B, cut: ["left"], ell: true },
  "L-right-ell": { label: "En L à droite, coin en L", fields: WALL_C, cut: ["right"], ell: true },
  "U-ell": { label: "En U, coins en L", fields: { ...WALL_B, ...WALL_C }, cut: ["left", "right"], ell: true },
};

export const PLAN: DressingPlan = { model: "L-right-cut", lengthA: 3000, lengthB: 2000, lengthC: 2000, lengthD: 3000, lengthE: 1200, aisle: 1000, depth: 600, depthB: 350, cornerA: 1000, cornerB: 1000, islandLength: 1200, islandDepth: 500, roofLow: 1200, thickness: 18, height: 2500, plinth: 80 };

/** A zone of the plan: a run along a wall, or the outline of a corner. Each has its Répartition. */
export interface PlanZone {
  id: string;
  label: string;
  kind: "run" | "corner";
  /** Its outline, seen from above. */
  outline: Point[];
  /** Where its Répartition goes, how deep it is, and its back on the floor: `origin`, facing `normal`. */
  run: { plane: PlaneName; offset: number; frame?: PlaneFrame; start: number; length: number; depth: number; origin: Point; normal: Point };
  /** A corner: what of its panels stands. */
  clip?: Point[];
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Where a point of a run is on the floor: `along` it as its sketch counts, `off` its back. */
export function runPoint({ run }: PlanZone, along: number, off: number): Point {
  const [[ox, oy], [nx, ny]] = [run.origin, run.normal];
  return [ox - along * ny + off * nx, oy + along * nx + off * ny];
}

/** A run with its back on a line of the floor: looking at it from the front, its sketch goes from right to left. */
function standing(id: string, label: string, origin: Point, normal: Point, start: number, length: number, depth: number): PlanZone {
  const [nx, ny] = normal;
  const frame: PlaneFrame = { origin: [origin[0], origin[1], 0], xDir: [-ny, nx, 0], normal: [nx, ny, 0] };
  const zone: PlanZone = { id, label, kind: "run", outline: [], run: { plane: nearestPlane(frame.normal), offset: 0, frame, start, length, depth, origin, normal } };
  const [[ax, ay], [bx, by]] = [runPoint(zone, start, 0), runPoint(zone, start + length, depth)];
  return { ...zone, outline: rect(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)) };
}

/** The front of a rounded corner: a quarter of an ellipse from wall A's front to the other wall's, its centre in the room. */
const ARC_STEPS = 24;
function arc(p: DressingPlan, inset = 0): Point[] {
  const { depth: d, cornerA: a, cornerB: b } = p;
  const [ra, rb] = [a - d - inset, b - d - inset];
  return Array.from({ length: ARC_STEPS + 1 }, (_, i): Point => {
    const angle = (i / ARC_STEPS) * (Math.PI / 2);
    return [a - ra * Math.sin(angle), -b + rb * Math.cos(angle)];
  });
}

const mirrored = (p: DressingPlan, corner: Corner, shape: Point[]): Point[] => (corner === "left" ? shape : shape.map(([x, y]): Point => [p.lengthA - x, y]));

/** Where the front of a corner meets the lines `inset` inside its two ends. */
function frontEnds(p: DressingPlan, inset: number): { a: Point; b: Point } {
  const { depth: d, cornerA: a, cornerB: b } = p;
  const round = PLAN_MODELS[p.model].round;
  const [ra, rb] = [a - d, b - d];
  const down = round ? -b + rb * Math.sqrt(Math.max(0, 1 - (inset / ra) ** 2)) : -d - (inset * rb) / ra;
  const side = round ? a - ra * Math.sqrt(Math.max(0, 1 - (inset / rb) ** 2)) : d + (inset * ra) / rb;
  return { a: [a - inset, down], b: [side, inset - b] };
}

/** The outline of a corner, the wall corner first, then along wall A; the one on the right is the mirror of the one on the left. */
export function cornerOutline(p: DressingPlan, corner: Corner, inset = 0): Point[] {
  // An L-shaped unit: its arm along wall A, its square inner corner, its arm along the other wall.
  if (PLAN_MODELS[p.model].ell) return mirrored(p, corner, ellOutline(p, inset));
  const { a, b } = frontEnds(p, inset);
  const curve = PLAN_MODELS[p.model].round ? arc(p).filter(([x, y]) => x < a[0] - 1e-6 && x > b[0] + 1e-6 && y < a[1] - 1e-6 && y > b[1] + 1e-6) : [];
  return mirrored(p, corner, [[0, 0], [a[0], 0], a, ...curve, b, [0, b[1]]]);
}

/** An L-shaped corner on the left, `inset` inside its two ends: its front is square, at the depth of the runs. */
function ellOutline(p: DressingPlan, inset: number): Point[] {
  const { depth: d, cornerA: a, cornerB: b } = p;
  return [[0, 0], [a - inset, 0], [a - inset, -d], [d, -d], [d, inset - b], [0, inset - b]];
}

/** The two faces of an L-shaped corner's front, each from its outer end to the inner corner (left corner). */
export function ellFaces(p: DressingPlan, corner: Corner): [Point, Point][] {
  const { depth: d, cornerA: a, cornerB: b } = p;
  const [alongA, alongOther] = [mirrored(p, corner, [[a, -d], [d, -d]]), mirrored(p, corner, [[d, -b], [d, -d]])];
  return [[alongA[0] as Point, alongA[1] as Point], [alongOther[0] as Point, alongOther[1] as Point]];
}

/** The band of a rounded door, in front of the arc. */
export function arcDoor(p: DressingPlan, corner: Corner, gap: number): Point[] {
  const trim = Math.ceil((gap / (p.cornerA - p.depth)) * (ARC_STEPS / (Math.PI / 2)));
  const span = (points: Point[]) => points.slice(trim, ARC_STEPS + 1 - trim);
  return mirrored(p, corner, [...span(arc(p)), ...span(arc(p, p.thickness)).reverse()]);
}

/** The rounded door as true arcs around their centre, when the corner is a quarter of a circle (radians). */
export function circleDoor(p: DressingPlan, corner: Corner, gap: number): { center: Point; outer: number; inner: number; from: number; to: number } | null {
  const radius = p.cornerA - p.depth;
  if (Math.abs(radius - (p.cornerB - p.depth)) > 1e-6) return null;
  const [from, to] = corner === "left" ? [Math.PI / 2, Math.PI] : [0, Math.PI / 2];
  return { center: mirrored(p, corner, [[p.cornerA, -p.cornerB]])[0] as Point, outer: radius, inner: radius - p.thickness, from: from + gap / radius, to: to - gap / radius };
}

/** The panels of a corner stand over its outline, up to its far side (itself a board apart). */
function cornerClip(p: DressingPlan, corner: Corner): Point[] {
  if (PLAN_MODELS[p.model].ell) return mirrored(p, corner, ellOutline(p, 0).map(([x, y]): Point => [x, y === -p.cornerB ? p.thickness - p.cornerB : y]));
  const { b } = frontEnds(p, p.thickness);
  const whole = PLAN_MODELS[p.model].round ? arc(p).filter(([, y]) => y > b[1] + 1e-6) : [[p.cornerA, -p.depth] as Point];
  return mirrored(p, corner, [[0, 0], [p.cornerA, 0], ...whole, b, [0, b[1]]]);
}

/** The square corners of this plan: the two walls that meet there, the one that runs through at first, then the other. */
export function cornerJoints(p: DressingPlan): { joint: CornerJoint; label: string; walls: [string, string] }[] {
  const { cut, fields } = PLAN_MODELS[p.model];
  const closing = p.model === "G-left" || p.model === "G-right";
  return [
    ...(p.model !== "T" && "lengthB" in fields && !cut.includes("left") ? [{ joint: "left" as const, label: "Angle gauche", walls: ["Mur A", "Mur B"] as [string, string] }] : []),
    ...("lengthC" in fields && !cut.includes("right") ? [{ joint: "right" as const, label: "Angle droit", walls: ["Mur A", "Mur C"] as [string, string] }] : []),
    ...(closing ? [{ joint: "far" as const, label: "Angle du mur D", walls: [p.model === "G-left" ? "Mur B" : "Mur C", "Mur D"] as [string, string] }] : []),
  ];
}

/** The zones of this plan, from left to right along the walls. */
export function planZones(p: DressingPlan): PlanZone[] {
  const model = PLAN_MODELS[p.model];
  const { depth: d, lengthA: l } = p;
  // A wall stops short of a corner cut or rounded, or of a side wall that runs through.
  const through = (joint: CornerJoint) => cornerJoints(p).some((c) => c.joint === joint) && p.through?.[joint] === true;
  const from = (corner: Corner) => (model.cut.includes(corner) ? p.cornerA : through(corner) ? d : 0);
  const gap = (corner: Corner) => (model.cut.includes(corner) ? p.cornerB : through(corner) ? 0 : d);
  const asks = (field: PlanField) => field in model.fields;
  const closing = p.model === "G-left" || p.model === "G-right";
  const zones: PlanZone[] = [];
  const [a0, a1] = [Math.max(from("left"), p.spans?.A?.[0] ?? 0), Math.min(p.model === "depths" ? l - p.lengthE : l - from("right"), p.spans?.A?.[1] ?? l)];
  const corner = (side: Corner, id: string, label: string, start: number): PlanZone => ({ id, label, kind: "corner", outline: cornerOutline(p, side), run: { plane: "XZ", offset: 0, start, length: p.cornerA, depth: p.cornerB, origin: [0, 0], normal: [0, -1] }, clip: cornerClip(p, side) });
  const facingA = { plane: "XZ" as const, offset: 0, origin: [0, 0] as Point, normal: [0, -1] as Point };
  if (model.cut.includes("left")) zones.push(corner("left", "left", "Angle gauche", 0));
  zones.push({ id: "A", label: model.front ?? "Mur A", kind: "run", outline: rect(a0, -d, a1, 0), run: { ...facingA, start: a0, length: a1 - a0, depth: d } });
  if (model.cut.includes("right")) zones.push(corner("right", "right", "Angle droit", l - p.cornerA));
  if (p.model === "T") {
    zones.push(standing("E", "Cloison gauche", [l / 2, 0], [-1, 0], d, p.lengthB, d));
    zones.push(standing("F", "Cloison droite", [l / 2, 0], [1, 0], -d - p.lengthB, p.lengthB, d));
  } else if (asks("lengthB")) {
    const [start, end] = [Math.max(gap("left"), p.spans?.B?.[0] ?? 0), Math.min(p.lengthB - (p.model === "G-left" && through("far") ? d : 0), p.spans?.B?.[1] ?? p.lengthB)];
    zones.push({ id: "B", label: "Mur B", kind: "run", outline: rect(0, -end, d, -start), run: { plane: "YZ", offset: 0, start: -end, length: end - start, depth: d, origin: [0, 0], normal: [1, 0] } });
  }
  if (asks("lengthC")) {
    const [start, end] = [Math.max(gap("right"), p.spans?.C?.[0] ?? 0), Math.min(p.lengthC - (p.model === "G-right" && through("far") ? d : 0), p.spans?.C?.[1] ?? p.lengthC)];
    const frame: PlaneFrame = { origin: [l, 0, 0], xDir: [0, -1, 0], normal: [-1, 0, 0] };
    zones.push({ id: "C", label: "Mur C", kind: "run", outline: rect(l - d, -end, l, -start), run: { plane: "YZ", offset: l, frame, start, length: end - start, depth: d, origin: [l, 0], normal: [-1, 0] } });
  }
  // Across the way, its back to the far wall, facing wall A: u goes along −X.
  if (p.model === "facing") zones.push(standing("D", "Mur D", [0, -(2 * d + p.aisle)], [0, 1], -p.lengthD, p.lengthD, d));
  if (closing) {
    // The length asked is what stands out of the side wall: wall D running through its corner adds that wall's depth.
    const left = p.model === "G-left";
    const length = p.lengthE + (through("far") ? d : 0);
    zones.push(standing("D", "Mur D", [0, -(left ? p.lengthB : p.lengthC)], [0, 1], left ? -d - p.lengthE : through("far") ? -l : d - l, length, d));
  }
  // Its back against the back of wall A's run, or on the same wall, less deep.
  if (p.model === "back") zones.push(standing("D", "Face arrière", [0, 0], [0, 1], -l, l, d));
  if (p.model === "depths") zones.push({ id: "S", label: "2e partie", kind: "run", outline: rect(a1, -p.depthB, l, 0), run: { ...facingA, start: a1, length: p.lengthE, depth: p.depthB } });
  if (p.island && !model.noIsland) zones.push(standing("I", "Îlot", [0, -d - p.aisle], [0, -1], (l - p.islandLength) / 2, p.islandLength, p.islandDepth));
  return zones;
}

/** The height of a zone: the plan's, or less under a low ceiling of its wall. */
export function zoneHeight(p: DressingPlan, zone: PlanZone): number {
  const wall = zone.kind === "corner" ? "A" : zone.id;
  return Math.min(p.height, p.low?.[wall as "A" | "B" | "C"] ?? p.height);
}

/** Its smallest and largest X and Y. */
function bounds({ outline }: PlanZone): [number, number, number, number] {
  const [xs, ys] = [outline.map((q) => q[0]), outline.map((q) => q[1])];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Why this plan cannot be made, or null. */
export function planProblem(p: DressingPlan): string | null {
  const model = PLAN_MODELS[p.model];
  if (!(p.height >= 1200 && p.height <= 4000)) return "La hauteur va de 120 à 400 cm.";
  if (!(p.depth >= 300 && p.depth <= 900)) return "La profondeur va de 30 à 90 cm.";
  if (!(p.thickness >= 10 && p.thickness <= 40)) return "L'épaisseur des panneaux va de 10 à 40 mm.";
  if (!(p.plinth >= 0 && p.plinth <= 300)) return "Le socle va de 0 à 30 cm.";
  if (p.model === "facing" && !(p.aisle >= 500)) return "Le passage entre les deux linéaires fait 50 cm au moins.";
  if (model.cut.length && (p.cornerA < p.depth + 100 || p.cornerB < p.depth + 100)) return `Un angle ${model.ell ? "en L" : model.round ? "arrondi" : "coupé"} dépasse la profondeur d'au moins 10 cm de chaque côté.`;
  if (p.model === "depths" && !(p.depthB >= 150 && p.depthB <= 900)) return "La 2e profondeur va de 15 à 90 cm.";
  if (p.model === "G-left" || p.model === "G-right") {
    if (p.lengthA - 2 * p.depth - p.lengthE < 500) return "L'entrée fait 50 cm au moins : raccourcissez le mur D.";
    if ((p.model === "G-left" ? p.lengthB : p.lengthC) - 2 * p.depth < 500) return "Le passage entre le mur A et le mur D fait 50 cm au moins.";
  }
  if (p.roof && !(p.roofLow >= p.plinth + 400 && p.roofLow < p.height)) return "Le bas du rampant est sous la hauteur, à 40 cm au moins au-dessus du socle.";
  const zones = planZones(p);
  const short = zones.find((z) => z.run.length < 400);
  if (short) return `${short.label} est trop court : 40 cm au moins, après l'angle.`;
  const island = zones.find((z) => z.id === "I");
  if (island) {
    if (!(p.aisle >= 500)) return "Le passage devant l'îlot fait 50 cm au moins.";
    if (!(p.islandDepth >= 300 && p.islandDepth <= 1200)) return "La profondeur de l'îlot va de 30 à 120 cm.";
    const [x0, y0, x1, y1] = bounds(island);
    const hit = zones.find((z) => {
      if (z === island) return false;
      const [a, b, c, d] = bounds(z);
      return x0 < c && a < x1 && y0 < d && b < y1;
    });
    if (hit) return `L'îlot touche ${hit.label} : réduisez-le ou changez le passage.`;
  }
  return null;
}

/** A slope of the plan as it stands in the room, its quarter turn and its shift taken into account. */
function placedSlope(slope: Pick<SlopedCeiling, "axis" | "at" | "rise">, place: DressingPlan["place"]): Pick<SlopedCeiling, "axis" | "at" | "rise"> {
  if (!place) return slope;
  const unit: Vec3 = slope.axis === "x" ? [1, 0, 0] : [0, 1, 0];
  const [dx, dy] = turn(place, unit);
  const point = placePoint(place, [unit[0] * slope.at, unit[1] * slope.at, 0]);
  return Math.abs(dx) > 0.5 ? { axis: "x", at: point[0], rise: slope.rise * dx } : { axis: "y", at: point[1], rise: slope.rise * dy };
}

/** The sloped ceiling of this plan, or none: `under`, mm below it (the underside of the top boards, measured upright). */
export function planCeiling(p: DressingPlan, under = 0): SlopedCeiling | undefined {
  if (!p.roof) return undefined;
  const rise = (p.height - p.roofLow) / (p.roof === "wall" ? p.depth : p.lengthA);
  const slope = p.roof === "left" ? { axis: "x" as const, at: 0, rise } : p.roof === "right" ? { axis: "x" as const, at: p.lengthA, rise: -rise } : { axis: "y" as const, at: 0, rise: -rise };
  return { ...placedSlope(slope, p.place), height: p.roofLow - under, cap: p.height - under };
}

/** How thick a top board is, measured upright, under this ceiling. */
export const upright = (p: DressingPlan): number => {
  const c = planCeiling(p);
  return p.thickness * Math.hypot(1, c?.rise ?? 0);
};

/** The lines of the plan: each outline, and inside it the sides that close it, as on a plan (each line once). */
export function planLines(p: DressingPlan): [Point, Point][] {
  const lines = new Map<string, [Point, Point]>();
  const add = (a: Point, b: Point) => {
    const key = [a, b].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).sort().join("|");
    lines.set(key, [a, b]);
  };
  const t = p.thickness;
  for (const zone of planZones(p)) {
    zone.outline.forEach((a, i) => add(a, zone.outline[(i + 1) % zone.outline.length] as Point));
    if (zone.kind === "corner") {
      const inner = cornerOutline(p, zone.id === "left" ? "left" : "right", t);
      add(inner[1] as Point, inner[2] as Point);
      add(inner[inner.length - 2] as Point, inner[inner.length - 1] as Point);
    } else {
      const { start, length, depth } = zone.run;
      for (const along of [start + t, start + length - t]) add(runPoint(zone, along, 0), runPoint(zone, along, depth));
    }
  }
  return [...lines.values()];
}
