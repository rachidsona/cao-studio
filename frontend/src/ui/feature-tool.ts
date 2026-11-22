/**
 * L'outil qui a fait une étape, pour l'historique : un prolongement (« Prolonger élément ») est une extrusion de faces,
 * des côtés séparés un corps vidé — l'historique montre l'icône et le nom de l'outil utilisé, pas ceux de l'opération.
 * Marqué sur l'étape (`tool`) quand l'outil la fait, reconnu sur celles d'avant.
 */
import type { Feature } from "../document/types";

/** The tools an operation may come from: their name and their icon (the ribbon's). */
const TOOLS: Record<string, { label: string; sprite: string }> = {
  "extend-element": { label: "Prolonger élément", sprite: "i-extend-element" },
  "split-sides": { label: "Séparer les côtés", sprite: "i-split-sides" },
};

/** The tool that made this step, or null: the operation's own. */
export function toolOf(feature: Feature): { label: string; sprite: string } | null {
  const marked = (feature as { tool?: string }).tool;
  if (marked && TOOLS[marked]) return TOOLS[marked]!;
  // Steps made before the mark: a face pulled up to (or by) a measure named so, a body split into its sides.
  if (feature.type === "extrude" && feature.faces && /^(Prolongement|Raccourci)( \d+)?$/.test(feature.name)) return TOOLS["extend-element"]!;
  if (feature.type === "shell" && feature.sides === "separate" && (feature.frame === true || feature.thickness === 0) && !feature.back && !feature.faces.length) return TOOLS["split-sides"]!;
  return null;
}
