/**
 * Plinthe reculée d'une cuisine : les côtés de ses caissons descendent au sol (le socle), ils sont entaillés à l'avant
 * sur la hauteur du socle, assez profond pour que la plinthe passe derrière la face du caisson. Pour le noyau seulement,
 * comme les entailles des profils gorge (features/fronts-parts.ts stampGorges, posées avant). Pur.
 */
import { kickOf } from "./kitchen-corners";
import { kitchenPlanIn, kitchenRunOf } from "./kitchen-floor";
import { FRONT } from "./kitchen-plan-shapes";
import type { CabinetFeature, CabinetNotch, CadDocument } from "./types";

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

/** The document with each cabinet of a kitchen carrying the notch of its plinth, for the kernel only. */
export function stampKickNotches(doc: CadDocument): CadDocument {
  let changed = false;
  const features = doc.features.map((f) => {
    const notch = f.type === "cabinet" ? kickNotch(doc, f) : null;
    if (!notch || f.type !== "cabinet") return f;
    changed = true;
    return { ...f, notches: [...(f.notches ?? []), notch] };
  });
  return changed ? { ...doc, features } : doc;
}
