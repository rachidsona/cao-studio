/**
 * Les familles de corps du menu « Affichage » de la colonne Vue (porté de poly_3D) : façades, carcasse, fonds,
 * étagères, plinthes et socles, murs de la pièce, électroménager, le reste. Chaque corps est rangé d'après la
 * fonction qui l'a fait (façades, équipement de niche, finitions) puis d'après son nom (les pièces d'un caisson ou
 * d'une Répartition) et ce qu'on sait de lui (un corps de la pièce, le calque Électroménager). Pur.
 */
import { layersOf } from "./layers";
import { bodyInfo } from "./materials";
import { bodyLabel, bodyOrigin, findFeature } from "./operations";
import { featureOfBody, type CadDocument } from "./types";

export type Family = "fronts" | "carcass" | "backs" | "shelves" | "plinths" | "room" | "appliances" | "other";

export const FAMILIES: { id: Family; label: string }[] = [
  { id: "fronts", label: "Façades (portes, tiroirs)" },
  { id: "carcass", label: "Carcasse (côtés, dessus, dessous, cloisons)" },
  { id: "backs", label: "Fonds" },
  { id: "shelves", label: "Étagères" },
  { id: "plinths", label: "Plinthes, socles, pieds" },
  { id: "room", label: "Pièce (murs)" },
  { id: "appliances", label: "Électroménager" },
  { id: "other", label: "Autres corps" },
];

/** The families hidden by « Vue de travail »: the inside of the furniture, cleared of what is in front of it. */
export const WORK_VIEW_HIDDEN: Family[] = ["fronts", "room", "appliances"];

const BY_NAME: [RegExp, Family][] = [
  [/^(porte|tiroir|façade)/i, "fronts"],
  [/^(fond|panneau de fond)\b/i, "backs"],
  [/^étagère/i, "shelves"],
  [/^(plinthe|socle|pied)\b/i, "plinths"],
  [/^mur\b/i, "room"],
  [/^(hotte|conduit de hotte|four|lave-vaisselle|lave-linge|plaque de cuisson|réfrigérateur|micro-ondes|évier)\b/i, "appliances"],
  [/^(côté|dessus|dessous|cloison|joue|fileur|bandeau|panneau|crédence|plan de travail|séparation)/i, "carcass"],
];

/** The family of a body. */
export function bodyFamily(doc: CadDocument, bodyId: string): Family {
  const info = bodyInfo(doc, bodyId);
  if (info.room) return "room";
  if (info.layer && layersOf(doc).find((l) => l.id === info.layer)?.name === "Électroménager") return "appliances";
  const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  if (feature?.type === "fronts") return "fronts";
  if (feature?.type === "niche") return feature.fill === "back" ? "backs" : feature.fill === "rod" ? "other" : "fronts";
  // « Caisson 1 — Côté gauche », « Finitions — Plinthe » : the piece's own name, after its feature's.
  const label = bodyLabel(doc, bodyId).trim();
  const part = label.includes(" — ") ? label.slice(label.lastIndexOf(" — ") + 3) : label;
  if (feature?.type === "trim") return /^(plinthe|pied)/i.test(part) ? "plinths" : "carcass";
  return BY_NAME.find(([pattern]) => pattern.test(part))?.[1] ?? "other";
}

/** Which bodies to show, the hidden families taken out. */
export function visibleByFamily(doc: CadDocument, bodyIds: readonly string[], hidden: ReadonlySet<Family>): Map<string, boolean> {
  return new Map(bodyIds.map((id) => [id, !hidden.has(bodyFamily(doc, id))]));
}
