/**
 * Le plan d'un dressing, vu de dessus : un modèle — droit, en L à gauche ou à droite, en U, avec des angles droits ou à
 * pan coupé —, ses cotes, et les zones qu'ils font : un linéaire par mur, séparés par leurs côtés (les doubles traits du
 * plan), et un pentagone là où l'angle est coupé. Le plan est une esquisse au sol qui garde ces réglages (`dressingPlan`) ;
 * chaque zone reçoit ensuite, à la demande, sa Répartition contre son mur, et toutes suivent quand le plan change. L'angle
 * coupé est lui aussi une Répartition, alignée sur le mur A et découpée au pentagone (`clip`) : Étagères, Niche, Module et
 * Penderie y marchent ; son dernier côté et sa porte sur le pan coupé, de biais, s'ajoutent autour d'elle. « Remplir »
 * découpe une zone libre en caissons d'une largeur voulue, le reste allant à un caisson ou à un fileur exacts.
 *
 * Repère de l'assistant Dressing (document/dressing-plan.ts) : le mur A a sa face en Y = 0 et va vers +X, le dressing est
 * devant lui (Y < 0) ; le mur B a sa face en X = 0 à gauche, le mur C en X = longueur de A à droite, tous deux vers −Y.
 * Pur.
 */
import { addExtrude, deleteFeatures, findFeature, uniqueId, uniqueName, uniqueOffsetId, updateFeature } from "./operations";
import type { PartitionParams, SketchGeometry } from "./sketch";
import { emptySketchGeometry } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, DressingPlan, PlaneFrame, PlaneName, SketchFeature, Vec3 } from "./types";
import { hingeCount } from "../features/fronts-parts";
import { nearestPlane } from "../sketcher/frame";
import { partitionLayout } from "../sketcher/partition";
import { extrusionGroups, isPartition, partitionRecord, rebuildChain } from "../sketcher/partition-history";

export type PlanModel = DressingPlan["model"];
type Corner = "left" | "right";
type Point = [number, number];

/** Around the door of a cut corner (mm). */
const GAP = 3;

export const PLAN_MODELS: Record<PlanModel, { label: string; walls: ("A" | "B" | "C" | "D")[]; corners: Corner[]; cut: boolean }> = {
  I: { label: "Droit", walls: ["A"], corners: [], cut: false },
  "L-left": { label: "En L à gauche", walls: ["A", "B"], corners: ["left"], cut: false },
  "L-right": { label: "En L à droite", walls: ["A", "C"], corners: ["right"], cut: false },
  U: { label: "En U", walls: ["A", "B", "C"], corners: ["left", "right"], cut: false },
  "L-left-cut": { label: "En L à gauche, pan coupé", walls: ["A", "B"], corners: ["left"], cut: true },
  "L-right-cut": { label: "En L à droite, pan coupé", walls: ["A", "C"], corners: ["right"], cut: true },
  "U-cut": { label: "En U, pans coupés", walls: ["A", "B", "C"], corners: ["left", "right"], cut: true },
  facing: { label: "Face à face", walls: ["A", "D"], corners: [], cut: false },
};

export const PLAN: DressingPlan = { model: "L-right-cut", lengthA: 3000, lengthB: 2000, lengthC: 2000, lengthD: 3000, aisle: 1000, depth: 600, cornerA: 1000, cornerB: 1000, thickness: 18, height: 2500, plinth: 80 };

