/**
 * Le plan d'un dressing posé dans le projet : une esquisse au sol qui garde ses réglages (`dressingPlan`) ; chaque zone
 * (plan-shapes.ts) reçoit ensuite, à la demande, sa Répartition contre son mur, et toutes suivent quand le plan change.
 * Un angle est lui aussi une Répartition, alignée sur le mur A et découpée à son contour (`clip`) : Étagères, Niche, Module
 * et Penderie y marchent ; son dernier côté et sa porte, de biais ou cintrée, s'ajoutent autour d'elle. Sous un rampant,
 * tout s'arrête sous le plafond (`ceiling`) et le dessus de chaque zone est une planche en pente. « Remplir » découpe une
 * zone libre en caissons d'une largeur voulue, le reste allant à un caisson ou à un fileur exacts. « Surmeubles » : au-dessus
 * de chaque zone faite, une Répartition de leur hauteur aux mêmes cases que celle du dessous, posée sur elle, avec ses
 * portes ou ouverte (un angle : découpée à son contour, avec son dernier côté, ouvert) ; refaite quand le plan change. Pur.
 */
import { slidingDoors } from "./dressing-extras";
import { WALL_THICKNESS, withWallBoxes, type WallBox } from "./dressing-plan";
import { addExtrude, deleteFeatures, findFeature, uniqueId, uniqueName, uniqueOffsetId, updateFeature } from "./operations";
import { arcDoor, circleDoor, cornerOutline, ellFaces, PLAN_MODELS, planCeiling, planLines, planZones, rect, runPoint, upright, zoneHeight, type Corner, type PlanZone, type Point } from "./plan-shapes";
import type { PartitionParams, SketchGeometry } from "./sketch";
import { emptySketchGeometry } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, DressingPlan, PlaneFrame, SketchFeature, SlopedCeiling, Vec3 } from "./types";
import { hingeCount } from "../features/fronts-parts";
import { placeBox, placeFrame, placePoint } from "../features/room-runs";
import { nearestPlane, sketchFrame } from "../sketcher/frame";
import { partitionLayout } from "../sketcher/partition";
import { extrusionGroups, isPartition, partitionRecord, rebuildChain } from "../sketcher/partition-history";
import { withTopOff, withTopOn } from "./plan-top";

export { topProblem, topStep, withTopUnitsSet } from "./plan-top";

/** Around the door of a cut corner (mm). */
const GAP = 3;

