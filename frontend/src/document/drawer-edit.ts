/**
 * Des tiroirs, pris par une de leurs pièces (une façade, un côté de caisson, une poignée) : ce qu'ils sont et ce qu'on peut
 * y changer, pour le menu du clic droit (app/drawer-menu.ts). Les tiroirs d'un caisson (ses façades « tiroirs ») se
 * règlent ici — nombre, pose, jeu, épaisseur, poignées —, se changent en porte ou se retirent ; ceux d'une niche de
 * Répartition se rouvrent dans leur outil. Pur.
 */
import { frontsProblem } from "../features/fronts-parts";
import { bodyOrigin, deleteFeatures, findFeature, updateFeature } from "./operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type FrontsFeature } from "./types";

export interface DrawersInfo {
  /** The fronts of a cabinet, or the drawers equipping a niche of a Répartition. */
  kind: "fronts" | "niche";
  feature: string;
}

/** The drawers a body is part of, or null. */
export function drawersOf(doc: CadDocument, bodyId: string): DrawersInfo | null {
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  if (f?.type === "fronts" && f.layout === "drawers") return { kind: "fronts", feature: f.id };
  if (f?.type === "niche" && f.fill === "drawers") return { kind: "niche", feature: f.id };
  return null;
}

export type DrawersPatch = Partial<Pick<FrontsFeature, "drawers" | "mount" | "gap" | "thickness" | "handles">>;

/** A cabinet's drawers changed; a string: why they cannot be. */
export function withDrawersChanged(doc: CadDocument, featureId: string, patch: DrawersPatch): CadDocument | string {
  const f = findFeature(doc, featureId);
  if (f?.type !== "fronts" || f.layout !== "drawers") return "Ces tiroirs n'existent plus.";
  const next: FrontsFeature = { ...f, ...patch };
  const problem = frontsProblem(next, findFeature(doc, f.cabinet) as CabinetFeature | undefined);
  return problem ?? updateFeature(doc, f.id, () => next);
}

/** A cabinet's drawers made a door (two over 60 cm). */
export function withDrawersAsDoor(doc: CadDocument, featureId: string): CadDocument | string {
  const f = findFeature(doc, featureId);
  if (f?.type !== "fronts") return "Ces tiroirs n'existent plus.";
  const width = (findFeature(doc, f.cabinet) as CabinetFeature | undefined)?.width ?? 0;
  return updateFeature(doc, f.id, () => ({ ...f, layout: width > 600 ? ("doors" as const) : ("door" as const) }));
}

/** The drawers taken off (undo brings them back). */
export const withDrawersRemoved = (doc: CadDocument, featureId: string): CadDocument => deleteFeatures(doc, [featureId]).next;
