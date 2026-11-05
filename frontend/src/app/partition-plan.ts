/**
 * Where the dimensions of the Répartitions come from (features/partition-dims.ts): the plans of a sketch, by its
 * history of partition and divisions. While a tool of joinery works (joinery-3d.ts), `joineryPlans` holds what OK
 * would make, so the dimensions follow the panel of the tool before anything is stored.
 */
import type { SketchGeometry } from "../document/sketch";
import type { CadDocument, SketchFeature } from "../document/types";
import type { PartitionPlan } from "../features/partition-dims";
import { isPartition, leafNiches } from "../sketcher/partition-history";

export interface SketchPlans {
  sketch: SketchFeature;
  plans: PartitionPlan[];
}

/** The plans of every Répartition of this sketch; `divided`: what the tool would do to the niches chosen. */
export function plansOf(g: SketchGeometry, divided: { box: PartitionPlan["outer"]; into: PartitionPlan["outer"][] }[] = []): PartitionPlan[] {
  const leaves = leafNiches(g);
  const same = (a: PartitionPlan["outer"], b: PartitionPlan["outer"]) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
  return (g.offsets ?? []).filter(isPartition).map((record) => {
    const { input, origin, depth } = record.step;
    const niches = leaves
      .filter((leaf) => leaf.partition === record.id)
      .flatMap((leaf) => divided.find((d) => same(d.box, leaf.box))?.into ?? [leaf.box]);
    return {
      outer: { x0: origin[0], y0: origin[1], x1: origin[0] + input.length, y1: origin[1] + input.height },
      niches,
      depth: depth ?? 0,
      plinth: input.plinth,
    };
  });
}

/** The sketches of the document that hold a Répartition, with their plans. */
export function documentPlans(doc: CadDocument): SketchPlans[] {
  return doc.features.flatMap((f) => {
    if (f.type !== "sketch" || !(f.offsets ?? []).some(isPartition)) return [];
    return [{ sketch: f, plans: plansOf(f) }];
  });
}

/** The tool of joinery at work: null when none is. */
export const joineryPlans: { current: { sketch: SketchFeature | null; frame: import("../sketcher/frame").SketchFrame; plans: PartitionPlan[] } | null; changed: () => void } = {
  current: null,
  changed: () => {},
};
