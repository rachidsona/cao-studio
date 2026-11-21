/**
 * Les surmeubles d'un Plan de dressing (`top`, `tops` du plan) : au-dessus de chaque zone faite, une Répartition de leur
 * hauteur aux mêmes cases que celle du dessous, posée sur elle — faite une fois, puis gardée : le plan changé, elle est
 * seulement déplacée et mise à ses cotes, ce qu'on y a fait reste. Un angle : découpée à son contour, avec son dernier
 * côté, ouverte. Leurs portes sont des « Porte sur niches », une par case, battantes ou relevables. Pur.
 */
import { DOOR_DEFAULTS } from "./joinery-defaults";
import { withEquipment } from "./equipment";
import { DRAWERS, ROD } from "./dressing-modules";
import { syncPartitionDoors } from "./partition-doors";
import { deleteFeatures, findFeature, uniqueId, uniqueName, uniqueOffsetId, updateFeature } from "./operations";
import { onFloor, placed, planIn, sheet, withoutZone, withSettings, withZoneBoards, zoneDone, zoneSketch } from "./plan-layout";
import { planZones, rect, zoneHeight, type PlanZone } from "./plan-shapes";
import type { DoorSettings, PartitionParams, SketchGeometry } from "./sketch";
import { emptySketchGeometry } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, DressingPlan, NicheFeature, SketchFeature } from "./types";
import { extrusionGroups, isPartition, partitionRecord, rebuildChain } from "../sketcher/partition-history";

/**
 * Its top units' Répartition, at its zone's top, its sizes; `input`, `doors`: those it has kept (its edits) — its own
 * doors (a Répartition's) only kept as they are, unless `asked` (the settings applied again: doors over niches then).
 */
function topRecord(id: string, plan: DressingPlan, zone: PlanZone, top: NonNullable<DressingPlan["top"]>, input: PartitionParams, doors?: DoorSettings, asked = true) {
  const record = partitionRecord(id, `Surmeubles — ${zone.label.toLowerCase()}`, { ...input, length: zone.run.length, height: top.height, thickness: plan.thickness, plinth: 0 }, [zone.run.start, zoneHeight(plan, zone)], zone.run.depth);
  if (record.step?.kind === "partition" && doors && !asked) record.step.doors = doors;
  return record;
}

/**
 * The doors of top units, as « Porte sur niches » (each set as any other, lift-up ones too): one per case, side-hung
 * left and right in turn or hinged at their top (`lift`); a corner's top stays open. Those it had go first.
 */
function withTopDoors(doc: CadDocument, sketch: string, step: string, zone: PlanZone, top: NonNullable<DressingPlan["top"]>, input: PartitionParams): CadDocument {
  let next = deleteFeatures(doc, doc.features.filter((f) => f.type === "niche" && f.sketch === sketch && f.fill === "door").map((f) => f.id)).next;
  if (!top.doors || zone.kind !== "run") return next;
  const starts = Array.from({ length: input.cases }, (_, k) => k).filter((k) => k === 0 || input.dividers[k - 1] !== "none");
  const doors: NicheFeature[] = [];
  for (const [n, k] of starts.entries()) {
    const f: NicheFeature = {
      id: uniqueId(next, "pn"), type: "niche", name: uniqueName(next, "Porte"), sketch, partition: step, niche: [k], fill: "door", ...ROD, ...DRAWERS, ...DOOR_DEFAULTS,
      mount: "overlay", hinges: [top.doors === "lift" ? "top" : n % 2 ? "right" : "left"],
    };
    doors.push(f);
    next = { ...next, features: [...next.features, f] };
  }
  return withEquipment(deleteFeatures(next, doors.map((d) => d.id)).next, doors);
}

/**
 * The top units of a zone: made once, a Répartition of their own on its top with the cases of the one below (their
 * widths, their sides); then kept and only moved and sized with the plan — what is done in them stays.
 */
