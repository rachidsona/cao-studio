/**
 * Quincaillerie du modèle, pour le devis : charnières, coulisses et poignées des façades, tringles et supports des
 * penderies, coulisses et poignées des tiroirs de niche, accessoires intérieurs à leur prix du catalogue, vis confirmat, tourillons et excentriques
 * des usinages (chacun fait un trou dans chacune des deux planches qu'il assemble) ; le verre trempé (au m²) et le
 * profilé alu (au mètre) des portes vitrées, qui s'achètent au lieu de se scier ; les compas d'une porte relevable
 * (choisis d'après son poids et sa hauteur) ou d'un abattant, le profil gorge des façades sans poignée, et les ferrures
 * de jonction des plans de travail (deux par joint, document/worktop-bars.ts).
 */
import { autoJointHoles } from "../features/cabinet-joints";
import { frontsHardware, frontsParts, hingeCount, hingesFor, swingsUp } from "../features/fronts-parts";
import { isGlass, woodFrame } from "../features/glass-door";
import { nicheHardware, nichePartsIn } from "../features/niche-parts";
import { partMass } from "../features/stability";
import { catalogItems } from "./hardware-catalog";
import { bodyInfo } from "./materials";
import type { CadDocument, Feature, FrontsFeature } from "./types";
import { WORKTOP_FITTING, worktopBars } from "./worktop-bars";

export const CONFIRMAT_SCREW = "Vis confirmat 7 × 50";
export const DOWEL = "Tourillon Ø8 × 30";
export const MINIFIX_SET = "Excentrique Minifix 15 + tige";

export function modelHardware(doc: CadDocument): { name: string; quantity: number; unit?: string; price?: number }[] {
  const counts = new Map<string, number>();
  const units = new Map<string, string>();
  const prices = new Map<string, number>();
  const add = (name: string, quantity: number) => quantity > 0 && counts.set(name, Math.round(((counts.get(name) ?? 0) + quantity) * 100) / 100);
  let screwHoles = 0;
  let dowelHoles = 0;
  let cams = 0;
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "fronts") {
      const cabinet = doc.features.find((c) => c.id === f.cabinet);
      for (const h of frontsHardware(f, cabinet?.type === "cabinet" ? cabinet : undefined, (part) => frontMass(doc, f, part))) {
        add(h.name, h.quantity);
        if (h.unit) units.set(h.name, h.unit);
      }
    } else if (f.type === "niche") {
      for (const h of nicheHardware(doc.features, f)) {
        add(h.name, h.quantity);
        if (h.unit) units.set(h.name, h.unit);
        if (h.price !== undefined) prices.set(h.name, h.price);
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
  // The joints the standards drill by themselves (features/cabinet-joints.ts).
  const auto = autoJointHoles(doc);
  [screwHoles, dowelHoles, cams] = [screwHoles + auto.confirmat, dowelHoles + auto.dowel, cams + auto.cams];
  add(CONFIRMAT_SCREW, Math.floor(screwHoles / 2));
  add(DOWEL, Math.floor(dowelHoles / 2));
  add(MINIFIX_SET, cams);
  // The worktops' joints: two fittings each.
  add(WORKTOP_FITTING, worktopBars(doc).fittings);
  return catalogItems(doc, [...counts].map(([name, quantity]) => ({ name, quantity, ...(units.has(name) ? { unit: units.get(name) } : {}), ...(prices.has(name) ? { price: prices.get(name) } : {}) })));
}

/** The weight of a part of some fronts (kg), from its size and its material. */
export function frontMass(doc: CadDocument, f: FrontsFeature, part: number): number {
  const cabinet = doc.features.find((c) => c.id === f.cabinet);
  const p = frontsParts(f, cabinet?.type === "cabinet" ? cabinet : undefined)[part];
  return p ? partMass([0, 1, 2].reduce((v, i) => v * Math.abs(p.to[i]! - p.from[i]!), 1), bodyInfo(doc, `${f.id}#${part}`).material) : 0;
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
    if (f.grip !== "gorge" && !isGlass(f)) return false;
    const cabinet = doc.features.find((c) => c.id === f.cabinet);
    const part = frontsParts(f, cabinet?.type === "cabinet" ? cabinet : undefined)[Number(index)];
    // A gorge profile; the aluminium frame and the glass of a glazed door.
    // A wooden frame is the door itself, cut from the board: only its glass is bought.
    return !!part?.gorge || (isGlass(f) && (((part?.role?.kind === "door" || part?.role?.kind === "drawer") && !woodFrame(f)) || part?.of !== undefined));
  }
  if (f?.type !== "niche") return false;
  const role = nichePartsIn(doc.features, f)[Number(index)]?.role;
  return role === "hardware" || (role === "front" && (f.fill === "doors" || f.fill === "door" || (f.fill === "drawers" && !f.inner)) && isGlass(f) && !woodFrame(f));
}

/**
 * The document the kernel builds: each door of a cabinet heavier than its height asks for carries the number of hinges
 * its weight needs (`hingeCounts`, by part), so its cups are drilled as the quote counts them.
 */
export function stampHinges(doc: CadDocument): CadDocument {
  let changed = false;
  const features = doc.features.map((f): Feature => {
    if (f.type !== "fronts") return f;
    const counts: Record<number, number> = {};
    if (f.hinges && f.layout !== "drawers" && !f.suppressed) {
      const cabinet = doc.features.find((c) => c.id === f.cabinet);
      const up = swingsUp(f);
      frontsParts(f, cabinet?.type === "cabinet" ? cabinet : undefined).forEach((p, i) => {
        if (p.role?.kind !== "door") return;
        const height = up ? p.to[0] - p.from[0] : p.to[2] - p.from[2];
        const n = hingesFor(height, frontMass(doc, f, i));
        if (n > hingeCount(height)) counts[i] = n;
      });
    }
    if (!Object.keys(counts).length && !f.hingeCounts) return f;
    changed = true;
    const { hingeCounts: _old, ...rest } = f;
    return Object.keys(counts).length ? { ...rest, hingeCounts: counts } : rest;
  });
  return changed ? { ...doc, features } : doc;
}
