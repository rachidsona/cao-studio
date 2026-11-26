/**
 * Le plan d'une cuisine posé dans le projet : une esquisse au sol « Plan de la cuisine » qui garde ses réglages
 * (`kitchenPlan`) et ce que chaque linéaire reçoit. La cuisine en 3D en est tirée d'un coup (kitchen-plan-build.ts, bâtie
 * par kitchen-plan.ts) : caissons tournés selon leur mur, façades, plan de travail découpé, crédence, plinthes,
 * électroménager sur son calque, murs sur le calque « Pièce », matières posées. Elle est refaite entière quand le plan ou
 * un linéaire change, en une seule annulation, et chaque pièce faite garde son linéaire (`made`), pour le rouvrir ; un
 * caisson aménagé à la main suit sa place (caisson-follow.ts). Pur.
 */
import { isCaisson, withCaissonsFollowing, withRoomsLinked } from "./caisson-follow";
import { decorateKitchen, layoutPlan } from "./kitchen-plan";
import { kitchenFromPlan, type KitchenRoomInfo } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { FRONT, KITCHEN_PLAN, kitchenLines, kitchenRuns } from "./kitchen-plan-shapes";
import { ROOM_MADE, roomShell } from "./kitchen-plan-shell";
import { deleteFeatures, findFeature, latestBody, uniqueId, updateFeature } from "./operations";
import { linesGeometry } from "./plan-layout";
import type { Point } from "./plan-shapes";
import { PART_SEPARATOR, featureInputs, featureOfBody, type CadDocument, type Feature, type KitchenFloorPlan, type KitchenRunItem, type SketchFeature } from "./types";
import { isFiller, isSpace, itemEntry, rowOf } from "../features/kitchen-run-items";
import { placePoint } from "../features/room-runs";

export const FRONT_MATERIAL = "lacquer-white";
export const WORKTOP_MATERIAL = "solid-oak";

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
  if (sketch?.type !== "sketch" || !sketch.kitchenPlan) return undefined;
  const plan = { ...KITCHEN_PLAN, ...sketch.kitchenPlan };
  // A room kept for a caisson that is no longer there (deleted, its id another's since) is free again.
  const gone = (i: KitchenRunItem) => i.furnished !== undefined && !isCaisson(doc, i.furnished);
  if (!Object.values(plan.runs ?? {}).some((items) => items.some(gone))) return plan;
  return { ...plan, runs: Object.fromEntries(Object.entries(plan.runs ?? {}).map(([run, items]) => [run, items.map((i) => (gone(i) ? (({ furnished: _gone, ...free }) => free)(i) : i))])) };
}

/** Something stands on a run of the plan. */
export const kitchenStarted = (p: KitchenFloorPlan): boolean => Object.values(p.runs ?? {}).some((items) => items.length > 0);

/**
 * The work done by hand on what the plan made, in its order: a cut under a hob or a sink placed from Électroménager,
 * a face pulled from a filler… — what takes one of its pieces as its target, and nothing else of it.
 */
function handWork(doc: CadDocument, made: Set<string>): Feature[] {
  const on = new Set(made);
  const work: Feature[] = [];
  for (const f of doc.features) {
    const target = "target" in f && typeof f.target === "string" ? f.target : undefined;
    if (made.has(f.id) || !target || !on.has(target) || featureInputs(f).some((id) => id !== target && on.has(id))) continue;
    work.push(f);
    on.add(f.id);
  }
  return work;
}

/** The work by hand put back on what the plan made again: on its piece of the same name, after what that piece now has. */
function withWorkBack(doc: CadDocument, before: CadDocument, work: Feature[], made: string[]): CadDocument {
  const again = new Map<string, string>();
  let next = doc;
  for (const f of work) {
    const old = (f as { target: string }).target;
    const name = findFeature(before, old)?.name;
    const target = again.get(old) ?? made.find((id) => findFeature(next, id)?.name === name);
    if (!target) continue;
    const id = findFeature(next, f.id) ? uniqueId(next, f.id.replace(/\d+$/, "")) : f.id;
    again.set(f.id, id);
    next = { ...next, features: [...next.features, { ...f, id, target: latestBody(next, target) } as Feature] };
    // Its name and its look, as they were.
    const own = (key: string) => featureOfBody(key) === f.id;
    const moved = <T>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => own(key)).map(([key, v]) => [id + key.slice(f.id.length), v]));
    next = { ...next, bodyInfo: { ...next.bodyInfo, ...moved(before.bodyInfo) }, bodyNames: { ...next.bodyNames, ...moved(before.bodyNames) } };
  }
  return next;
}

