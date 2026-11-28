/**
 * Un caisson de cuisine aménagé à la main (document/cabinet-furnish.ts) suit sa place dans le linéaire : la cuisine
 * refaite (un voisin élargi, un meuble ajouté avant lui, le mur allongé, le plan tourné), il va où va l'« Espace libre »
 * qui lui est gardé, tourné comme lui ; cette place élargie ou rétrécie, sa Répartition prend sa nouvelle largeur sur
 * place, son intérieur adapté et chaque pièce gardant sa matière, comme une zone de dressing. Ses finitions le suivent
 * (caisson-trims.ts). Un caisson aménagé avant que sa place le retienne y est relié, s'il se trouve juste à cette place. Pur.
 */
import { caissonPose, withTrimsFollowing } from "./caisson-trims";
import { cabinetAxes } from "./kitchen-catalog";
import { findFeature, updateFeature } from "./operations";
import type { OffsetRecord } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import { PART_SEPARATOR, type CadDocument, type KitchenFloorPlan, type KitchenRunItem, type PlaneFrame, type SketchFeature, type Vec3 } from "./types";
import type { KitchenUnit } from "../features/kitchen-layout";
import { heldTall } from "../features/kitchen-run-items";
import { nichePartsIn } from "../features/niche-parts";
import { placePoint } from "../features/room-runs";
import { nearestPlane } from "../sketcher/frame";
import { extrusionGroups, isPartition, rebuildChain } from "../sketcher/partition-history";

/**
 * The frame of a caisson's panels in a cabinet's place: `set` behind its front (mm), at its bottom; x along its width,
 * y up, the front towards the normal.
 */
export function panelsFrame(c: { origin: Vec3; rotation?: number }, set: number): PlaneFrame {
  const { along, back: inwards } = cabinetAxes(c.rotation ?? 0);
  const origin: Vec3 = [c.origin[0] + inwards[0] * set, c.origin[1] + inwards[1] * set, c.origin[2]];
  return { origin, xDir: [along[0], along[1], 0], normal: [-inwards[0], -inwards[1], 0] };
}

const near = (a: Vec3, b: Vec3, tolerance = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < tolerance);
const sameFrame = (a: PlaneFrame, b: PlaneFrame) => near(a.origin, b.origin) && near(a.xDir, b.xDir) && near(a.normal, b.normal);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type Partition = OffsetRecord & { step: Extract<NonNullable<OffsetRecord["step"]>, { kind: "partition" }> };
/** The Répartition a caisson's sketch is made of: the first one extruded. */
export const partitionOf = (sketch: SketchFeature): Partition | undefined => (sketch.offsets ?? []).find((r): r is Partition => isPartition(r) && r.step.kind === "partition" && !!r.step.depth);

/** Whether this feature is a caisson a kept room may hold: a sketch with a Répartition extruded, its panels still there. */
export function isCaisson(doc: CadDocument, id: string): boolean {
  const f = findFeature(doc, id);
  return f?.type === "sketch" && !!partitionOf(f) && doc.features.some((x) => x.type === "extrude" && x.sketch === id);
}

/** What stands on a run: what the plan made for it, and the caissons furnished in its kept rooms (their panels, doors, drawers). */
export function runFeatures(doc: CadDocument, plan: KitchenFloorPlan, run: string): Set<string> {
  const held = new Set((plan.runs?.[run] ?? []).map((i) => i.furnished).filter(Boolean));
  return new Set([...(plan.made?.[run] ?? []), ...doc.features.filter((f) => (f.type === "extrude" || f.type === "niche") && held.has(f.sketch)).map((f) => f.id)]);
}

/** A room of the plan where the plan stands in the room, as its cabinets are (kitchen-plan.ts). */
const placed = (plan: KitchenFloorPlan, u: KitchenUnit) => (plan.place ? { origin: placePoint(plan.place, u.origin), rotation: (u.rotation + plan.place.quarter * 90) % 360 } : u);

/**
 * The caissons furnished in rooms kept free that were pushed along their run in the 3D since `prev` (item id → mm
 * towards the run's end, from where the plan puts them): their rooms are to go there (kitchen-slide.ts). Turned, or
 * moved off their wall: not.
 */
