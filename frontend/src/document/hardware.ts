/**
 * Quincaillerie du modèle, pour le devis : charnières, coulisses et poignées des façades, tringles et supports des
 * penderies, coulisses et poignées des tiroirs de niche, vis confirmat, tourillons et excentriques
 * des usinages (chacun fait un trou dans chacune des deux planches qu'il assemble) ; le verre trempé (au m²) et le
 * profilé alu (au mètre) des portes vitrées, qui s'achètent au lieu de se scier.
 */
import { frontsHardware, frontsParts } from "../features/fronts-parts";
import { isGlass } from "../features/glass-door";
import { nicheHardware, nichePartsIn } from "../features/niche-parts";
import { catalogItems } from "./hardware-catalog";
import type { CadDocument } from "./types";

export const CONFIRMAT_SCREW = "Vis confirmat 7 × 50";
export const DOWEL = "Tourillon Ø8 × 30";
export const MINIFIX_SET = "Excentrique Minifix 15 + tige";

export function modelHardware(doc: CadDocument): { name: string; quantity: number; unit?: string }[] {
  const counts = new Map<string, number>();
  const units = new Map<string, string>();
  const add = (name: string, quantity: number) => quantity > 0 && counts.set(name, Math.round(((counts.get(name) ?? 0) + quantity) * 100) / 100);
  let screwHoles = 0;
  let dowelHoles = 0;
  let cams = 0;
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "fronts") {
      const cabinet = doc.features.find((c) => c.id === f.cabinet);
      for (const h of frontsHardware(f, cabinet?.type === "cabinet" ? cabinet : undefined)) {
        add(h.name, h.quantity);
        if (h.unit) units.set(h.name, h.unit);
      }
    } else if (f.type === "niche") {
      for (const h of nicheHardware(doc.features, f)) {
        add(h.name, h.quantity);
        if (h.unit) units.set(h.name, h.unit);
      }
    } else if (f.type === "trim") {
      for (const p of f.parts.filter((x) => x.hardware)) {
        const name = p.item ?? "Pied réglable";
        add(name, p.per === "m" ? Math.max(...[0, 1, 2].map((i) => Math.abs(p.to[i]! - p.from[i]!))) / 1000 : 1);
        if (p.per === "m") units.set(name, "m");
      }
    } else if (f.type === "machining") {
      const holes = f.ops.filter((op) => op.kind === "hole").length;
      if (f.kind === "confirmat") screwHoles += holes;
      if (f.kind === "dowel") dowelHoles += holes;
      // One cam housing (Ø15) per connector.
      if (f.kind === "minifix") cams += f.ops.filter((op) => op.kind === "hole" && op.diameter >= 14).length;
    }
  }
  add(CONFIRMAT_SCREW, Math.floor(screwHoles / 2));
  add(DOWEL, Math.floor(dowelHoles / 2));
  add(MINIFIX_SET, cams);
  return catalogItems(doc, [...counts].map(([name, quantity]) => ({ name, quantity, ...(units.has(name) ? { unit: units.get(name) } : {}) })));
}

/**
 * Bodies that are bought, not cut (the rods of the penderies and their supports, handles, the aluminium frame and the
 * glass of a glazed door): out of the cut list.
 */
export function isHardwareBody(doc: CadDocument, bodyId: string): boolean {
  const [featureId, index] = bodyId.split("#");
  const f = doc.features.find((x) => x.id === featureId);
  if (index === undefined) return false;
  if (f?.type === "trim") return !!f.parts[Number(index)]?.hardware;
  if (f?.type === "fronts") {
    if (!isGlass(f) || f.layout === "drawers") return false;
    const cabinet = doc.features.find((c) => c.id === f.cabinet);
    const part = frontsParts(f, cabinet?.type === "cabinet" ? cabinet : undefined)[Number(index)];
    return part?.role?.kind === "door" || part?.of !== undefined;
  }
  if (f?.type !== "niche") return false;
  const role = nichePartsIn(doc.features, f)[Number(index)]?.role;
  return role === "hardware" || (role === "front" && (f.fill === "doors" || f.fill === "door") && isGlass(f));
}
