/**
 * Ce qu'on déplace avec « Le corps entier » : le meuble ou la Répartition dont l'élément est une pièce. Un caisson
 * se déplace par son origine, ses façades le suivent ; une Répartition par son esquisse, ses panneaux, portes et niches
 * la suivent. Le meuble reste ainsi un seul meuble, réglable, avec une seule annulation.
 */
import { bodyOrigin, findFeature } from "../document/operations";
import { planUnitCabinet } from "../document/kitchen-plan-add";
import { featureOfBody, type CadDocument } from "../document/types";

export interface Whole {
  kind: "cabinet" | "sketch";
  id: string;
  name: string;
  /** Its bodies in the view. */
  bodies: string[];
}

/** The feature that holds a body together with its neighbours (its cabinet, the sketch of its Répartition), or null. */
export function wholeOwner(doc: CadDocument, bodyId: string): { kind: Whole["kind"]; id: string } | null {
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  if (f?.type === "cabinet") return { kind: "cabinet", id: f.id };
  if (f?.type === "fronts") return { kind: "cabinet", id: f.cabinet };
  if (f?.type === "niche" || f?.type === "panels") return f.sketch ? { kind: "sketch", id: f.sketch } : null;
  // A side or the fridge of a fridge's surround: the surround, by its caisson (the plan makes the rest again round it).
  const unit = f ? planUnitCabinet(doc, f.id) : null;
  if (unit) return { kind: "cabinet", id: unit };
  // An extrusion is part of a whole when its sketch is a piece of furniture (a Répartition, a dressing or kitchen plan);
  // the bodies of a plain sketch (a sofa drawn in one sketch) are each their own.
  if (f?.type === "extrude" && f.sketch && furniture(doc, f.sketch)) return { kind: "sketch", id: f.sketch };
  return null;
}

/** Whether a sketch is a piece of furniture: its panels made by a Répartition's steps or a plan, or niches equipped in it. */
function furniture(doc: CadDocument, sketchId: string): boolean {
  const s = findFeature(doc, sketchId);
  if (s?.type !== "sketch") return false;
  return !!s.offsets?.some((r) => r.step) || !!s.dressingPlan || !!s.kitchenPlan || doc.features.some((f) => f.type === "niche" && f.sketch === sketchId);
}

/** The bodies shown of a whole: a cabinet's with its fronts', a Répartition's panels, doors and niches. */
export function wholeBodies(doc: CadDocument, kind: Whole["kind"], id: string, displayed: readonly string[]): string[] {
  return displayed.filter((body) => {
    const other = wholeOwner(doc, body);
    return other?.kind === kind && other.id === id;
  });
}

/** The whole a body belongs to, among the bodies shown; null when it stands alone (it is its own whole). */
export function wholeOf(doc: CadDocument, bodyId: string, displayed: readonly string[]): Whole | null {
  const owner = wholeOwner(doc, bodyId);
  const feature = owner && findFeature(doc, owner.id);
  if (!owner || !feature) return null;
  const bodies = displayed.filter((id) => {
    const other = wholeOwner(doc, id);
    return other?.kind === owner.kind && other.id === owner.id;
  });
  return bodies.length > 1 ? { ...owner, name: feature.name, bodies } : null;
}