/** The kitchen of the plan made again from it (its settings changed by `patch`), in place of what it made before. */
/** The caissons of a run's base row: a unit, an appliance, a furnished caisson (not a filler nor room kept free). */
const posed = (items: readonly KitchenRunItem[] = []) => new Set(items.filter((i) => (!isFiller(i) || (isSpace(i) && i.furnished)) && rowOf(itemEntry(i)) === "base").map((i) => `${i.id}:${i.furnished ?? ""}`));

/**
 * The worktop and the plinth follow the caissons: a caisson put on a run whose worktop or plinth was taken away brings
 * them back (unless this same change takes them away).
 */
function withFollowing(old: KitchenFloorPlan, patch: Partial<KitchenFloorPlan>, plan: KitchenFloorPlan): KitchenFloorPlan {
  const back = Object.keys(plan.runs ?? {}).filter((run) => {
    const was = posed(old.runs?.[run]);
    return [...posed(plan.runs?.[run])].some((k) => !was.has(k));
  });
  if (!back.length) return plan;
  const kept = (key: "noWorktop" | "noKick") => {
    const set = { ...plan[key] };
    for (const run of back) if (patch[key]?.[run] !== true) delete set[run];
    return set;
  };
  return { ...plan, noWorktop: kept("noWorktop"), noKick: kept("noKick") };
}

export function withKitchenBuilt(base: CadDocument, planId: string, patch: Partial<KitchenFloorPlan> = {}): { doc: CadDocument; problems: string[] } | string {
  const old = kitchenPlanIn(base, planId);
  if (!old) return "Ce plan n'existe plus.";
  // Its rooms kept for caissons furnished before they kept them, linked to them where they stand.
  const unlinked = Object.values(old.runs ?? {}).some((items) => items.some((i) => isSpace(i) && !i.furnished));
  const plan: KitchenFloorPlan = withFollowing(old, patch, unlinked ? withRoomsLinked(base, old, kitchenFromPlan(old, kitchenRoomInfo(base, old)).kept, { ...old, ...patch }) : { ...old, ...patch });
  const madeBefore = Object.values(old.made ?? {}).flat();
  // What each piece made before is, to find it again once made anew (its ids are given out again).
  const before = madeKeys(base, old);
  const work = handWork(base, new Set(madeBefore));
  // The cut-outs of each worktop, to keep those put or changed by hand in it.
  const cuts = new Map(madeBefore.flatMap((id) => {
    const f = findFeature(base, id);
    const worktop = f?.type === "machining" && f.kind === "cutout" && f.cutouts ? findFeature(base, f.target)?.name : undefined;
    return f?.type === "machining" && worktop ? [[worktop, f.cutouts ?? []] as const] : [];
  }));
  const { next } = deleteFeatures(base, madeBefore);
  let doc = next;
  const room: KitchenRoomInfo | undefined = kitchenRoomInfo(doc, plan);
  const layout = kitchenFromPlan(plan, room);
  const made: Record<string, string[]> = {};
  const problems: string[] = [];
  for (const run of kitchenRuns(plan)) {
    // A run with nothing on it (no unit: places kept free are nothing): only its wall, if it has one to draw, and the corner units chosen — a corner unit
    // with its worktop and splashback over it, as any caisson.
    const empty = !(plan.runs?.[run.id] ?? []).some((i) => !isSpace(i) || i.furnished);
    const cornered = layout.units.some((u) => u.run === run.id && u.corner);
    const sub = { ...layout, units: layout.units.filter((u) => u.run === run.id && (!empty || u.corner)), boxes: layout.boxes.filter((b) => b.run === run.id && (!empty || b.kind === "wall" || b.corner || (cornered && (b.kind === "worktop" || b.kind === "splashback")))) };
    if (!sub.units.length && !sub.boxes.length) continue;
    const built = layoutPlan(doc, sub, FRONT, plan.frontMaterial ?? FRONT_MATERIAL, plan.worktopMaterial ?? WORKTOP_MATERIAL, plan.place, cuts, plan.worktopLook, plan.kickLook, plan.frontLook);
    doc = decorateKitchen({ ...doc, features: [...doc.features, ...built.features] }, built);
    made[run.id] = built.features.map((f) => f.id);
    problems.push(...(empty ? [] : layout.fills[run.id]?.problems ?? []).map((m) => `${run.label} : ${m}`), ...built.problems);
  }
  // No surveyed room: the plan's own, closed round its walls (the walls missing, a floor, a ceiling).
  if (!room && !plan.noWalls && !plan.noRoom) {
    const built = layoutPlan(doc, { ...layout, units: [], boxes: roomShell(plan) }, FRONT, FRONT_MATERIAL, WORKTOP_MATERIAL, plan.place);
    doc = decorateKitchen({ ...doc, features: [...doc.features, ...built.features] }, built);
    made[ROOM_MADE] = built.features.map((f) => f.id);
  }
  doc = withWorkBack(doc, base, work, Object.values(made).flat());
  // The caissons furnished by hand go where their room now is.
  const followed = withCaissonsFollowing(doc, plan, layout.kept);
  doc = followed.doc;
  // Each run as it is placed: a unit put in a room kept free stands there in its order too.
  const runs = plan.runs && Object.fromEntries(Object.entries(plan.runs).map(([run, items]) => [run, layout.fills[run]?.items ?? items]));
  doc = updateFeature(doc, planId, (f) => (f.type === "sketch" ? { ...f, ...planSketch(plan), kitchenPlan: { ...plan, ...(runs ? { runs } : {}), made } } : f));
  const after = madeKeys(doc, kitchenPlanIn(doc, planId) ?? plan);
  doc = withLinksFollowing(doc, before, after);
  doc = withLooksFollowing(doc, base, before, after, [old.worktopLook, old.kickLook]);
  return { doc, problems: [...problems, ...followed.problems, ...layout.notes] };
}