export function caissonsMoved(prev: CadDocument, doc: CadDocument, plan: KitchenFloorPlan, kept: readonly KitchenUnit[]): Record<string, number> {
  const moved: Record<string, number> = {};
  for (const u of kept) {
    const item = u.run ? plan.runs?.[u.run]?.find((i) => i.id === u.item) : undefined;
    const [was, now] = [item?.furnished ? findFeature(prev, item.furnished) : undefined, item?.furnished ? findFeature(doc, item.furnished) : undefined];
    const record = now?.type === "sketch" ? partitionOf(now) : undefined;
    if (was?.type !== "sketch" || now?.type !== "sketch" || !was.frame || !now.frame || !record || sameFrame(was.frame, now.frame)) continue;
    const there = panelsFrame(placed(plan, u), record.step.depth!);
    if (sameFrame(there, now.frame) || !near(there.normal, now.frame.normal, 1e-3)) continue;
    const delta = [0, 1, 2].map((k) => now.frame!.origin[k]! - there.origin[k]!) as Vec3;
    const d = dot(delta, there.xDir);
    if (Math.abs(d) >= 1 && [0, 1, 2].every((k) => Math.abs(delta[k]! - d * there.xDir[k]!) < 1)) moved[u.item!] = Math.round(d * 10) / 10;
  }
  return moved;
}

/** The caisson's Répartition at a new width, on its new frame: its boards made again, each keeping its material. */
function withCaissonResized(doc: CadDocument, sketch: SketchFeature, frame: PlaneFrame, width: number, height?: number): { doc: CadDocument; problems: string[] } | string {
  const make = (widths: boolean) => {
    const offsets = (sketch.offsets ?? []).map((r) => {
      if (r !== partitionOf(sketch) || r.step?.kind !== "partition") return r;
      const { widths: shares, ...input } = r.step.input;
      return { ...r, step: { ...r.step, input: { ...input, length: width, ...(height ? { height } : {}), ...(widths && shares ? { widths: shares } : {}) } } } as OffsetRecord;
    });
    const moved: SketchFeature = { ...sketch, frame, plane: nearestPlane(frame.normal), offsets };
    return { moved, offsets, rebuilt: rebuildChain(moved, partitionOf(sketch)!.id) };
  };
  // Cases of a set width that no longer fit: shared again.
  let tried = make(true);
  if (typeof tried.rebuilt === "string" || tried.rebuilt.problems.length) tried = make(false);
  const { moved, offsets, rebuilt } = tried;
  if (typeof rebuilt === "string") return rebuilt;
  const next = updateFeature(doc, sketch.id, () => moved);
  return { doc: withSketchExtrusion(next, sketch.id, rebuilt.geometry, { groups: extrusionGroups(offsets, rebuilt) }), problems: rebuilt.problems };
}

/** The caisson on `sketchId` made again where it stands, at its Répartition's sizes (its height, its depth changed). */
export function withCaissonRemade(doc: CadDocument, sketchId: string): { doc: CadDocument; problems: string[] } | string {
  const sketch = findFeature(doc, sketchId);
  const record = sketch?.type === "sketch" ? partitionOf(sketch) : undefined;
  if (sketch?.type !== "sketch" || !sketch.frame || !record) return "Ce caisson n'existe plus.";
  return withCaissonResized(doc, sketch, sketch.frame, record.step.input.length);
}

/**
 * The caissons furnished in the plan's runs set in their room as the plan now has it (`kept`: kitchen-plan-build.ts):
 * moved and turned with it, made to its width when it changed, their finishings with them. What could not follow.
 */
export function withCaissonsFollowing(base: CadDocument, plan: KitchenFloorPlan, kept: readonly KitchenUnit[]): { doc: CadDocument; problems: string[] } {
  let doc = base;
  const problems: string[] = [];
  for (const u of kept) {
    const item = u.run ? plan.runs?.[u.run]?.find((i) => i.id === u.item) : undefined;
    const sketch = item?.furnished ? findFeature(doc, item.furnished) : undefined;
    const record = sketch?.type === "sketch" ? partitionOf(sketch) : undefined;
    if (sketch?.type !== "sketch" || !sketch.frame || record?.step.kind !== "partition") continue;
    const frame = panelsFrame(placed(plan, u), record.step.depth!);
    const width = record.step.input.length;
    // A column's or a fridge surround's caisson as high as its room too (they rise with a casquette of caissons: itemSize).
    const height = item && heldTall(item) && Math.abs(record.step.input.height - u.height) >= 0.05 ? u.height : undefined;
    const resized = Math.abs(width - u.width) >= 0.05 || height !== undefined;
    // Made of a unit of the plan when its sides stopped over the plinth: down to the floor now, as its unit's (notched for the plinth: kick-notches.ts).
    const dated = !!item?.from && record.step.input.outer === "board" && record.step.input.plinth > 0;
    if (!resized && !dated && sameFrame(frame, sketch.frame)) continue;
    const before = caissonPose(doc, sketch, width);
    let next: CadDocument;
    if (resized || dated) {
      const source: SketchFeature = dated ? { ...sketch, offsets: sketch.offsets!.map((r) => (r === record ? ({ ...r, step: { ...record.step, input: { ...record.step.input, outer: "side" } } } as OffsetRecord) : r)) } : sketch;
      const made = withCaissonResized(doc, source, frame, u.width, height);
      if (typeof made === "string") {
        problems.push(`${sketch.name} : ${made}`);
        continue;
      }
      problems.push(...made.problems.map((m) => `${sketch.name} : ${m}`));
      next = made.doc;
    } else next = updateFeature(doc, sketch.id, (f) => (f.type === "sketch" ? { ...f, frame, plane: nearestPlane(frame.normal) } : f));
    doc = withTrimsFollowing(doc, next, before, caissonPose(next, findFeature(next, sketch.id) as SketchFeature, u.width));
  }
  return { doc, problems };
}

