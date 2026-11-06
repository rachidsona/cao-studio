/**
 * Ce qu'un plan de dressing laisse à revoir, lu sur le plan lui-même, avant même de fabriquer : les passages trop
 * étroits, les portes et tiroirs d'une case bloqués par une zone voisine (l'angle mort d'un mur qui passe), les portes
 * battantes doublées de coulissantes, et, sur une pièce relevée, ce que le dressing cache ou touche. Pur.
 */
import { planObstacles, lowCeilings, roomOf } from "./plan-room";
import { planZones, type PlanZone, type Point } from "./plan-shapes";
import { findFeature } from "./operations";
import type { CadDocument, DressingPlan, SketchFeature } from "./types";
import { partitionLayout } from "../sketcher/partition";
import { isPartition } from "../sketcher/partition-history";

/** Under this, one no longer walks between two runs (mm). */
const NARROW = 600;
/** How far a drawer comes out, short of the depth of the case (mm). */
const DRAWER_BACK = 100;

const cm = (mm: number) => `${Number((mm / 10).toFixed(0))} cm`;

/** What stands in front of a stretch of a run: how far, and which zone. */
function inFront(zone: PlanZone, zones: readonly PlanZone[], from: number, to: number): { other: PlanZone; distance: number } | null {
  const [[ox, oy], [nx, ny]] = [zone.run.origin, zone.run.normal];
  let nearest: { other: PlanZone; distance: number } | null = null;
  for (const other of zones) {
    if (other === zone) continue;
    const local = other.outline.map(([x, y]) => [-(x - ox) * ny + (y - oy) * nx, (x - ox) * nx + (y - oy) * ny] as const);
    const [along, off] = [local.map((p) => p[0]), local.map((p) => p[1])];
    if (Math.min(...along) >= to - 1 || Math.max(...along) <= from + 1 || Math.max(...off) <= zone.run.depth + 1) continue;
    const distance = Math.max(0, Math.min(...off) - zone.run.depth);
    if (!nearest || distance < nearest.distance) nearest = { other, distance };
  }
  return nearest;
}

const touches = (zone: PlanZone, [ax, ay]: Point, [bx, by]: Point) => {
  const [xs, ys] = [zone.outline.map((p) => p[0]), zone.outline.map((p) => p[1])];
  return Math.min(ax, bx) < Math.max(...xs) - 1 && Math.max(ax, bx) > Math.min(...xs) + 1 && Math.min(ay, by) <= Math.max(...ys) + 1 && Math.max(ay, by) >= Math.min(...ys) - 1;
};

/** What to look at on this plan, placed in this document. */
export function planChecks(doc: CadDocument, plan: DressingPlan): string[] {
  const zones = planZones(plan);
  const out: string[] = [];
  const passages = new Set<string>();
  for (const zone of zones) {
    if (zone.kind === "corner") continue;
    const facing = inFront(zone, zones, zone.run.start, zone.run.start + zone.run.length);
    if (facing && facing.distance > 0 && facing.distance < NARROW) {
      const pair = [zone.label, facing.other.label].sort().join(" et ");
      if (!passages.has(pair)) out.push(`Passage de ${cm(facing.distance)} seulement entre ${pair}.`);
      passages.add(pair);
    }
    const sketchId = plan.made?.[zone.id];
    const sketch = sketchId ? (findFeature(doc, sketchId) as SketchFeature | undefined) : undefined;
    const step = sketch?.offsets?.find(isPartition)?.step;
    if (plan.sliding?.[zone.id] && plan.roof) out.push(`${zone.label} : pas de portes coulissantes sous un rampant, leur rail doit être de niveau.`);
    if (plan.sliding?.[zone.id] && step?.doors) out.push(`${zone.label} a des portes battantes et des portes coulissantes.`);
    const layout = step ? partitionLayout(step.input) : null;
    if (!step || !layout || typeof layout === "string") continue;
    const sliding = (plan.sliding?.[zone.id] ?? 0) > 0;
    layout.caseSpans.forEach(([a, b], i) => {
      const [from, to] = [step.origin[0] + a, step.origin[0] + b];
      const front = inFront(zone, zones, from, to);
      if (!front) return;
      const where = `${zone.label}, case ${i + 1}`;
      if (step.doors && !sliding && front.distance < b - a) out.push(`${where} : la porte ne s'ouvre pas en entier, ${front.other.label} est à ${cm(front.distance)}.`);
      const drawers = doc.features.some((f) => f.type === "niche" && f.sketch === sketch!.id && f.fill === "drawers" && f.niche[0] === i);
      if (drawers && front.distance < zone.run.depth - DRAWER_BACK) out.push(`${where} : les tiroirs sont bloqués, ${front.other.label} est à ${cm(front.distance)}.`);
    });
  }
  const room = roomOf(doc, plan);
  if (room) {
    out.push(...lowCeilings(plan, room));
    for (const obstacle of planObstacles(plan, room)) {
      if (obstacle.bottom >= plan.height) continue;
      const hidden = zones.find((z) => touches(z, obstacle.from, obstacle.to));
      if (hidden) out.push(`${obstacle.what[0]!.toUpperCase()}${obstacle.what.slice(1)} est derrière ${hidden.label}.`);
    }
  }
  return out;
}

/** The same for every plan of a document, for the check before making. */
export function dressingChecks(doc: CadDocument): string[] {
  return doc.features.flatMap((f) => (f.type === "sketch" && f.dressingPlan ? planChecks(doc, f.dressingPlan) : []));
}
