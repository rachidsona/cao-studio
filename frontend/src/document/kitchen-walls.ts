/**
 * Les murs d'un Plan de cuisine montrés ou cachés (case « Murs de la pièce » du plan) : ceux de la pièce relevée à
 * laquelle il est posé — cachés sans être supprimés, remis même s'ils l'avaient été —, ou ceux que le plan dessine
 * derrière ses linéaires quand il n'a pas de pièce. Pur.
 */
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { findFeature } from "./operations";
import type { CadDocument } from "./types";

/** The bodies of the room's walls the plan stands in, or null when it has none (it draws its own). */
function roomWalls(doc: CadDocument, planId: string): string[] | null {
  const room = kitchenPlanIn(doc, planId)?.room;
  const feature = room ? findFeature(doc, room.id) : undefined;
  return feature?.type === "room" ? feature.walls.map((_, k) => `${feature.id}#${k}`) : null;
}

/** Whether the plan's walls are seen. */
export function kitchenWallsShown(doc: CadDocument, planId: string): boolean {
  const walls = roomWalls(doc, planId);
  if (!walls) return kitchenPlanIn(doc, planId)?.noWalls !== true;
  const gone = new Set([...(doc.hiddenBodies ?? []), ...(doc.removedBodies ?? [])]);
  return walls.some((id) => !gone.has(id));
}

/** The plan's walls shown (`on`) or hidden; or why not. */
export function withKitchenWalls(doc: CadDocument, planId: string, on: boolean): CadDocument | string {
  const walls = roomWalls(doc, planId);
  if (!walls) {
    const built = withKitchenBuilt(doc, planId, { noWalls: !on });
    return typeof built === "string" ? built : built.doc;
  }
  const mine = new Set(walls);
  const hidden = (doc.hiddenBodies ?? []).filter((id) => !mine.has(id));
  const removed = (doc.removedBodies ?? []).filter((id) => !mine.has(id));
  return { ...doc, hiddenBodies: on ? hidden : [...hidden, ...walls], removedBodies: removed };
}
