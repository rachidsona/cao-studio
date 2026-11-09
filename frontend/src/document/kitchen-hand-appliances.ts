/**
 * Les appareils posés à la main (Électroménager) devant un linéaire du Plan de cuisine : où ils sont le long de lui et
 * à quelle hauteur, pour que sa bande les montre, de face, là où la 3D les a. Ceux que le plan a faits lui-même sont
 * déjà dessinés par leur meuble, et ceux dont les pièces ont été supprimées ne sont plus là. Pur.
 */
import { applianceShown } from "./appliance-place";
import { cabinetAxes } from "./kitchen-catalog";
import { runAt, type KitchenRun } from "./kitchen-plan-shapes";
import type { CadDocument, KitchenFloorPlan, Vec3 } from "./types";
import { placePoint, turn } from "../features/room-runs";

export interface HandAppliance {
  id: string;
  name: string;
  model: string;
  /** Along the run (mm from its start), and from the floor. */
  from: number;
  to: number;
  z0: number;
  z1: number;
}

/** Beyond the run's units, front or back, what still counts as in front of it (mm). */
const REACH = 60;

export function handAppliances(doc: CadDocument, plan: KitchenFloorPlan, run: KitchenRun): HandAppliance[] {
  const made = new Set(Object.values(plan.made ?? {}).flat());
  const place = plan.place ?? { quarter: 0 as const, origin: [0, 0] as [number, number] };
  const [o, u1, v1] = [runAt(run, 0, run.back), runAt(run, 1, run.back), runAt(run, 0, run.back + 1)];
  const start = placePoint(place, [o[0], o[1], 0]);
  const along = turn(place, [u1[0] - o[0], u1[1] - o[1], 0]);
  const inward = turn(place, [v1[0] - o[0], v1[1] - o[1], 0]);
  const dot = (p: Vec3, d: Vec3) => (p[0] - start[0]) * d[0] + (p[1] - start[1]) * d[1];
  const out: HandAppliance[] = [];
  for (const f of doc.features) {
    if (f.type !== "appliance" || made.has(f.id) || !applianceShown(doc, f)) continue;
    const { along: a, back: b } = cabinetAxes(f.rotation ?? 0);
    const corners = [[0, 0], [f.width, 0], [0, f.depth], [f.width, f.depth]].map(([x, y]): Vec3 => [f.origin[0] + a[0] * x! + b[0] * y!, f.origin[1] + a[1] * x! + b[1] * y!, 0]);
    const us = corners.map((c) => dot(c, along));
    const offs = corners.map((c) => dot(c, inward));
    if (Math.max(...offs) < -REACH || Math.min(...offs) > plan.depth + REACH) continue;
    const [from, to] = [Math.min(...us), Math.max(...us)];
    if (to < 0 || from > run.length) continue;
    out.push({ id: f.id, name: f.name, model: f.model, from, to, z0: f.origin[2], z1: f.origin[2] + f.height });
  }
  return out;
}