/** A closed or open set of lines as a sketch: points shared, nothing constrained. */
export function linesGeometry(lines: [Point, Point][]): SketchGeometry {
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

/** A point of the plan where it stands: in its room, or as it is. */
export const onFloor = (plan: DressingPlan, [x, y]: Point): Point => {
  if (!plan.place) return [x, y];
  const [wx, wy] = placePoint(plan.place, [x, y, 0]);
  return [wx, wy];
};
const planSketch = (plan: DressingPlan) => linesGeometry(planLines(plan).map(([a, b]): [Point, Point] => [onFloor(plan, a), onFloor(plan, b)]));

const loop = (outline: Point[]): [Point, Point][] => outline.map((a, i) => [a, outline[(i + 1) % outline.length] as Point]);

/** The plan on the floor: a sketch that keeps its settings. */
export function withPlan(doc: CadDocument, p: DressingPlan): { doc: CadDocument; id: string } {
  const id = uniqueId(doc, "sk");
  const sketch: SketchFeature = { id, type: "sketch", name: "Plan du dressing", plane: "XY", offset: 0, dressingPlan: p, ...planSketch(p) };
  return { doc: { ...doc, features: [...doc.features, sketch] }, id };
}

export const planOf = (doc: CadDocument): SketchFeature | undefined => [...doc.features].reverse().find((f): f is SketchFeature => f.type === "sketch" && f.dressingPlan !== undefined);

export const planIn = (doc: CadDocument, planId: string) => (findFeature(doc, planId) as SketchFeature | undefined)?.dressingPlan;
export const withSettings = (doc: CadDocument, planId: string, patch: Partial<DressingPlan>) =>
  updateFeature(doc, planId, (f) => (f.type === "sketch" && f.dressingPlan ? { ...f, dressingPlan: { ...f.dressingPlan, ...patch } } : f));

/** The sketch of what was made on a zone, still in the document. */
export const zoneSketch = (doc: CadDocument, plan: DressingPlan, id: string): SketchFeature | undefined => {
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

/** A sheet of the plan: a closed shape in a sketch of its own, hidden, made into one body of this thickness. */
export function sheet(doc: CadDocument, name: string, shape: Point[] | SketchGeometry, where: { offset: number; frame?: PlaneFrame }, distance: number, ceiling?: SlopedCeiling): CadDocument {
  const id = uniqueId(doc, "sk");
  const sketch: SketchFeature = { id, type: "sketch", name, plane: where.frame ? nearestPlane(where.frame.normal) : "XY", offset: where.offset, ...(where.frame ? { frame: where.frame } : {}), hidden: true, ...(Array.isArray(shape) ? linesGeometry(loop(shape)) : shape) };
  const next = addExtrude({ ...doc, features: [...doc.features, sketch] }, id, distance);
  const body = next.features[next.features.length - 1]?.id as string;
  return { ...updateFeature(next, body, (f) => (f.type === "extrude" ? { ...f, name, ...(ceiling ? { ceiling } : {}) } : f)), bodyNames: { ...next.bodyNames, [body]: name } };
}

/** A curved board: two arcs around one centre, closed by the lines between their ends. */
function arcBand({ center, outer, inner, from, to }: NonNullable<ReturnType<typeof circleDoor>>): SketchGeometry {
  const g = emptySketchGeometry();
  const at = (radius: number, angle: number): Point => [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  const points = [center, at(outer, from), at(outer, to), at(inner, from), at(inner, to)];
  points.forEach(([x, y], i) => g.points.push({ id: `p${i}`, x, y }));
  g.curves.push(
    { id: "a1", kind: "arc", center: "p0", start: "p1", end: "p2", radius: outer, startAngle: from, endAngle: to },
    { id: "a2", kind: "arc", center: "p0", start: "p3", end: "p4", radius: inner, startAngle: from, endAngle: to },
    { id: "l1", kind: "line", p1: "p1", p2: "p3" },
    { id: "l2", kind: "line", p1: "p2", p2: "p4" },
  );
  return g;
}

/** What stops under the top boards of a plan under a slope. */
const belowTop = (plan: DressingPlan) => planCeiling(plan, upright(plan));

/**
 * The door of a corner, on its slanted or rounded front, or its two leaves on the square front of an L-shaped corner:
 * applied over it, with their hinges (bought parts, for the quote).
 */
function withCornerDoor(doc: CadDocument, plan: DressingPlan, zone: PlanZone): CadDocument {
  const side: Corner = zone.id === "left" ? "left" : "right";
  const shape = cornerOutline(plan, side);
  const wall = shape[0] as Point;
  const ell = PLAN_MODELS[plan.model].ell;
  // Each leaf from its outer end to the other: on an L, the one along wall A stops short of the other's thickness.
  const leaves: { a: Point; b: Point; end: number }[] = ell
    ? ellFaces(plan, side).map(([outer, inner], i) => ({ a: outer, b: inner, end: GAP + (i === 0 ? plan.thickness : 0) }))
    : [{ a: shape[2] as Point, b: shape[shape.length - 2] as Point, end: GAP }];
  const [z0, z1] = [plan.plinth + GAP, zoneHeight(plan, zone) - GAP];
  const ceiling = planCeiling(plan);
  const turned = ((plan.place?.quarter ?? 0) * Math.PI) / 2;
  let next = doc;
  const parts: { name: string; from: Vec3; to: Vec3; hardware: true; item: string }[] = [];
  leaves.forEach(({ a, b, end }, k) => {
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const length = Math.hypot(ex, ey);
    const out = (ey * (a[0] - wall[0]) - ex * (a[1] - wall[1]) > 0 ? 1 : -1) / length;
    const normal: [number, number] = [ey * out, -ex * out];
    const [ux, uy] = [ex / length, ey / length];
    // The middle of the leaf, between its gaps.
    const along = (GAP + length - end) / 2;
    const middle: Point = [a[0] + ux * along, a[1] + uy * along];
    const flat: PlaneFrame = { origin: [middle[0], middle[1], 0], xDir: [-normal[1], normal[0], 0], normal: [normal[0], normal[1], 0] };
    const frame = plan.place ? placeFrame(plan.place, flat) : flat;
    const half = (length - GAP - end) / 2;
    const name = leaves.length > 1 ? `${zone.label} — porte ${k + 1}` : `${zone.label} — porte`;
    if (PLAN_MODELS[plan.model].round) {
      const circle = circleDoor(plan, side, GAP);
      next = sheet(next, `${zone.label} — porte cintrée`, circle ? arcBand({ ...circle, center: onFloor(plan, circle.center), from: circle.from + turned, to: circle.to + turned }) : arcDoor(plan, side, GAP).map((p) => onFloor(plan, p)), { offset: z0 }, z1 - z0, ceiling);
    } else next = sheet(next, name, rect(-half, z0, half, z1), { offset: 0, frame }, plan.thickness, ceiling);
    const hinges = hingeCount(z1 - z0);
    const [hx, hy] = [a[0] + ux * 40 - normal[0] * 20, a[1] + uy * 40 - normal[1] * 20];
    for (let i = 0; i < hinges; i++) {
      const z = z0 + 100 + (i * (z1 - z0 - 200)) / Math.max(1, hinges - 1);
      const [from, to]: [Vec3, Vec3] = [[hx - 10, hy - 10, z - 10], [hx + 10, hy + 10, z + 10]];
      const box = plan.place ? placeBox(plan.place, from, to) : [from, to];
      parts.push({ name: `${name} — charnière ${i + 1}`, from: box[0] as Vec3, to: box[1] as Vec3, hardware: true, item: "Charnière à boîtier Ø35" });
    }
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
  const { depth: d, thickness: t, plinth } = plan;
  const height = zoneHeight(plan, zone);
  return sheet(doc, `${zone.label} — fileur`, [runPoint(zone, a, d - t), runPoint(zone, b, d - t), runPoint(zone, b, d), runPoint(zone, a, d)].map((p) => onFloor(plan, p)), { offset: plinth }, height - plinth, belowTop(plan));
}

/** The sliding doors of a run and their rails: bought rails for the quote, doors for the cut list. */
function withSlidingDoors(doc: CadDocument, plan: DressingPlan, zone: PlanZone, count: number): CadDocument {
  const band = (p: number, q: number, a: number, b: number, z0: number, z1: number): [Vec3, Vec3] => {
    const [[ax, ay], [bx, by]] = [onFloor(plan, runPoint(zone, p, a)), onFloor(plan, runPoint(zone, q, b))];
    return [[Math.min(ax, bx), Math.min(ay, by), z0], [Math.max(ax, bx), Math.max(ay, by), z1]];
  };
  const { start, length, depth } = zone.run;
  const parts = slidingDoors(band, zone.id, start, start + length, depth, zoneHeight(plan, zone), plan.plinth, plan.thickness, count);
  return { ...doc, features: [...doc.features, { id: uniqueId(doc, "fi"), type: "trim", name: uniqueName(doc, `${zone.label} — portes coulissantes`), parts }] };
}

/** What closes a zone around its Répartition, made again: a corner's far side and door when asked, a filler, a sloped top, sliding doors. */
export function withZoneBoards(base: CadDocument, planId: string, zone: PlanZone): CadDocument {
  const plan = planIn(base, planId) as DressingPlan;
  const { next: clean } = deleteFeatures(base, plan.boards?.[zone.id] ?? []);
  const { cornerB: b, depth: d, thickness: t, lengthA: l } = plan;
  const height = zoneHeight(plan, zone);
  let doc = clean;
  if (zone.kind === "corner") {
    doc = sheet(doc, `${zone.label} — côté`, (zone.id === "left" ? rect(0, -b, d, t - b) : rect(l - d, -b, l, t - b)).map((p) => onFloor(plan, p)), { offset: 0 }, height, belowTop(plan));
    if (plan.cornerDoor) doc = withCornerDoor(doc, plan, zone);
  }
  const fill = plan.fills?.[zone.id];
  if (fill?.filler) doc = withFiller(doc, plan, zone, fill.rest);
  const ceiling = planCeiling(plan);
  if (ceiling) doc = sheet(doc, `${zone.label} — dessus`, zone.outline.map((p) => onFloor(plan, p)), { offset: plan.plinth }, height, { ...ceiling, slab: upright(plan) });
  const sliding = plan.sliding?.[zone.id];
  if (sliding && zone.kind === "run" && !plan.roof) doc = withSlidingDoors(doc, plan, zone, sliding);
  const known = new Set(clean.features.map((f) => f.id));
  return withSettings(doc, planId, { boards: { ...plan.boards, [zone.id]: doc.features.filter((f) => !known.has(f.id)).map((f) => f.id) } });
}

export const placed = ({ run, clip }: PlanZone, plan: DressingPlan) => {
  const ceiling = belowTop(plan);
  const own = sketchFrame(run.plane, run.offset);
  const frame = plan.place ? placeFrame(plan.place, run.frame ?? { origin: own.origin, xDir: own.u, normal: own.normal }) : run.frame;
  return { plane: frame ? nearestPlane(frame.normal) : run.plane, offset: run.offset, ...(frame ? { frame } : {}), ...(clip ? { clip: clip.map((p) => onFloor(plan, p)) } : {}), ...(ceiling ? { ceiling } : {}) };
};

/** A zone has boards of its own to make again around its Répartition. */
const hasBoards = (plan: DressingPlan, zone: PlanZone, fills = plan.fills) => zone.kind === "corner" || fills?.[zone.id]?.filler === true || plan.roof !== undefined || (plan.sliding?.[zone.id] ?? 0) > 0;

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
    length, height: zoneHeight(plan, zone), thickness: plan.thickness, cases, dividers: Array.from({ length: cases - 1 }, () => (whole ? ("none" as const) : ("single" as const))),
    ...(fill && !whole ? { widths: fill.cases } : {}), boards: true, plinth: plan.plinth, outer: "board", single: "board", double: "side", ...(plan.roof ? { openTop: true } : {}),
  };
  const step = uniqueOffsetId(doc);
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord(step, `Répartition — ${zone.label.toLowerCase()}`, input, [start, 0], depth)] }, step);
  if (typeof rebuilt === "string") return rebuilt;
  const sketch = uniqueId(doc, "sk");
  const feature: SketchFeature = { id: sketch, type: "sketch", name: `Plan — ${zone.label.toLowerCase()}`, ...placed(zone, plan), ...emptySketchGeometry() };
  const made = withSketchExtrusion({ ...doc, features: [...doc.features, feature] }, sketch, rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
  const { [zone.id]: _old, ...fills } = plan.fills ?? {};
  const kept = fill && !whole && fill.rest !== null ? { fills: { ...fills, [zone.id]: { cases: fill.cases, rest: fill.rest, filler: fill.filler } } } : { fills };
  const next = withSettings(made, planId, { made: { ...plan.made, [zone.id]: sketch }, ...kept });
  return { doc: withTopOn(hasBoards(planIn(next, planId) as DressingPlan, zone) ? withZoneBoards(next, planId, zone) : next, planId, zone), sketch, step };
}

/** A door on the cut corners, or none: those already made follow. */
export function withCornerDoors(base: CadDocument, planId: string, on: boolean): CadDocument {
  let doc = withSettings(base, planId, { cornerDoor: on });
  const plan = planIn(doc, planId) as DressingPlan;
  for (const zone of planZones(plan)) if (zone.kind === "corner" && zoneDone(doc, plan, zone.id)) doc = withZoneBoards(doc, planId, zone);
  return doc;
}

/** Sliding doors in front of a zone, or none: at once if it is made, otherwise with its Répartition. */
export function withZoneSliding(base: CadDocument, planId: string, zone: PlanZone, count: number): CadDocument {
  const { [zone.id]: _old, ...others } = planIn(base, planId)?.sliding ?? {};
  const doc = withSettings(base, planId, { sliding: count ? { ...others, [zone.id]: count } : others });
  return zoneDone(doc, planIn(doc, planId) as DressingPlan, zone.id) ? withZoneBoards(doc, planId, zone) : doc;
}

/** The boxes of the walls behind this plan. */
function planWalls(p: DressingPlan): WallBox[] {
  const t = WALL_THICKNESS;
  const { fields } = PLAN_MODELS[p.model];
  const [b, c] = [p.model !== "T" && "lengthB" in fields, "lengthC" in fields];
  const boxes: WallBox[] = [{ name: "Mur A", from: [b ? -t : 0, 0, 0], to: [p.lengthA + (c ? t : 0), t, p.height] }];
  if (b) boxes.push({ name: "Mur B", from: [-t, -p.lengthB, 0], to: [0, 0, p.height] });
  if (c) boxes.push({ name: "Mur C", from: [p.lengthA, -p.lengthC, 0], to: [p.lengthA + t, 0, p.height] });
  if (p.model === "facing") boxes.push({ name: "Mur D", from: [0, -(2 * p.depth + p.aisle) - t, 0], to: [p.lengthD, -(2 * p.depth + p.aisle), p.height] });
  if (p.model === "G-left" || p.model === "G-right") {
    const back = -(p.model === "G-left" ? p.lengthB : p.lengthC);
    boxes.push({ name: "Mur D", from: [-t, back - t, 0], to: [p.lengthA + t, back, p.height] });
  }
  return boxes;
}

/** The walls behind the plan drawn again, or taken away. */
export function withPlanWalls(base: CadDocument, planId: string, on: boolean): CadDocument {
  const plan = planIn(base, planId) as DressingPlan;
  const { next: clean } = deleteFeatures(base, plan.boards?.walls ?? []);
  const known = new Set(clean.features.map((f) => f.id));
  const doc = on && plan.model !== "back" ? withWallBoxes(clean, planWalls(plan)) : clean;
  return withSettings(doc, planId, { walls: on, boards: { ...plan.boards, walls: doc.features.filter((f) => !known.has(f.id)).map((f) => f.id) } });
}

/** What was made on a zone that the new plan no longer has. */
export function withoutZone(doc: CadDocument, sketch: SketchFeature, boards: string[]): CadDocument {
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
  const sized = ({ openTop: _top, ...input }: PartitionParams): PartitionParams => ({ ...input, ...(cases ? { widths: cases } : {}), ...(plan.roof ? { openTop: true } : {}), length: zone.run.length, height: zoneHeight(plan, zone), thickness: plan.thickness, plinth: plan.plinth });
  const offsets = (sketch.offsets ?? []).map((r) => (isPartition(r) ? { ...r, step: { ...r.step, origin: [zone.run.start, 0] as [number, number], depth: zone.run.depth, input: sized(r.step.input) } } : r));
  const { frame: _frame, clip: _clip, ceiling: _ceiling, ...rest } = sketch;
  const moved: SketchFeature = { ...rest, ...placed(zone, plan), offsets };
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
  doc = updateFeature(doc, planId, (f) => (f.type === "sketch" ? { ...f, ...planSketch(next), dressingPlan: { ...next, made, boards, fills, ...(plan.top ? { top: plan.top } : {}), ...(plan.tops ? { tops: plan.tops } : {}) } } : f));
  if (next.walls || boards.walls?.length) doc = withPlanWalls(doc, planId, next.walls === true);
  // A plan no longer under a slope has top boards to take away, the zone made again without them.
  for (const zone of zones) if (made[zone.id] && (hasBoards(next, zone, fills) || boards[zone.id]?.length)) doc = withZoneBoards(doc, planId, zone);
  // The top units follow their zones (those of a zone gone go with it).
  for (const id of Object.keys(plan.tops ?? {})) if (!made[id]) doc = withTopOff(doc, planId, id);
  for (const zone of zones) if (made[zone.id]) doc = withTopOn(doc, planId, zone);
  return { doc, problems };
}
