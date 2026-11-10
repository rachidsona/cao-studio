/**
 * À quel mur un meuble tourne le dos : un caisson de cuisine et ses façades (sa rotation), un appareil, un caisson de
 * dressing (une Répartition : le devant de son esquisse), tout ce qu'un linéaire du Plan de cuisine a fait avec ses
 * caissons (plan de travail, crédence, plinthe, fileurs), et les finitions d'un meuble. Sert à effacer, avec un mur
 * qui cache la vue, les meubles qui sont les siens, et eux seuls (app/wall-cutaway.ts). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, type CadDocument } from "./types";
import { frameOf } from "../sketcher/frame";
import { isPartition } from "../sketcher/partition-history";

/** For each feature of a piece of furniture whose back is known: the direction it turns its back to (unit, seen from above). */
export function featureBacks(doc: CadDocument): Map<string, [number, number]> {
  const backs = new Map<string, [number, number]>();
  const sketches = new Map<string, [number, number]>();
  for (const f of doc.features) {
    if (f.type === "cabinet" || f.type === "appliance") backs.set(f.id, cabinetAxes(f.rotation ?? 0).back);
    if (f.type === "sketch" && (f.offsets ?? []).some(isPartition)) {
      // Its front is towards its normal: an upright sketch only.
      const [x, y, z] = frameOf(f).normal;
      const flat = Math.hypot(x, y);
      if (flat > 0.9 && Math.abs(z) < 0.1) sketches.set(f.id, [-x / flat, -y / flat]);
    }
  }
  for (const f of doc.features) {
    const back = f.type === "fronts" ? backs.get(f.cabinet) : (f.type === "extrude" || f.type === "niche") && f.sketch ? sketches.get(f.sketch) : undefined;
    if (back) backs.set(f.id, back);
  }
  // What a run of a kitchen plan made, with its units: turned as they are.
  for (const f of doc.features) {
    if (f.type !== "sketch" || !f.kitchenPlan?.made) continue;
    for (const ids of Object.values(f.kitchenPlan.made)) {
      const unit = ids.find((id) => findFeature(doc, id)?.type === "cabinet") ?? ids.find((id) => backs.has(id));
      const back = unit ? backs.get(unit) : undefined;
      if (back) for (const id of ids) if (!backs.has(id)) backs.set(id, back);
    }
  }
  // Finishings: as the furniture they dress.
  for (const f of doc.features) {
    if (f.type !== "trim" || !f.source?.length) continue;
    const back = f.source.map((id) => backs.get(featureOfBody(bodyOrigin(doc, id)))).find(Boolean);
    if (back) backs.set(f.id, back);
  }
  return backs;
}
