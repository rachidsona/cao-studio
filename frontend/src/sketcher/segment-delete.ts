/**
 * Suppr on a line clicked where other curves cross it removes only the piece clicked, between two crossings (as in
 * Shapr3D): the end of a vertical line that pokes through a horizontal one goes, the rest stays. A curve selected
 * otherwise (by window, by a shape, or that nothing crosses) is removed whole, as before.
 */
import type { SketchGeometry } from "../document/sketch";
import { findCurve, removeEntities, type Vec2 } from "./edit";
import { applyTrim, findTrim, type Trim } from "./trim";

/** The piece of this curve between the crossings around the point clicked, or null when the whole curve would go. */
function pieceAt(g: SketchGeometry, id: string, at: Vec2 | undefined): Trim | null {
  const curve = at ? findCurve(g, id) : undefined;
  // Projected body edges are references: they go whole.
  if (!at || !curve || curve.projected) return null;
  const trim = findTrim(g, id, at);
  return trim && typeof trim === "object" && !trim.whole ? trim : null;
}

/** The piece Suppr would remove, shown while a single clicked line is selected. */
export function clickedPiece(g: SketchGeometry, selection: Set<string>, clickedAt: Map<string, Vec2>): Trim | null {
  if (selection.size !== 1) return null;
  const [id] = selection;
  return pieceAt(g, id!, clickedAt.get(id!));
}

/** Removes the selection: the clicked piece of a crossed line, else the whole element. */
export function deleteWithPieces(g: SketchGeometry, ids: string[], clickedAt: Map<string, Vec2>): { geometry: SketchGeometry; pieces: number } {
  let geometry = g;
  let pieces = 0;
  const whole: string[] = [];
  for (const id of ids) {
    const piece = findCurve(geometry, id) ? pieceAt(geometry, id, clickedAt.get(id)) : null;
    if (piece) {
      geometry = applyTrim(geometry, piece);
      pieces++;
    } else whole.push(id);
  }
  return { geometry: whole.length ? removeEntities(geometry, whole) : geometry, pieces };
}
