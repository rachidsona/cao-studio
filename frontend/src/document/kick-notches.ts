/**
 * Plinthe reculée d'une cuisine : les côtés de ses caissons descendent au sol (le socle), ils sont entaillés à l'avant
 * sur la hauteur du socle, assez profond pour que la plinthe passe derrière la face du caisson. Pour le noyau seulement,
 * comme les entailles des profils gorge (features/fronts-parts.ts stampGorges, posées avant). Pur.
 */
import { partitionOf } from "./caisson-follow";
import { kickOf } from "./kitchen-corners";
import { kitchenPlanIn, kitchenRunOf } from "./kitchen-floor";
import { FRONT } from "./kitchen-plan-shapes";
import type { CabinetFeature, CabinetNotch, CadDocument, Vec3 } from "./types";
import { frameOf } from "../sketcher/frame";

/** The plinth's board (mm), as document/kitchen-plan-build.ts makes it. */
const KICK = 16;

/** The notch the sides of this cabinet need for the plinth of its run, set back behind its fronts; or null. */
export function kickNotch(doc: CadDocument, cabinet: CabinetFeature): CabinetNotch | null {
  if (!(cabinet.plinth > 0) || cabinet.origin[2] > 1 || cabinet.construction !== "sides-through") return null;
  const owner = kitchenRunOf(doc, cabinet.id);
  const plan = owner ? kitchenPlanIn(doc, owner.plan) : null;
  if (!owner || !plan) return null;
  const kick = kickOf(plan, owner.run);
  // From the cabinet's front to the back of the plinth: the fronts stand FRONT in front of it.
  const depth = kick.back + KICK - FRONT;
  // From a little under the floor, for a clean cut.
  return kick.on && depth > 0 ? { z0: -1, z1: cabinet.plinth, depth } : null;
}

/**
 * The same notch for the caissons furnished in the rooms of a kitchen's runs (Répartitions, document/cabinet-furnish.ts),
 * by their sketch: the box to cut out of their sides (world) — across the caisson, from under the floor to the top of
 * its plinth, from its front back to behind the plinth. Those standing on the floor with sides down to it only.
 */
export function caissonKickNotches(doc: CadDocument): Map<string, [Vec3, Vec3]> {
  const out = new Map<string, [Vec3, Vec3]>();
  for (const plan of doc.features) {
    if (plan.type !== "sketch" || !plan.kitchenPlan) continue;
    const p = kitchenPlanIn(doc, plan.id);
    for (const [run, items] of Object.entries(p?.runs ?? {})) {
      const kick = kickOf(p!, run);
      const depth = kick.back + KICK - FRONT;
      if (!kick.on || depth <= 0) continue;
      for (const item of items) {
        const sketch = item.furnished ? doc.features.find((f) => f.id === item.furnished) : undefined;
        const step = sketch?.type === "sketch" ? partitionOf(sketch)?.step : undefined;
        if (sketch?.type !== "sketch" || !step?.depth || !(step.input.plinth > 0) || step.input.outer !== "side") continue;
        const { origin, u, v, normal } = frameOf(sketch);
        if (Math.abs(origin[2]) > 1) continue;
        const xs = sketch.points.map((p) => p.x);
        const corners = [Math.min(...xs) - 1, Math.max(...xs) + 1].flatMap((x) => [-1, step.input.plinth].flatMap((y) => [step.depth! - depth, step.depth! + 1].map((w) => [0, 1, 2].map((i) => origin[i]! + u[i]! * x + v[i]! * y + normal[i]! * w))));
        out.set(sketch.id, [[0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!))) as Vec3]);
      }
    }
  }
  return out;
}

/** The document with each cabinet of a kitchen, and each side of a caisson furnished in one, carrying the notch of its plinth, for the kernel only. */
export function stampKickNotches(doc: CadDocument): CadDocument {
  let changed = false;
  const caissons = caissonKickNotches(doc);
  const features = doc.features.map((f) => {
    // A caisson's sides: its panels named so, made on its sketch.
    const cut = f.type === "extrude" && f.sketch && /^Côté/.test(f.name) ? caissons.get(f.sketch) : undefined;
    if (cut && f.type === "extrude") return (changed = true), { ...f, notch: cut };
    const notch = f.type === "cabinet" ? kickNotch(doc, f) : null;
    if (!notch || f.type !== "cabinet") return f;
    changed = true;
    return { ...f, notches: [...(f.notches ?? []), notch] };
  });
  return changed ? { ...doc, features } : doc;
}
