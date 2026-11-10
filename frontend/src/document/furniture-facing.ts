/**
 * À quel mur un meuble tourne le dos : un caisson de cuisine et ses façades (sa rotation), un appareil, un caisson de
 * dressing (une Répartition : le devant de son esquisse), tout ce qu'un linéaire du Plan de cuisine a fait avec ses
 * caissons (plan de travail, crédence, plinthe, fileurs), et les finitions d'un meuble ; chacun avec le meuble dont il
 * fait partie (une zone de dressing, un linéaire), pour y rattacher ce qui l'équipe sans rien dire de son sens
 * (charnières, portes coulissantes, accessoires). Sert à effacer, avec un mur
 * qui cache la vue, les meubles qui sont les siens, et eux seuls (app/wall-cutaway.ts). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, type CadDocument } from "./types";
import { frameOf } from "../sketcher/frame";
import { isPartition } from "../sketcher/partition-history";

/** Where a piece of furniture turns its back (unit, seen from above), and which piece it is (its key). */
export interface Facing {
  back: [number, number];
  group: string;
}

/** For each feature of a piece of furniture whose back is known: where it turns it, and the piece it is part of. */
export function featureBacks(doc: CadDocument): Map<string, Facing> {
  const backs = new Map<string, Facing>();
  const sketches = new Map<string, Facing>();
  for (const f of doc.features) {
    if (f.type === "cabinet" || f.type === "appliance") backs.set(f.id, { back: cabinetAxes(f.rotation ?? 0).back, group: f.id });
    if (f.type === "sketch" && (f.offsets ?? []).some(isPartition)) {
      // Its front is towards its normal: an upright sketch only.
      const [x, y, z] = frameOf(f).normal;
      const flat = Math.hypot(x, y);
      if (flat > 0.9 && Math.abs(z) < 0.1) sketches.set(f.id, { back: [-x / flat, -y / flat], group: f.id });
    }
  }
  for (const f of doc.features) {
    const facing = f.type === "fronts" ? backs.get(f.cabinet) : (f.type === "extrude" || f.type === "niche") && f.sketch ? sketches.get(f.sketch) : undefined;
    if (facing) backs.set(f.id, facing);
  }
  // What a run of a kitchen plan made, with its units: turned as they are, one piece with them.
  for (const f of doc.features) {
    if (f.type !== "sketch" || !f.kitchenPlan?.made) continue;
    for (const [run, ids] of Object.entries(f.kitchenPlan.made)) {
      const unit = ids.find((id) => findFeature(doc, id)?.type === "cabinet") ?? ids.find((id) => backs.has(id));
      const facing = unit ? backs.get(unit) : undefined;
      if (!facing) continue;
      const group = `${f.id}:${run}`;
      for (const id of ids) backs.set(id, { back: backs.get(id)?.back ?? facing.back, group });
    }
  }
  // Finishings: as the furniture they dress.
  for (const f of doc.features) {
    if (f.type !== "trim" || !f.source?.length) continue;
    const facing = f.source.map((id) => backs.get(featureOfBody(bodyOrigin(doc, id)))).find(Boolean);
    if (facing) backs.set(f.id, facing);
  }
  return backs;
}
