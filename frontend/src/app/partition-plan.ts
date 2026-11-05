/**
 * Where the dimensions of the Répartitions come from (features/partition-dims.ts): the plans of a sketch, by its
 * history of partition and divisions. While a tool works on them (joinery-3d.ts, dressing-tool.ts), `joineryPlans`
 * holds what OK would make, so the dimensions follow the panel of the tool before anything is stored.
 */
import type { SketchGeometry } from "../document/sketch";
import type { CadDocument, SketchFeature } from "../document/types";
import { partitionDoors } from "../features/niche-parts";
import type { PartitionPlan } from "../features/partition-dims";
import { frameOf, type SketchFrame } from "../sketcher/frame";
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
    const doors = record.step.doors ? partitionDoors(input, origin, record.step.doors.gap) : [];
    return {
      outer: { x0: origin[0], y0: origin[1], x1: origin[0] + input.length, y1: origin[1] + input.height },
      niches,
      depth: depth ?? 0,
      plinth: input.plinth,
      doors: typeof doors === "string" ? [] : doors.map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 })),
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

/** What a tool is making in one sketch; `preview`: its bodies are a preview, not yet in the document. */
export interface WorkingPlans {
  sketch: SketchFeature | null;
  frame: SketchFrame;
  plans: PartitionPlan[];
  preview?: true;
}

/** The tool at work: null when none is. */
export const joineryPlans: { current: WorkingPlans[] | null; changed: () => void } = {
  current: null,
  changed: () => {},
};

/** What a document being previewed holds in these sketches. */
export function previewPlans(doc: CadDocument, sketchIds: string[]): WorkingPlans[] {
  return documentPlans(doc)
    .filter(({ sketch }) => sketchIds.includes(sketch.id))
    .map(({ sketch, plans }) => ({ sketch, frame: frameOf(sketch), plans, preview: true }));
}