/** A zone of the plan: a run along a wall, or the pentagon of a cut corner. Each has its Répartition. */
export interface PlanZone {
  id: string;
  label: string;
  kind: "run" | "corner";
  /** Its outline, seen from above. */
  outline: Point[];
  /** Where its Répartition goes, and how deep it is. */
  run: { plane: PlaneName; offset: number; frame?: PlaneFrame; start: number; length: number; depth: number };
  /** A cut corner: what of its panels stands. */
  clip?: Point[];
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** The pentagon of a corner, the wall corner first; the one on the right is the mirror of the one on the left. */
function pentagon(p: DressingPlan, corner: Corner, inset = 0): Point[] {
  const { depth: d, cornerA: a, cornerB: b, lengthA: l } = p;
  // The front is cut from (a, −d) to (d, −b); inset: its ends where the sides of the corner stop it.
  const [ea, eb] = [a - inset, b - inset];
  const shape: Point[] = [[0, 0], [ea, 0], [ea, -d - (inset * (b - d)) / (a - d)], [d + (inset * (a - d)) / (b - d), -eb], [0, -eb]];
  return corner === "left" ? shape : shape.map(([x, y]): Point => [l - x, y]);
}

/** The panels of a corner stand over its pentagon, up to its far side (itself a board apart). */
function cornerClip(p: DressingPlan, corner: Corner): Point[] {
  const { depth: d, cornerA: a, cornerB: b, thickness: t, lengthA: l } = p;
  const shape: Point[] = [[0, 0], [a, 0], [a, -d], [d + (t * (a - d)) / (b - d), t - b], [0, t - b]];
  return corner === "left" ? shape : shape.map(([x, y]): Point => [l - x, y]);
}

/** The zones of this plan, from left to right along the walls. */
export function planZones(p: DressingPlan): PlanZone[] {
  const { walls, corners, cut } = PLAN_MODELS[p.model];
  const { depth: d, lengthA: l } = p;
  const from = (corner: Corner) => (corners.includes(corner) && cut ? p.cornerA : 0);
  const start = cut ? p.cornerB : d;
  const zones: PlanZone[] = [];
  const [a0, a1] = [from("left"), l - from("right")];
  const corner = (side: Corner, id: string, label: string, start: number): PlanZone => ({ id, label, kind: "corner", outline: pentagon(p, side), run: { plane: "XZ", offset: 0, start, length: p.cornerA, depth: p.cornerB }, clip: cornerClip(p, side) });
  if (corners.includes("left") && cut) zones.push(corner("left", "left", "Angle gauche", 0));
  zones.push({ id: "A", label: "Mur A", kind: "run", outline: rect(a0, -d, a1, 0), run: { plane: "XZ", offset: 0, start: a0, length: a1 - a0, depth: d } });
  if (corners.includes("right") && cut) zones.push(corner("right", "right", "Angle droit", l - p.cornerA));
  if (walls.includes("B")) zones.push({ id: "B", label: "Mur B", kind: "run", outline: rect(0, -p.lengthB, d, -start), run: { plane: "YZ", offset: 0, start: -p.lengthB, length: p.lengthB - start, depth: d } });
  if (walls.includes("C")) {
    const frame: PlaneFrame = { origin: [l, 0, 0], xDir: [0, -1, 0], normal: [-1, 0, 0] };
    zones.push({ id: "C", label: "Mur C", kind: "run", outline: rect(l - d, -p.lengthC, l, -start), run: { plane: "YZ", offset: l, frame, start, length: p.lengthC - start, depth: d } });
  }
  if (walls.includes("D")) {
    // Across the way, its back to the far wall, facing wall A: u goes along −X.
    const back = -(2 * d + p.aisle);
    const frame: PlaneFrame = { origin: [0, back, 0], xDir: [-1, 0, 0], normal: [0, 1, 0] };
    zones.push({ id: "D", label: "Mur D", kind: "run", outline: rect(0, back, p.lengthD, back + d), run: { plane: "XZ", offset: 0, frame, start: -p.lengthD, length: p.lengthD, depth: d } });
  }
  return zones;
}

/** Why this plan cannot be made, or null. */
export function planProblem(p: DressingPlan): string | null {
  if (!(p.height >= 1200 && p.height <= 4000)) return "La hauteur va de 120 à 400 cm.";
  if (!(p.depth >= 300 && p.depth <= 900)) return "La profondeur va de 30 à 90 cm.";
  if (!(p.thickness >= 10 && p.thickness <= 40)) return "L'épaisseur des panneaux va de 10 à 40 mm.";
  if (!(p.plinth >= 0 && p.plinth <= 300)) return "Le socle va de 0 à 30 cm.";
  if (p.model === "facing" && !(p.aisle >= 500)) return "Le passage entre les deux linéaires fait 50 cm au moins.";
  if (PLAN_MODELS[p.model].cut && (p.cornerA < p.depth + 100 || p.cornerB < p.depth + 100)) return "Un angle coupé dépasse la profondeur d'au moins 10 cm de chaque côté.";
  const short = planZones(p).find((z) => z.run.length < 400);
  return short ? `${short.label} est trop court : 40 cm au moins, après l'angle.` : null;
}

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
      const inner = pentagon(p, zone.id === "left" ? "left" : "right", t);
      add(inner[1] as Point, inner[2] as Point);
      add(inner[3] as Point, inner[4] as Point);
    } else if (zone.id === "A" || zone.id === "D") {
      const [[x0, y0], , [x1, y1]] = zone.outline as [Point, Point, Point, Point];
      add([x0 + t, y0], [x0 + t, y1]);
      add([x1 - t, y0], [x1 - t, y1]);
    } else {
      const [[x0, y0], , [x1, y1]] = zone.outline as [Point, Point, Point, Point];
      add([x0, y0 + t], [x1, y0 + t]);
      add([x0, y1 - t], [x1, y1 - t]);
    }
  }
  return [...lines.values()];
}

