/**
 * Materials of the boards (cabinet making): what each body is cut from, the
 * direction of its grain and the edges that get an edge band. Stored per body
 * in the document (`bodyInfo`, kept with the feature that created the body,
 * like its name); read by the cut list, the sheet layout and the view's
 * colours.
 */
import { bodyOrigin } from "./operations";
import type { BodyInfo, CadDocument } from "./types";

export interface Material {
  id: string;
  name: string;
  /** Colour in the view (hex). */
  color: string;
  /** Wood shows a grain in the realistic view; plain is uniform. */
  look: "wood" | "plain";
  /** Standard sheet the boards are cut from (mm), for the sheet layout. */
  sheet: [number, number];
  /**
   * What it is (as OpenCutList's material types): a manufactured panel (sawn to size), solid wood (sawn oversize then
   * planed: `oversize` is added to the length and the width of each part), or a thin backing panel.
   */
  kind: "panel" | "solid" | "backing";
  /** Allowance added to the length and width of a solid wood part before planing (mm). */
  oversize?: [number, number];
}

export const MATERIALS: Material[] = [
  { id: "melamine-white", name: "Mélaminé blanc", color: "#f3f4f6", look: "plain", sheet: [2800, 2070], kind: "panel" },
  { id: "melamine-oak", name: "Mélaminé chêne", color: "#c9a26b", look: "wood", sheet: [2800, 2070], kind: "panel" },
  { id: "melamine-walnut", name: "Mélaminé noyer", color: "#7a5236", look: "wood", sheet: [2800, 2070], kind: "panel" },
  { id: "melamine-anthracite", name: "Mélaminé anthracite", color: "#3f4448", look: "plain", sheet: [2800, 2070], kind: "panel" },
  { id: "mdf", name: "MDF brut", color: "#b8916a", look: "plain", sheet: [2440, 1220], kind: "panel" },
  { id: "lacquer-white", name: "MDF laqué blanc", color: "#fafafa", look: "plain", sheet: [2440, 1220], kind: "panel" },
  { id: "birch-plywood", name: "Contreplaqué bouleau", color: "#e2c99b", look: "wood", sheet: [2500, 1250], kind: "panel" },
  { id: "solid-oak", name: "Chêne massif", color: "#b98a52", look: "wood", sheet: [2500, 1250], kind: "solid", oversize: [20, 10] },
  { id: "hdf", name: "Panneau de fond (HDF)", color: "#d9c3a0", look: "plain", sheet: [2800, 2070], kind: "backing" },
];

export const EDGE_BANDS = [0.4, 0.8, 1, 2];

export function materialById(id: string | undefined): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}

/** What is known of a body: its material, grain and edge bands (empty when nothing was set). */
export function bodyInfo(doc: CadDocument, bodyId: string): BodyInfo {
  return doc.bodyInfo?.[bodyOrigin(doc, bodyId)] ?? {};
}

/** Sets part of what is known of these bodies (kept with the features that created them). */
export function setBodyInfo(doc: CadDocument, bodyIds: string[], patch: Partial<BodyInfo>): CadDocument {
  const info = { ...doc.bodyInfo };
  for (const id of bodyIds) {
    const origin = bodyOrigin(doc, id);
    info[origin] = { ...info[origin], ...patch };
  }
  return { ...doc, bodyInfo: info };
}
