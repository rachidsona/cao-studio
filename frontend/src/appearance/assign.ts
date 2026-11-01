/**
 * L'apparence de chaque corps : celle qu'on lui a donnée (bibliothèque, et sa couleur pour une laque ou une peinture),
 * sinon celle de sa matière d'atelier, sinon aucune ; une face peut avoir la sienne (face-looks.ts). Gardée avec la matière dans `bodyInfo` (annulable comme toute
 * modification), elle ne change ni la liste de débit ni le devis.
 */
import { bodyInfo, setBodyInfo } from "../document/materials";
import type { BodyInfo, CadDocument, FaceLook } from "../document/types";
import { syncCustom } from "./custom";
import { faceLooks, type FaceMark } from "./face-looks";
import { MATERIAL_APPEARANCE, WALL_APPEARANCE, appearanceById, type Appearance } from "./library";

export interface BodyAppearance {
  appearance: Appearance;
  /** Colour chosen for a paintable appearance (sRGB hex). */
  color?: string;
  /** Axis the motif's u (the wood grain) runs along: the board's length or width. */
  grainAxis: 0 | 1 | 2;
  /**
   * Where the motif starts on this board (a share of a tile along u and v): each board its own, as boards cut from
   * different places of a sheet or of a tree; the same board keeps it across regenerations.
   */
  shift?: [number, number];
  /** A light (document/lighting.ts): the side it lights in the render. */
  emit?: "down" | "up";
}

/** A stable start of the motif for a body, from its id: two shares of a tile in 0…1. */
export function motifShift(bodyId: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < bodyId.length; i++) h = Math.imul(h ^ bodyId.charCodeAt(i), 16777619);
  return [((h >>> 0) % 997) / 997, ((Math.imul(h, 2654435761) >>> 0) % 991) / 991];
}

export const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

/** How a body looks, from its box (min, max corners); null when it has neither appearance nor material. */
export function bodyAppearance(doc: CadDocument, bodyId: string, box: [number[], number[]] | undefined): BodyAppearance | null {
  syncCustom(doc);
  const info = bodyInfo(doc, bodyId);
  const appearance = appearanceById(info.appearance) ?? appearanceById(MATERIAL_APPEARANCE[info.material ?? ""]) ?? (info.room ? WALL_APPEARANCE : undefined);
  if (!appearance) return null;
  return { appearance, color: appearance.paintable && isColor(info.color) ? info.color : undefined, grainAxis: grainAxis(info, box), shift: motifShift(bodyId), ...(info.light ? { emit: info.light.up ? "up" : "down" } : {}) };
}

/** The grain runs along the board's length (its longest side), or its width when chosen so. */
function grainAxis(info: BodyInfo, box: [number[], number[]] | undefined): 0 | 1 | 2 {
  const size = (axis: number) => (box ? (box[1][axis] ?? 0) - (box[0][axis] ?? 0) : 0);
  const order = [0, 1, 2].sort((a, b) => size(b) - size(a));
  return (info.grain === "width" ? order[1] : order[0]) as 0 | 1 | 2;
}

/** A face with a motif of its own: which face (found again on each regeneration) and how it looks. */
export interface FaceAppearance {
  mark: FaceMark;
  look: BodyAppearance;
}

/** The faces of a body that have a motif of their own, with their look. */
export function faceAppearances(doc: CadDocument, bodyId: string, box: [number[], number[]] | undefined): FaceAppearance[] {
  return faceLooks(doc, bodyId).flatMap((f) => {
    const look = faceAppearance(doc, bodyId, f, box);
    return look ? [{ mark: { normal: f.normal, rel: f.rel }, look }] : [];
  });
}

/** How a face with a motif of its own looks (its grain along its body's), or null for an unknown appearance. */
export function faceAppearance(doc: CadDocument, bodyId: string, face: FaceLook, box: [number[], number[]] | undefined): BodyAppearance | null {
  syncCustom(doc);
  const appearance = appearanceById(face.appearance);
  if (!appearance) return null;
  return { appearance, color: appearance.paintable && isColor(face.color) ? face.color : undefined, grainAxis: grainAxis(bodyInfo(doc, bodyId), box) };
}

/**
 * Gives these bodies an appearance (null: back to their material's), with a colour for a paintable one. The whole body
 * takes it: the motifs of its faces go.
 */
export function setBodyAppearance(doc: CadDocument, bodyIds: string[], appearanceId: string | null, color?: string): CadDocument {
  syncCustom(doc);
  const appearance = appearanceById(appearanceId ?? undefined);
  return setBodyInfo(doc, bodyIds, { appearance: appearance?.id, color: appearance?.paintable && isColor(color) ? color : undefined, faces: undefined });
}