/**
 * The rooms of the plan kept free with no caisson linked, linked to the caisson furnished there before rooms kept theirs:
 * the one standing just where its room was (`kept`: the rooms of `old`, the plan as it was), of its width. Its depth and,
 * up in the wall row, its height then are the caisson's. `next`, its rooms linked.
 */
export function withRoomsLinked(doc: CadDocument, old: KitchenFloorPlan, kept: readonly KitchenUnit[], next: KitchenFloorPlan): KitchenFloorPlan {
  const items = Object.values(old.runs ?? {}).flat();
  const linked = new Set(items.map((i) => i.furnished).filter(Boolean));
  const free = kept.filter((u) => !items.find((i) => i.id === u.item)?.furnished);
  if (!free.length) return next;
  const caissons = doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !!f.frame && !linked.has(f.id) && !!partitionOf(f));
  const found = new Map<string, Partial<KitchenRunItem>>();
  for (const u of free) {
    const wall = u.origin[2] > 0;
    const at = panelsFrame(placed(old, u), 0);
    const k = caissons.findIndex((s) => {
      const step = partitionOf(s)!.step;
      if (step.kind !== "partition" || Math.abs(step.input.length - u.width) >= 0.5 || !near(s.frame!.xDir, at.xDir) || !near(s.frame!.normal, at.normal)) return false;
      const d = s.frame!.origin.map((v, i) => v - at.origin[i]!) as Vec3;
      // Just there: at its left, its bottom, its front a little in or out of the room's.
      return Math.abs(dot(d, at.xDir)) < 1 && (wall || Math.abs(d[2]) < 1) && Math.abs(dot(d, at.normal) + step.depth!) < 400;
    });
    if (k < 0) continue;
    const s = caissons.splice(k, 1)[0]!;
    const step = partitionOf(s)!.step;
    if (step.kind !== "partition") continue;
    // Its front where the room's is: the room as deep as from the wall to it.
    const d = s.frame!.origin.map((v, i) => v - at.origin[i]!) as Vec3;
    found.set(u.item!, { furnished: s.id, depth: u.depth + dot(d, at.normal) + step.depth!, ...(wall ? { height: u.height - d[2] } : {}) });
  }
  if (!found.size) return next;
  const runs = Object.fromEntries(Object.entries(next.runs ?? {}).map(([run, list]) => [run, list.map((i) => (found.has(i.id) && !i.furnished ? { ...i, ...found.get(i.id) } : i))]));
  return { ...next, runs };
}

/**
 * « Matière des façades » of the plan changed from `from` to `to`: the fronts of the caissons furnished in its rooms
 * (their doors, their drawers' fronts) take it — those in `from`, in the plan's first one (white lacquer) or in none;
 * a material chosen by hand on a front stays.
 */
export function withCaissonsFacing(doc: CadDocument, plan: KitchenFloorPlan, from: string, to: string, first = "lacquer-white"): CadDocument {
  const held = new Set(Object.values(plan.runs ?? {}).flat().map((i) => i.furnished).filter(Boolean));
  if (from === to || !held.size) return doc;
  const info = { ...doc.bodyInfo };
  let changed = false;
  for (const f of doc.features) {
    if (f.type !== "niche" || !f.sketch || !held.has(f.sketch) || !(f.fill === "doors" || f.fill === "door" || (f.fill === "drawers" && !f.inner))) continue;
    nichePartsIn(doc.features, f).forEach((p, i) => {
      const key = `${f.id}${PART_SEPARATOR}${i}`;
      const now = info[key]?.material ?? info[f.id]?.material;
      if (p.role !== "front" || (now && now !== from && now !== first)) return;
      info[key] = { ...info[key], material: to };
      changed = true;
    });
  }
  return changed ? { ...doc, bodyInfo: info } : doc;
}
