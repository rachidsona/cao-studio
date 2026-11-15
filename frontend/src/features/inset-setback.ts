/**
 * Les étagères derrière une porte encastrée : la porte entre dans le meuble de toute son épaisseur, donc ce qu'elle ferme
 * est moins profond d'autant. Dans un caisson, ses façades encastrées reculent ses étagères (`shelfSetback`) ; dans une
 * Répartition, une porte encastrée sur une case raccourcit à l'avant les étagères et les cloisons qui sont dans la case.
 * Recopié pour le noyau seulement (geometry/client.ts kernelDocument), comme les gorges : le document garde ses cotes,
 * et tout suit quand la porte passe en applique, change d'épaisseur ou disparaît. Pur.
 */
import { findFeature } from "../document/operations";
import type { CadDocument, ExtrudeFeature, Feature, NicheFeature, SketchFeature } from "../document/types";
import { nicheGeometry } from "./niche-parts";

/** How much of a cabinet's depth its inset fronts take (0: none, or in applique). */
const cabinetSetback = (doc: CadDocument, cabinet: string): number =>
  Math.max(0, ...doc.features.map((f) => (f.type === "fronts" && f.cabinet === cabinet && !f.suppressed && f.mount === "inset" ? f.thickness : 0)));

/** The boards of a partition's sketch behind its inset doors, and how much shorter each one is. */
function partitionSetbacks(doc: CadDocument): Map<string, number> {
  const out = new Map<string, number>();
  const doors = doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === "door" && f.mount === "inset" && !f.suppressed);
  for (const door of doors) {
    const sketch = findFeature(doc, door.sketch) as SketchFeature | undefined;
    const g = nicheGeometry(door, sketch);
    if (typeof g === "string" || g.cut || !(door.thickness > 0 && door.thickness < g.depth)) continue;
    const { x0, x1, y0, y1 } = g.box;
    const inside = ([u, v]: [number, number]) => u > Math.min(x0, x1) + 0.5 && u < Math.max(x0, x1) - 0.5 && v > Math.min(y0, y1) + 0.5 && v < Math.max(y0, y1) - 0.5;
    for (const f of doc.features) {
      // A board of this partition (as deep as its panels), standing in the niches the door closes.
      if (f.type !== "extrude" || f.sketch !== door.sketch || f.suppressed || f.startOffset || Math.abs(Math.abs(f.distance) - g.depth) > 1e-6) continue;
      const probe = f.regions?.[0];
      if (probe && inside(probe)) out.set(f.id, Math.max(out.get(f.id) ?? 0, door.thickness));
    }
  }
  return out;
}

/** The document with the shelves behind inset doors set back by their thickness, for the kernel only. */
export function stampInsetSetbacks(doc: CadDocument): CadDocument {
  const boards = partitionSetbacks(doc);
  let changed = false;
  const features = doc.features.map((f): Feature => {
    if (f.type === "cabinet") {
      const setback = cabinetSetback(doc, f.id);
      if (setback === (f.shelfSetback ?? 0)) return f;
      changed = true;
      const { shelfSetback: _old, ...rest } = f;
      return setback ? { ...rest, shelfSetback: setback } : rest;
    }
    const cut = f.type === "extrude" ? boards.get(f.id) : undefined;
    if (!cut) return f;
    changed = true;
    const e = f as ExtrudeFeature;
    return { ...e, distance: Math.sign(e.distance) * (Math.abs(e.distance) - cut) };
  });
  return changed ? { ...doc, features } : doc;
}
