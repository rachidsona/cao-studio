/**
 * Ce que coûtent à usiner les façades décor (door-decor.ts) : la longueur de leurs rainures — cannelures ou tasseaux —
 * sur toutes les portes et façades de tiroir du modèle (des caissons, des niches de Répartition), là où le noyau les
 * creuse, en mètres. Le devis la compte au mètre de rainure (QuoteRates.perGrooveMetre). Pur.
 */
import { findFeature } from "../document/operations";
import type { CabinetFeature, CadDocument, SketchFeature } from "../document/types";
import { decorClear, decorGrooves, isDecor, type Groove } from "./door-decor";
import { frontsParts } from "./fronts-parts";
import { nicheGeometry, nicheParts } from "./niche-parts";

const length = (grooves: readonly Groove[]) => grooves.reduce((sum, g) => sum + Math.max(0, g.v1 - g.v0), 0);

/** The length of every decor groove of the model (m). */
export function decorMetres(doc: CadDocument): number {
  let mm = 0;
  for (const f of doc.features) {
    if (f.suppressed || !(f.type === "fronts" || f.type === "niche") || !isDecor(f)) continue;
    if (f.type === "fronts") {
      const cabinet = findFeature(doc, f.cabinet) as CabinetFeature | undefined;
      for (const part of frontsParts(f, cabinet)) {
        if (!part.role) continue;
        // As fronts.ts cuts them: clear of a door's hinge cups when they would meet.
        const cups = part.role.kind === "door" && f.hinges ? (f.hw?.cupDepth ?? 13) : 0;
        mm += length(decorGrooves(f, part.from[0], part.to[0], part.from[2], part.to[2], decorClear(f, f.thickness, cups)));
      }
      continue;
    }
    const n = nicheGeometry(f, findFeature(doc, f.sketch) as SketchFeature | undefined);
    if (typeof n === "string") continue;
    for (const part of nicheParts(f, n)) {
      if (part.role === "front" && (!!part.handle || f.fill === "drawers")) mm += length(decorGrooves(f, part.from[0], part.to[0], part.from[1], part.to[1]));
    }
  }
  return Math.round(mm) / 1000;
}