export function withTopOn(base: CadDocument, planId: string, zone: PlanZone, asked = false): CadDocument {
  const plan = planIn(base, planId) as DressingPlan;
  const top = plan.top;
  if (!top || plan.roof || !zoneDone(base, plan, zone.id)) return base;
  const kept = plan.tops?.[zone.id] ? findFeature(base, plan.tops[zone.id]!) : undefined;
  let doc = base;
  let sketch: string;
  let at: { step: string; input: PartitionParams };
  if (kept?.type === "sketch") {
    const was = (kept.offsets ?? []).find(isPartition);
    if (!was || !isPartition(was)) return base;
    const { openTop: _o, ...input } = was.step.input;
    const offsets = (kept.offsets ?? []).map((r) => (r.id === was.id ? { ...topRecord(r.id, plan, zone, top, input, was.step.doors, asked), bodies: r.bodies, curves: r.curves } : r)) as typeof kept.offsets;
    const { frame: _f, clip: _c, ceiling: _ce, ...rest } = kept;
    const moved: SketchFeature = { ...rest, ...placed(zone, plan), offsets };
    const rebuilt = rebuildChain(moved, was.id);
    if (typeof rebuilt === "string") return base;
    doc = withSketchExtrusion(updateFeature(doc, kept.id, () => moved), kept.id, rebuilt.geometry, { groups: extrusionGroups(offsets ?? [], rebuilt) });
    sketch = kept.id;
    at = { step: was.id, input };
  } else {
    const below = zoneSketch(doc, plan, zone.id)?.offsets?.find(isPartition);
    if (!below || !isPartition(below)) return base;
    const { openTop: _o, ...input } = below.step.input;
    const step = uniqueOffsetId(doc);
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [topRecord(step, plan, zone, top, input)] }, step);
    if (typeof rebuilt === "string") return base;
    sketch = uniqueId(doc, "sk");
    const feature: SketchFeature = { id: sketch, type: "sketch", name: uniqueName(doc, `Surmeubles — ${zone.label.toLowerCase()}`), ...placed(zone, plan), ...emptySketchGeometry() };
    doc = withSketchExtrusion({ ...doc, features: [...doc.features, feature] }, sketch, rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
    at = { step, input };
  }
  doc = syncPartitionDoors(doc, sketch);
  // Their doors made when they are, or when the settings are applied again; kept as they were otherwise.
  if (asked || !kept) doc = withTopDoors(doc, sketch, at.step, zone, top, at.input);
  // A corner's last side, made again at their height.
  const key = `top:${zone.id}`;
  const { next: clean } = deleteFeatures(doc, plan.boards?.[key] ?? []);
  doc = clean;
  if (zone.kind === "corner") {
    const { cornerB: b, depth: d, thickness: t, lengthA: l } = plan;
    doc = sheet(doc, `Surmeubles — ${zone.label.toLowerCase()} — côté`, (zone.id === "left" ? rect(0, -b, d, t - b) : rect(l - d, -b, l, t - b)).map((p) => onFloor(plan, p)), { offset: zoneHeight(plan, zone) }, top.height);
  }
  const known = new Set(clean.features.map((f) => f.id));
  return withSettings(doc, planId, { tops: { ...plan.tops, [zone.id]: sketch }, boards: { ...plan.boards, [key]: doc.features.filter((f) => !known.has(f.id)).map((f) => f.id) } });
}

/** The top units of a zone taken away (with all that was done in them). */
export function withTopOff(doc: CadDocument, planId: string, zoneId: string): CadDocument {
  const plan = planIn(doc, planId) as DressingPlan;
  const key = `top:${zoneId}`;
  const sketch = plan.tops?.[zoneId] ? findFeature(doc, plan.tops[zoneId]!) : undefined;
  const next = sketch?.type === "sketch" ? withoutZone(doc, sketch, plan.boards?.[key] ?? []) : deleteFeatures(doc, plan.boards?.[key] ?? []).next;
  const { [zoneId]: _t, ...tops } = plan.tops ?? {};
  const { [key]: _b, ...boards } = plan.boards ?? {};
  return withSettings(next, planId, { tops, boards });
}

/** The Répartition of a zone's top units, to open in its tool; null when it has none. */
export function topStep(doc: CadDocument, plan: DressingPlan, zoneId: string): { sketch: string; step: string } | null {
  const sketch = plan.tops?.[zoneId] ? findFeature(doc, plan.tops[zoneId]!) : undefined;
  const step = sketch?.type === "sketch" ? (sketch.offsets ?? []).find(isPartition) : undefined;
  return sketch && step ? { sketch: sketch.id, step: step.id } : null;
}

/** Why these top units cannot be, or null. */
export function topProblem(plan: DressingPlan, top: NonNullable<DressingPlan["top"]>): string | null {
  if (plan.roof) return "Pas de surmeubles sous un rampant : le dessus suit déjà le plafond.";
  if (!(top.height >= 200 && top.height <= 1000)) return "La hauteur des surmeubles va de 20 à 100 cm.";
  return null;
}

/** Top units over every zone made, those made kept and brought to these settings; null: all taken away. */
export function withTopUnitsSet(base: CadDocument, planId: string, top: DressingPlan["top"] | null): CadDocument {
  let doc = withSettings(base, planId, { top: top ?? undefined });
  const plan = planIn(doc, planId) as DressingPlan;
  // Those of an older plan, made among a zone's boards: the boards made again without them.
  for (const zone of planZones(plan)) if (zoneDone(doc, plan, zone.id) && plan.boards?.[zone.id]?.some((id) => findFeature(doc, id)?.name.startsWith("Surmeubles"))) doc = withZoneBoards(doc, planId, zone);
  for (const id of Object.keys(plan.tops ?? {})) if (!top || !planZones(plan).some((z) => z.id === id)) doc = withTopOff(doc, planId, id);
  if (top) for (const zone of planZones(plan)) doc = withTopOn(doc, planId, zone, true);
  return doc;
}
