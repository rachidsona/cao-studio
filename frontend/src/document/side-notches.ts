/**
 * Les entailles de gorge d'un côté de caisson, pour la fabrication : un côté dont les façades sont sans poignée est
 * entaillé à l'avant à chaque profilé (features/fronts-parts.ts gorgeNotches). Le noyau les creuse, la mise à plat
 * (DXF, G-code, fiches) les voit dans le contour ; la liste de débit et les fiches les disent en clair : combien, de
 * quelle taille, à quelle hauteur depuis le bas du côté. Pur.
 */
import { gorgeNotches } from "../features/fronts-parts";
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, PART_SEPARATOR, type CabinetNotch } from "./types";
import type { CadDocument } from "./types";

/** The two sides are the first bodies of a cabinet (features/cabinet-parts.ts). */
const SIDES = new Set([0, 1]);

/** The notches of this body, if it is a side of a cabinet with handleless fronts, from the bottom of the side. */
export function sideNotches(doc: CadDocument, bodyId: string): CabinetNotch[] {
  const origin = bodyOrigin(doc, bodyId);
  const cabinet = findFeature(doc, featureOfBody(origin));
  const index = Number(origin.split(PART_SEPARATOR)[1]);
  if (cabinet?.type !== "cabinet" || !SIDES.has(index)) return [];
  // The sides start on the floor (sides through), else on the bottom board.
  const bottom = cabinet.construction === "sides-through" ? 0 : cabinet.plinth + cabinet.thickness;
  return doc.features
    .flatMap((f) => (f.type === "fronts" && f.cabinet === cabinet.id ? gorgeNotches(f, cabinet) : []))
    .map((n) => ({ z0: n.z0 - bottom, z1: n.z1 - bottom, depth: n.depth }))
    .sort((a, b) => a.z0 - b.z0);
}

const FRENCH = (mm: number) => (Math.round(mm * 10) / 10).toLocaleString("fr-FR");

/**
 * « 3 entailles 57 × 26 mm à l'avant (profil gorge), leur bas à 328 ; 561,5 ; 795 mm du bas du côté » — empty without
 * notches. `num` writes a length in the unit `unit` names.
 */
export function notchText(notches: readonly CabinetNotch[], num: (mm: number) => string = FRENCH, unit = "mm"): string {
  if (!notches.length) return "";
  const [first] = notches;
  const size = `${num(first!.z1 - first!.z0)} × ${num(first!.depth)} ${unit}`;
  const heights = notches.map((n) => num(n.z0)).join(" ; ");
  return `${notches.length} entaille${notches.length > 1 ? "s" : ""} ${size} à l'avant (profil gorge), leur bas à ${heights} ${unit} du bas du côté`;
}