/** A closed or open set of lines as a sketch: points shared, nothing constrained. */
function linesGeometry(lines: [Point, Point][]): SketchGeometry {
  const g = emptySketchGeometry();
  const ids = new Map<string, string>();
  const point = ([x, y]: Point) => {
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    let id = ids.get(key);
    if (!id) {
      id = `p${ids.size + 1}`;
      ids.set(key, id);
      g.points.push({ id, x, y });
    }
    return id;
  };
  lines.forEach(([a, b], i) => g.curves.push({ id: `l${i + 1}`, kind: "line", p1: point(a), p2: point(b) }));
  return g;
}

const loop = (outline: Point[]): [Point, Point][] => outline.map((a, i) => [a, outline[(i + 1) % outline.length] as Point]);

/** The plan on the floor: a sketch that keeps its settings. */
export function withPlan(doc: CadDocument, p: DressingPlan): { doc: CadDocument; id: string } {
  const id = uniqueId(doc, "sk");
  const sketch: SketchFeature = { id, type: "sketch", name: "Plan du dressing", plane: "XY", offset: 0, dressingPlan: p, ...linesGeometry(planLines(p)) };
  return { doc: { ...doc, features: [...doc.features, sketch] }, id };
}

export const planOf = (doc: CadDocument): SketchFeature | undefined => [...doc.features].reverse().find((f): f is SketchFeature => f.type === "sketch" && f.dressingPlan !== undefined);

const planIn = (doc: CadDocument, planId: string) => (findFeature(doc, planId) as SketchFeature | undefined)?.dressingPlan;
const withSettings = (doc: CadDocument, planId: string, patch: Partial<DressingPlan>) =>
  updateFeature(doc, planId, (f) => (f.type === "sketch" && f.dressingPlan ? { ...f, dressingPlan: { ...f.dressingPlan, ...patch } } : f));

/** The sketch of what was made on a zone, still in the document. */
const zoneSketch = (doc: CadDocument, plan: DressingPlan, id: string): SketchFeature | undefined => {
  const made = plan.made?.[id] ? findFeature(doc, plan.made[id] as string) : undefined;
  return made?.type === "sketch" ? made : undefined;
};

export const zoneDone = (doc: CadDocument, plan: DressingPlan, id: string): boolean => zoneSketch(doc, plan, id) !== undefined;

/** The step of the Répartition of a zone, to open it in its tool. */
export function zoneStep(doc: CadDocument, plan: DressingPlan, id: string): { sketch: string; step: string } | null {
  const sketch = zoneSketch(doc, plan, id);
  const step = sketch?.offsets?.find(isPartition);
  return sketch && step ? { sketch: sketch.id, step: step.id } : null;
}

/** One way of filling a zone: the width of each case, the one left over, closed by a filler or not. */
export interface FillChoice {
  label: string;
  cases: number[];
  /** The case that takes what is left (null: none does, all are equal). */
  rest: number | null;
  filler: boolean;
}

const cmText = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
/** What a case left over must leave between its sides (mm). */
const THINNEST = 30;
const NARROW_CABINET = 150;
const WIDEST_FILLER = 300;

/**
 * The ways of filling this length with cases `width` wide inside (all the sides counted): the cases as asked and what is
 * left in a cabinet or behind a filler, or equal cases that fill it all. `first`: what is left goes at the start of the run.
 */
