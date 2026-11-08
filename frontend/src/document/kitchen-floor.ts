/**
 * Le plan d'une cuisine posé dans le projet : une esquisse au sol « Plan de la cuisine » qui garde ses réglages
 * (`kitchenPlan`) et ce que chaque linéaire reçoit. La cuisine en 3D en est tirée d'un coup (kitchen-plan-build.ts, bâtie
 * par kitchen-plan.ts) : caissons tournés selon leur mur, façades, plan de travail découpé, crédence, plinthes,
 * électroménager sur son calque, murs sur le calque « Pièce », matières posées. Elle est refaite entière quand le plan ou
 * un linéaire change, en une seule annulation, et chaque pièce faite garde son linéaire (`made`), pour le rouvrir. Pur.
 */
import { decorateKitchen, layoutPlan } from "./kitchen-plan";
import { kitchenFromPlan, type KitchenRoomInfo } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { FRONT, KITCHEN_PLAN, kitchenLines, kitchenRuns } from "./kitchen-plan-shapes";
import { deleteFeatures, findFeature, uniqueId, updateFeature } from "./operations";
import { linesGeometry } from "./plan-layout";
import type { Point } from "./plan-shapes";
import type { CadDocument, KitchenFloorPlan, SketchFeature } from "./types";
import { placePoint } from "../features/room-runs";

const FRONT_MATERIAL = "lacquer-white";
const WORKTOP_MATERIAL = "solid-oak";

/** The lines of the plan where it stands: in its room, or as they are. */
function planSketch(p: KitchenFloorPlan) {
  const floor = ([x, y]: Point): Point => {
    if (!p.place) return [x, y];
    const [wx, wy] = placePoint(p.place, [x, y, 0]);
    return [wx, wy];
  };
  return linesGeometry(kitchenLines(p).map(([a, b]): [Point, Point] => [floor(a), floor(b)]));
}

/** The plan on the floor: a sketch that keeps its settings. */
export function withKitchenPlan(doc: CadDocument, p: KitchenFloorPlan): { doc: CadDocument; id: string } {
  const id = uniqueId(doc, "sk");
  const sketch: SketchFeature = { id, type: "sketch", name: "Plan de la cuisine", plane: "XY", offset: 0, kitchenPlan: p, ...planSketch(p) };
  return { doc: { ...doc, features: [...doc.features, sketch] }, id };
}

export const kitchenPlanOf = (doc: CadDocument): SketchFeature | undefined => [...doc.features].reverse().find((f): f is SketchFeature => f.type === "sketch" && f.kitchenPlan !== undefined);

/** The settings of a plan of the document, a setting added since taking its usual value. */
export function kitchenPlanIn(doc: CadDocument, planId: string): KitchenFloorPlan | undefined {
  const sketch = findFeature(doc, planId);
  return sketch?.type === "sketch" && sketch.kitchenPlan ? { ...KITCHEN_PLAN, ...sketch.kitchenPlan } : undefined;
}

/** Something stands on a run of the plan. */
export const kitchenStarted = (p: KitchenFloorPlan): boolean => Object.values(p.runs ?? {}).some((items) => items.length > 0);

/** The kitchen of the plan made again from it (its settings changed by `patch`), in place of what it made before. */
export function withKitchenBuilt(base: CadDocument, planId: string, patch: Partial<KitchenFloorPlan> = {}): { doc: CadDocument; problems: string[] } | string {
  const old = kitchenPlanIn(base, planId);
  if (!old) return "Ce plan n'existe plus.";
  const plan: KitchenFloorPlan = { ...old, ...patch };
  const { next } = deleteFeatures(base, Object.values(old.made ?? {}).flat());
  let doc = next;
  const room: KitchenRoomInfo | undefined = kitchenRoomInfo(doc, plan);
  const layout = kitchenFromPlan(plan, room);
  const made: Record<string, string[]> = {};
  const problems: string[] = [];
  for (const run of kitchenRuns(plan)) {
    // A run with nothing on it: only its wall, if it has one to draw.
    const empty = !(plan.runs?.[run.id] ?? []).length;
    const sub = { ...layout, units: empty ? [] : layout.units.filter((u) => u.run === run.id), boxes: layout.boxes.filter((b) => b.run === run.id && (!empty || b.kind === "wall")) };
    if (!sub.units.length && !sub.boxes.length) continue;
    const built = layoutPlan(doc, sub, FRONT, plan.frontMaterial ?? FRONT_MATERIAL, plan.worktopMaterial ?? WORKTOP_MATERIAL, plan.place);
    doc = decorateKitchen({ ...doc, features: [...doc.features, ...built.features] }, built);
    made[run.id] = built.features.map((f) => f.id);
    problems.push(...(empty ? [] : layout.fills[run.id]?.problems ?? []).map((m) => `${run.label} : ${m}`), ...built.problems);
  }
  doc = updateFeature(doc, planId, (f) => (f.type === "sketch" ? { ...f, ...planSketch(plan), kitchenPlan: { ...plan, made } } : f));
  return { doc, problems: [...problems, ...layout.notes] };
}

/** The runs with units that this plan would no longer have. */
export function runsLost(doc: CadDocument, planId: string, next: KitchenFloorPlan): string[] {
  const plan = kitchenPlanIn(doc, planId);
  if (!plan) return [];
  const kept = new Set(kitchenRuns(next).map((r) => r.id));
  return kitchenRuns(plan).filter((r) => !kept.has(r.id) && (plan.runs?.[r.id]?.length ?? 0) > 0).map((r) => r.label);
}

/** The plan changed: its lines, and the kitchen made again on its runs, those it no longer has left out. */
export function withKitchenChanged(doc: CadDocument, planId: string, next: KitchenFloorPlan): { doc: CadDocument; problems: string[] } | string {
  const plan = kitchenPlanIn(doc, planId);
  if (!plan) return "Ce plan n'existe plus.";
  const ids = new Set(kitchenRuns(next).map((r) => r.id));
  const keep = <T>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => ids.has(id)));
  const patch: KitchenFloorPlan = { ...next, runs: keep(plan.runs), rest: keep(plan.rest), made: plan.made ?? {} };
  if (kitchenStarted(plan) || Object.keys(plan.made ?? {}).length) return withKitchenBuilt(doc, planId, patch);
  return { doc: updateFeature(doc, planId, (f) => (f.type === "sketch" ? { ...f, ...planSketch(patch), kitchenPlan: patch } : f)), problems: [] };
}

/** The plan and the run a feature was made for, or null. */
export function kitchenRunOf(doc: CadDocument, featureId: string): { plan: string; run: string } | null {
  for (const f of doc.features) {
    if (f.type !== "sketch" || !f.kitchenPlan?.made) continue;
    for (const [run, ids] of Object.entries(f.kitchenPlan.made)) if (ids.includes(featureId)) return { plan: f.id, run };
  }
  return null;
}
