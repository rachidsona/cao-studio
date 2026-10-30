/**
 * L'apparence de chaque corps : celle qu'on lui a donnée (bibliothèque, et sa couleur pour une laque ou une peinture),
 * sinon celle de sa matière d'atelier, sinon aucune. Gardée avec la matière dans `bodyInfo` (annulable comme toute
 * modification), elle ne change ni la liste de débit ni le devis.
 */
import { bodyInfo, setBodyInfo } from "../document/materials";
import type { CadDocument } from "../document/types";
import { MATERIAL_APPEARANCE, WALL_APPEARANCE, appearanceById, type Appearance } from "./library";

export interface BodyAppearance {
  appearance: Appearance;
  /** Colour chosen for a paintable appearance (sRGB hex). */
  color?: string;
  /** Axis the motif's u (the wood grain) runs along: the board's length or width. */
  grainAxis: 0 | 1 | 2;
}

export const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** How a body looks, from its box (min, max corners); null when it has neither appearance nor material. */
export function bodyAppearance(doc: CadDocument, bodyId: string, box: [number[], number[]] | undefined): BodyAppearance | null {
  const info = bodyInfo(doc, bodyId);
  const appearance = appearanceById(info.appearance) ?? appearanceById(MATERIAL_APPEARANCE[info.material ?? ""]) ?? (info.room ? WALL_APPEARANCE : undefined);
  if (!appearance) return null;
  const size = (axis: number) => (box ? (box[1][axis] ?? 0) - (box[0][axis] ?? 0) : 0);
  const order = [0, 1, 2].sort((a, b) => size(b) - size(a));
  const grainAxis = (info.grain === "width" ? order[1] : order[0]) as 0 | 1 | 2;
  return { appearance, color: appearance.paintable && isColor(info.color) ? info.color : undefined, grainAxis };
}

/** Gives these bodies an appearance (null: back to their material's), with a colour for a paintable one. */
export function setBodyAppearance(doc: CadDocument, bodyIds: string[], appearanceId: string | null, color?: string): CadDocument {
  const appearance = appearanceById(appearanceId ?? undefined);
  return setBodyInfo(doc, bodyIds, { appearance: appearance?.id, color: appearance?.paintable && isColor(color) ? color : undefined });
}