export function fillChoices(length: number, thickness: number, width: number, first: boolean): FillChoice[] {
  const n = Math.floor((length - thickness) / (width + thickness));
  const choices: FillChoice[] = [];
  const equal = (count: number) => (length - (count + 1) * thickness) / count;
  if (n >= 1) {
    const left = length - (n + 1) * thickness - n * width;
    const rest = left - thickness;
    const made = (kind: string, filler: boolean): FillChoice => {
      const cases = Array.from({ length: n }, () => width);
      return { label: `${plural(n, "caisson")} de ${cmText(width)} et ${kind} de ${cmText(rest)}`, cases: first ? [rest, ...cases] : [...cases, rest], rest: first ? 0 : n, filler };
    };
    if (left < 0.5) choices.push({ label: `${plural(n, "caisson")} de ${cmText(width)}, juste à la bonne longueur`, cases: Array.from({ length: n }, () => width), rest: null, filler: false });
    else {
      if (rest >= THINNEST && rest <= WIDEST_FILLER) choices.push(made("un fileur", true));
      if (rest >= NARROW_CABINET) choices.push(made("un caisson", false));
    }
  }
  for (const count of [Math.max(n, 1), n + 1]) {
    const each = equal(count);
    if (each >= NARROW_CABINET && Math.abs(each - width) >= 0.5) choices.push({ label: `${plural(count, "caisson")} ${count > 1 ? "égaux" : "égal"} de ${cmText(each)}`, cases: Array.from({ length: count }, () => each), rest: null, filler: false });
  }
  return choices;
}

/** Where a point of a run is on the floor: `along` its wall as its sketch counts, `off` the wall. */
function runPoint(plan: DressingPlan, zone: PlanZone, along: number, off: number): Point {
  if (zone.id === "B") return [off, along];
  if (zone.id === "C") return [plan.lengthA - off, -along];
  if (zone.id === "D") return [-along, -(2 * plan.depth + plan.aisle) + off];
  return [along, -off];
}

/** A sheet of the plan: a closed shape in a sketch of its own, hidden, made into one body of this thickness. */
function sheet(doc: CadDocument, name: string, shape: Point[], where: { offset: number; frame?: PlaneFrame }, distance: number): CadDocument {
  const id = uniqueId(doc, "sk");
  const sketch: SketchFeature = { id, type: "sketch", name, plane: where.frame ? nearestPlane(where.frame.normal) : "XY", offset: where.offset, ...(where.frame ? { frame: where.frame } : {}), hidden: true, ...linesGeometry(loop(shape)) };
  const next = addExtrude({ ...doc, features: [...doc.features, sketch] }, id, distance);
  const body = next.features[next.features.length - 1]?.id as string;
  return { ...updateFeature(next, body, (f) => ({ ...f, name })), bodyNames: { ...next.bodyNames, [body]: name } };
}

/** The door of a cut corner, on its slanted front: applied over it, with its hinges (bought parts, for the quote). */
function withCornerDoor(doc: CadDocument, plan: DressingPlan, zone: PlanZone): CadDocument {
  const side: Corner = zone.id === "left" ? "left" : "right";
  const [wall, , a, b] = pentagon(plan, side) as [Point, Point, Point, Point, Point];
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(ex, ey);
  const out = (ey * (a[0] - wall[0]) - ex * (a[1] - wall[1]) > 0 ? 1 : -1) / length;
  const normal: [number, number] = [ey * out, -ex * out];
  const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const frame: PlaneFrame = { origin: [middle[0], middle[1], 0], xDir: [-normal[1], normal[0], 0], normal: [normal[0], normal[1], 0] };
  const [half, z0, z1] = [length / 2 - GAP, plan.plinth + GAP, plan.height - GAP];
  const next = sheet(doc, `${zone.label} — porte`, rect(-half, z0, half, z1), { offset: 0, frame }, plan.thickness);
  const hinges = hingeCount(z1 - z0);
  const [hx, hy] = [a[0] + (ex / length) * 40 - normal[0] * 20, a[1] + (ey / length) * 40 - normal[1] * 20];
  const parts = Array.from({ length: hinges }, (_, i) => {
    const z = z0 + 100 + (i * (z1 - z0 - 200)) / Math.max(1, hinges - 1);
    return { name: `${zone.label} — charnière ${i + 1}`, from: [hx - 10, hy - 10, z - 10] as Vec3, to: [hx + 10, hy + 10, z + 10] as Vec3, hardware: true, item: "Charnière à boîtier Ø35" };
  });
  return { ...next, features: [...next.features, { id: uniqueId(next, "fi"), type: "trim", name: uniqueName(next, `${zone.label} — charnières`), parts }] };
}

