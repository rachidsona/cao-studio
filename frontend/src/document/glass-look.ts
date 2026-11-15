/**
 * L'apparence d'une porte vitrée, tirée de ses réglages : son verre celle du verre choisi (clair, extra-clair, dépoli,
 * fumé, bronze), son cadre l'aluminium brossé ou noir. Elle vaut tant qu'on n'a pas donné au corps une apparence à
 * soi (appearance/assign.ts), et suit un changement de verre ou de cadre sans rien écrire dans le document. De même
 * pour un accessoire intérieur : chromé, son miroir en miroir, ses bacs en plastique gris (accessory-parts.ts). Pur.
 */
import { accessoryLook } from "../features/accessory-parts";
import { frontsParts } from "../features/fronts-parts";
import { GLASS_APPEARANCE, PROFILE_APPEARANCE, isGlass } from "../features/glass-door";
import { nichePartsIn } from "../features/niche-parts";
import { bodyOrigin } from "./operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type Feature } from "./types";

/** The looks of a glazed feature's parts, by part number; kept as long as the feature (and its document) are. */
const cache = new WeakMap<Feature, { features: readonly Feature[]; looks: (string | undefined)[] }>();

function looksOf(doc: CadDocument, f: Feature): (string | undefined)[] {
  const kept = cache.get(f);
  if (kept && kept.features === doc.features) return kept.looks;
  let looks: (string | undefined)[] = [];
  if (f.type === "niche" && f.fill === "accessory") {
    looks = nichePartsIn(doc.features, f).map(accessoryLook);
  } else if (f.type === "niche" && (f.fill === "doors" || f.fill === "door" || (f.fill === "drawers" && !f.inner)) && isGlass(f)) {
    looks = nichePartsIn(doc.features, f).map((p) => (p.role === "front" ? PROFILE_APPEARANCE[f.profile ?? "brushed"] : p.kind === "box" && p.of !== undefined ? GLASS_APPEARANCE[f.glass ?? "clear"] : undefined));
  } else if (f.type === "fronts" && ((f.layout !== "drawers" && isGlass(f)) || f.grip === "gorge")) {
    const cabinet = doc.features.find((c): c is CabinetFeature => c.id === f.cabinet && c.type === "cabinet");
    const glazed = f.layout !== "drawers" && isGlass(f);
    // A gorge profile is brushed aluminium.
    looks = frontsParts(f, cabinet).map((p) => (p.gorge ? PROFILE_APPEARANCE.brushed : !glazed ? undefined : p.role?.kind === "door" ? PROFILE_APPEARANCE[f.profile ?? "brushed"] : p.of !== undefined ? GLASS_APPEARANCE[f.glass ?? "clear"] : undefined));
  }
  cache.set(f, { features: doc.features, looks });
  return looks;
}

/** The appearance a body of a glazed door takes from its door (its glass or its aluminium frame), or undefined. */
export function glassDoorLook(doc: CadDocument, bodyId: string): string | undefined {
  const id = bodyOrigin(doc, bodyId);
  if (!id.includes("#")) return undefined;
  const f = doc.features.find((x) => x.id === featureOfBody(id));
  if (!f || (f.type !== "niche" && f.type !== "fronts") || !(isGlass(f) || (f.type === "niche" && f.fill === "accessory") || (f.type === "fronts" && f.grip === "gorge"))) return undefined;
  return looksOf(doc, f)[Number(id.slice(id.indexOf("#") + 1))];
}
