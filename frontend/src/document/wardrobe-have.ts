/**
 * Ce que le dressing dessiné offre déjà, pour l'inventaire du client (wardrobe-inventory.ts) : les tringles (courtes
 * dans une niche de moins de 1,30 m de haut, longues au-delà), les étagères de chaque Répartition (leur nombre × la
 * largeur de leur niche ; pas les cloisons), et les tiroirs des niches et des caissons. Pur.
 */
import { nicheGeometry } from "../features/niche-parts";
import { isShelves, pathKey, rebuildChain } from "../sketcher/partition-history";
import type { CadDocument, SketchFeature } from "./types";
import type { Storage } from "./wardrobe-inventory";

/** A rod in a niche this high or more holds long clothes (mm). */
const LONG = 1300;

export function wardrobeHave(doc: CadDocument): Storage {
  const have: Storage = { shortRod: 0, longRod: 0, shelves: 0, drawers: 0 };
  const sketch = (id: string) => doc.features.find((f): f is SketchFeature => f.id === id && f.type === "sketch");
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "niche" && f.fill === "rod") {
      const n = nicheGeometry(f, sketch(f.sketch));
      if (typeof n === "string") continue;
      const [width, height] = [n.box.x1 - n.box.x0, n.box.y1 - n.box.y0];
      if (height >= LONG) have.longRod += width;
      else have.shortRod += width;
    } else if (f.type === "niche" && f.fill === "drawers") have.drawers += f.drawers;
    else if (f.type === "fronts" && f.layout === "drawers") have.drawers += f.drawers;
    else if (f.type === "sketch") {
      // The shelves of its partitions: each step's count across its niche.
      for (const r of (f.offsets ?? []).filter(isShelves)) {
        if (r.step.input.vertical) continue;
        const rebuilt = rebuildChain(f, r.step.of);
        const node = typeof rebuilt === "string" ? undefined : rebuilt.niches.get(pathKey(r.step.niche));
        if (node) have.shelves += r.step.input.count * (node.box.x1 - node.box.x0);
      }
    }
  }
  for (const k of Object.keys(have) as (keyof Storage)[]) have[k] = Math.round(have[k]);
  return have;
}