/** The filler closing the case of a zone that takes what is left: flush with the front, as wide as the case. */
function withFiller(doc: CadDocument, plan: DressingPlan, zone: PlanZone, rest: number): CadDocument {
  const step = plan.made?.[zone.id] ? (findFeature(doc, plan.made[zone.id] as string) as SketchFeature | undefined)?.offsets?.find(isPartition)?.step : undefined;
  const layout = step ? partitionLayout(step.input) : null;
  const span = layout && typeof layout === "object" ? layout.caseSpans[rest] : undefined;
  if (!step || !span) return doc;
  const [a, b] = [step.origin[0] + span[0], step.origin[0] + span[1]];
  const { depth: d, thickness: t, plinth, height } = plan;
  return sheet(doc, `${zone.label} — fileur`, [runPoint(plan, zone, a, d - t), runPoint(plan, zone, b, d - t), runPoint(plan, zone, b, d), runPoint(plan, zone, a, d)], { offset: plinth }, height - plinth);
}

/** What closes a zone around its Répartition, made again: a corner's far side and door when asked, a filler. */
function withZoneBoards(base: CadDocument, planId: string, zone: PlanZone): CadDocument {
  const plan = planIn(base, planId) as DressingPlan;
  const { next: clean } = deleteFeatures(base, plan.boards?.[zone.id] ?? []);
  const { cornerB: b, depth: d, thickness: t, height, lengthA: l } = plan;
  let doc = clean;
  if (zone.kind === "corner") {
    doc = sheet(doc, `${zone.label} — côté`, zone.id === "left" ? rect(0, -b, d, t - b) : rect(l - d, -b, l, t - b), { offset: 0 }, height);
    if (plan.cornerDoor) doc = withCornerDoor(doc, plan, zone);
  }
  const fill = plan.fills?.[zone.id];
  if (fill?.filler) doc = withFiller(doc, plan, zone, fill.rest);
  const known = new Set(clean.features.map((f) => f.id));
  return withSettings(doc, planId, { boards: { ...plan.boards, [zone.id]: doc.features.filter((f) => !known.has(f.id)).map((f) => f.id) } });
}

const placed = ({ run, clip }: PlanZone) => ({ plane: run.plane, offset: run.offset, ...(run.frame ? { frame: run.frame } : {}), ...(clip ? { clip } : {}) });

/** The Répartition of a zone, against its wall: about one case per 80 cm, to set in its tool; one case in a corner; or the cases of `fill`. */
export function withZonePartition(doc: CadDocument, planId: string, zone: PlanZone, fill?: FillChoice): { doc: CadDocument; sketch: string; step: string } | string {
  const plan = planIn(doc, planId);
  if (!plan) return "Ce plan n'existe plus.";
  const { start, length, depth } = zone.run;
  const corner = zone.kind === "corner";
  // A Répartition has 2 cases at least: one is 2 cases with no side between them.
  const whole = corner || fill?.cases.length === 1;
  const cases = whole ? 2 : (fill?.cases.length ?? Math.max(2, Math.min(10, Math.round(length / 800))));
  const input: PartitionParams = {
    length, height: plan.height, thickness: plan.thickness, cases, dividers: Array.from({ length: cases - 1 }, () => (whole ? ("none" as const) : ("single" as const))),
    ...(fill && !whole ? { widths: fill.cases } : {}), boards: true, plinth: plan.plinth, outer: "board", single: "board", double: "side",
  };
  const step = uniqueOffsetId(doc);
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord(step, `Répartition — ${zone.label.toLowerCase()}`, input, [start, 0], depth)] }, step);
  if (typeof rebuilt === "string") return rebuilt;
  const sketch = uniqueId(doc, "sk");
  const feature: SketchFeature = { id: sketch, type: "sketch", name: `Plan — ${zone.label.toLowerCase()}`, ...placed(zone), ...emptySketchGeometry() };
  const made = withSketchExtrusion({ ...doc, features: [...doc.features, feature] }, sketch, rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
  const { [zone.id]: _old, ...fills } = plan.fills ?? {};
  const kept = fill && !whole && fill.rest !== null ? { fills: { ...fills, [zone.id]: { cases: fill.cases, rest: fill.rest, filler: fill.filler } } } : { fills };
  const next = withSettings(made, planId, { made: { ...plan.made, [zone.id]: sketch }, ...kept });
  return { doc: corner || fill?.filler ? withZoneBoards(next, planId, zone) : next, sketch, step };
}

/** A door on the cut corners, or none: those already made follow. */
export function withCornerDoors(base: CadDocument, planId: string, on: boolean): CadDocument {
  let doc = withSettings(base, planId, { cornerDoor: on });
  const plan = planIn(doc, planId) as DressingPlan;
  for (const zone of planZones(plan)) if (zone.kind === "corner" && zoneDone(doc, plan, zone.id)) doc = withZoneBoards(doc, planId, zone);
  return doc;
}