/**
 * What each piece the plan made is, whatever its id: a unit by its item of the run (its name for a corner unit), its
 * fronts by their unit, a board by its name in its run.
 */
function madeKeys(doc: CadDocument, plan: KitchenFloorPlan): Map<string, string> {
  const keys = new Map<string, string>();
  const units = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).units;
  for (const [run, ids] of Object.entries(plan.made ?? {})) {
    const cabinets = ids.filter((id) => findFeature(doc, id)?.type === "cabinet");
    const own = units.filter((u) => u.run === run);
    if (cabinets.length === own.length) cabinets.forEach((id, i) => keys.set(id, `${run}:${own[i]!.item ?? own[i]!.name}`));
    for (const id of ids) {
      const f = findFeature(doc, id);
      if (!f || keys.has(id)) continue;
      keys.set(id, f.type === "fronts" ? `fronts:${keys.get(f.cabinet) ?? f.cabinet}` : `${run}:${f.name}`);
    }
  }
  return keys;
}

/**
 * The links of « Prolonger élément » (document/extend-reach.ts) kept on the pieces the plan made again: each on the same
 * unit or board (its new id), not on another that took its old id — gone with it when it is no more.
 */
function withLinksFollowing(doc: CadDocument, before: Map<string, string>, after: Map<string, string>): CadDocument {
  if (!doc.extendLinks?.length || !before.size) return doc;
  const anew = new Map([...after].map(([id, key]) => [key, id]));
  const moved = (body: string): string | null => {
    const [owner, part] = body.split(PART_SEPARATOR);
    if (!before.has(owner!)) return body;
    const id = anew.get(before.get(owner!)!);
    return id ? `${id}${PART_SEPARATOR}${part}` : null;
  };
  const extendLinks = doc.extendLinks.flatMap((l) => {
    const [from, to] = [moved(l.from.body), moved(l.to.body)];
    return from && to ? [{ ...l, from: { ...l.from, body: from }, to: { ...l.to, body: to } }] : [];
  });
  const { extendLinks: _, ...rest } = doc;
  return extendLinks.length ? { ...rest, extendLinks } : rest;
}

/**
 * The looks given by hand to the pieces the plan made — an appearance, a colour, painted faces — kept on the same pieces
 * made again (their bodies by their number). Those the plan gives itself (its worktop's and plinths' looks) are its own.
 */
function withLooksFollowing(doc: CadDocument, base: CadDocument, before: Map<string, string>, after: Map<string, string>, planLooks: (string | undefined)[]): CadDocument {
  const anew = new Map([...after].map(([id, key]) => [key, id]));
  const info = { ...doc.bodyInfo };
  let changed = false;
  for (const [body, was] of Object.entries(base.bodyInfo ?? {})) {
    const [owner, part] = body.split(PART_SEPARATOR);
    const id = anew.get(before.get(owner!) ?? "");
    const own = was.appearance && !planLooks.includes(was.appearance);
    if (!id || !(own || was.color || was.faces?.length)) continue;
    const target = part === undefined ? id : `${id}${PART_SEPARATOR}${part}`;
    info[target] = { ...info[target], ...(own ? { appearance: was.appearance } : {}), ...(was.color ? { color: was.color } : {}), ...(was.faces?.length ? { faces: was.faces } : {}) };
    changed = true;
  }
  return changed ? { ...doc, bodyInfo: info } : doc;
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
    // Not the pieces of its room (its walls added, floor, ceiling): they are of no run.
    for (const [run, ids] of Object.entries(f.kitchenPlan.made)) if (run !== ROOM_MADE && ids.includes(featureId)) return { plan: f.id, run };
  }
  return null;
}
