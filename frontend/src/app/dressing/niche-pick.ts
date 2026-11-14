/** La niche sous le pointeur, dans toutes les Répartitions du projet : la plus proche de l'œil. */
import type { NichePlace } from "../../document/niche-recipe";
import type { CadDocument, SketchFeature, Vec3 } from "../../document/types";
import { frameOf, rayToSketch, toWorld } from "../../sketcher/frame";
import { isPartition, leafNiches } from "../../sketcher/partition-history";
import type { NicheBox } from "../../sketcher/shelves";
import type { Viewport } from "../../viewport/viewport";
import { sketchShown } from "../zone-view";

export interface PickedNiche extends NichePlace {
  box: NicheBox;
  /** The point of the sketch to give a tool: the middle of the niche. */
  middle: [number, number];
}

/** How many depths of a niche the ray is tried at, from its front to its back. */
const SAMPLES = 8;

export function nicheUnderPointer(viewport: Viewport, doc: CadDocument, event: PointerEvent | MouseEvent): PickedNiche | null {
  const { origin, direction } = viewport.rayFromEvent(event as PointerEvent);
  let best: { niche: PickedNiche; distance: number } | null = null;
  for (const sketch of doc.features.filter((f): f is SketchFeature => f.type === "sketch" && !f.suppressed && (f.offsets ?? []).some(isPartition) && sketchShown(f.id))) {
    const frame = frameOf(sketch);
    const leaves = leafNiches(sketch);
    // A niche is a volume: seen in perspective, a ray can enter it in front and leave through a side.
    for (const leaf of leaves) {
      const depth = leaf.depth ?? 0;
      for (let i = 0; i <= SAMPLES; i++) {
        const off = depth * (1 - i / SAMPLES);
        const shifted = [0, 1, 2].map((k) => origin[k]! - frame.normal[k]! * off) as Vec3;
        const p = rayToSketch(frame, shifted, direction);
        if (!p || !(p[0] > leaf.box.x0 && p[0] < leaf.box.x1 && p[1] > leaf.box.y0 && p[1] < leaf.box.y1)) continue;
        const distance = Math.hypot(...toWorld(frame, p[0], p[1]).map((v, k) => v + frame.normal[k]! * off - origin[k]!));
        if (!best || distance < best.distance) best = { distance, niche: { sketch: sketch.id, partition: leaf.partition, path: leaf.path, box: leaf.box, middle: [(leaf.box.x0 + leaf.box.x1) / 2, (leaf.box.y0 + leaf.box.y1) / 2] } };
        break;
      }
    }
  }
  return best?.niche ?? null;
}

/** The niche of a Répartition at a point of the model (projected on its plane), else its biggest niche. */
export function nicheAt(doc: CadDocument, sketchId: string, at: Vec3): PickedNiche | null {
  const sketch = doc.features.find((f): f is SketchFeature => f.id === sketchId && f.type === "sketch");
  if (!sketch) return null;
  const { origin, u, v } = frameOf(sketch);
  const rel = [0, 1, 2].map((k) => at[k]! - origin[k]!);
  const p = [rel[0]! * u[0] + rel[1]! * u[1] + rel[2]! * u[2], rel[0]! * v[0] + rel[1]! * v[1] + rel[2]! * v[2]] as const;
  const leaves = leafNiches(sketch);
  const area = (b: NicheBox) => (b.x1 - b.x0) * (b.y1 - b.y0);
  const leaf = leaves.find((l) => p[0] > l.box.x0 && p[0] < l.box.x1 && p[1] > l.box.y0 && p[1] < l.box.y1) ?? [...leaves].sort((a, b) => area(b.box) - area(a.box))[0];
  return leaf ? { sketch: sketch.id, partition: leaf.partition, path: leaf.path, box: leaf.box, middle: [(leaf.box.x0 + leaf.box.x1) / 2, (leaf.box.y0 + leaf.box.y1) / 2] } : null;
}