/** What was made on a zone that the new plan no longer has. */
function withoutZone(doc: CadDocument, sketch: SketchFeature, boards: string[]): CadDocument {
  const bodies = (sketch.offsets ?? []).flatMap((r) => r.bodies ?? []);
  const equipment = doc.features.filter((f) => f.type === "niche" && f.sketch === sketch.id).map((f) => f.id);
  return deleteFeatures(doc, [...bodies, ...equipment, ...boards, sketch.id]).next;
}

/** A Répartition at its new place and sizes: what is in it stays, as far as it still fits. */
function withZoneFollowing(doc: CadDocument, sketch: SketchFeature, zone: PlanZone, plan: DressingPlan): { doc: CadDocument; problems: string[] } | string {
  // The cases filled to size keep their width: the one left over takes the change.
  const fill = plan.fills?.[zone.id];
  const others = fill ? fill.cases.reduce((sum, w, i) => (i === fill.rest ? sum : sum + w), 0) : 0;
  const left = fill ? zone.run.length - (fill.cases.length + 1) * plan.thickness - others : 0;
  const cases = fill && left >= THINNEST ? fill.cases.map((w, i) => (i === fill.rest ? left : w)) : null;
  if (fill && cases) fill.cases = cases;
  const offsets = (sketch.offsets ?? []).map((r) =>
    isPartition(r) ? { ...r, step: { ...r.step, origin: [zone.run.start, 0] as [number, number], depth: zone.run.depth, input: { ...r.step.input, ...(cases ? { widths: cases } : {}), length: zone.run.length, height: plan.height, thickness: plan.thickness, plinth: plan.plinth } } } : r,
  );
  const { frame: _frame, clip: _clip, ...rest } = sketch;
  const moved: SketchFeature = { ...rest, ...placed(zone), offsets };
  const partition = offsets.find(isPartition);
  const rebuilt = partition ? rebuildChain(moved, partition.id) : "Cette répartition n'existe plus.";
  if (typeof rebuilt === "string") return `${zone.label} : ${rebuilt}`;
  const next = updateFeature(doc, sketch.id, () => moved);
  return { doc: withSketchExtrusion(next, sketch.id, rebuilt.geometry, { groups: extrusionGroups(offsets, rebuilt) }), problems: rebuilt.problems.map((p) => `${zone.label} — ${p}`) };
}

/** The zones made that this plan would take away. */
export function zonesLost(doc: CadDocument, planId: string, next: DressingPlan): string[] {
  const plan = planIn(doc, planId);
  const kept = new Set(planZones(next).map((z) => z.id));
  return plan ? planZones(plan).filter((z) => !kept.has(z.id) && zoneDone(doc, plan, z.id)).map((z) => z.label) : [];
}

/** The plan changed: its lines, and everything made on it, at the new sizes. A string: why it cannot be. */
export function withPlanChanged(base: CadDocument, planId: string, next: DressingPlan): { doc: CadDocument; problems: string[] } | string {
  const plan = planIn(base, planId);
  if (!plan) return "Ce plan n'existe plus.";
  const zones = planZones(next);
  const made = { ...plan.made };
  const boards = { ...plan.boards };
  const fills = structuredClone(plan.fills ?? {});
  const problems: string[] = [];
  let doc = base;
  for (const id of Object.keys(made)) {
    const sketch = zoneSketch(base, plan, id);
    const zone = zones.find((z) => z.id === id);
    if (sketch && !zone) doc = withoutZone(doc, sketch, boards[id] ?? []);
    if (!sketch || !zone) {
      delete made[id];
      delete boards[id];
      delete fills[id];
    }
    if (!sketch || !zone) continue;
    const follows = withZoneFollowing(doc, findFeature(doc, sketch.id) as SketchFeature, zone, { ...next, fills });
    if (typeof follows === "string") return follows;
    doc = follows.doc;
    problems.push(...follows.problems);
  }
  doc = updateFeature(doc, planId, (f) => (f.type === "sketch" ? { ...f, ...linesGeometry(planLines(next)), dressingPlan: { ...next, made, boards, fills } } : f));
  for (const zone of zones) if (made[zone.id] && (zone.kind === "corner" || fills[zone.id]?.filler)) doc = withZoneBoards(doc, planId, zone);
  return { doc, problems };
}
