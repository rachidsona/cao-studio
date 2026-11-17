/**
 * Ce dans quoi un caisson ne doit pas entrer, lu dans le document : les murs des Pièces relevées — et tout ce qui est
 * derrière eux : un caisson ne traverse pas un mur, il reste du côté d'où il vient — et les autres caissons. Sert aux
 * gestes de la vue (la poignée « ✥ », Coller, Déplacer) et aux cotes changées à la main (la barre du caisson, l'outil
 * Caisson) : un caisson agrandi contre un mur ou un voisin est décalé d'autant, au ras ; sans place, la cote est
 * refusée avec sa raison. Un mur hors d'équerre garde sa boîte seule (pas de profondeur derrière lui). Pur.
 */
import { cabinetBox } from "./kitchen-catalog";
import { planRooms } from "./plan-room";
import type { CabinetFeature, CadDocument, Vec3 } from "./types";
import { clearGrown } from "../features/box-clear";
import { wallFrames, wallName } from "../features/room-plan";
import type { Box } from "../features/smart-align";

/** Behind a wall, as far as anything goes (mm). */
const DEEP = 1e6;

/** The walls square to the axes of every surveyed room, each with all that lies behind it, and their names. */
export function wallKeepOuts(doc: CadDocument): { box: Box; name: string }[] {
  return planRooms(doc).flatMap((room) =>
    wallFrames(room).flatMap((f, i) => {
      const square = [0, 1].find((k) => Math.abs(f.n[k]!) > 1 - 1e-6);
      if (square === undefined) return [];
      const axis = square as 0 | 1;
      const lo: Vec3 = [Math.min(...f.outline.map((p) => p[0])), Math.min(...f.outline.map((p) => p[1])), 0];
      const hi: Vec3 = [Math.max(...f.outline.map((p) => p[0])), Math.max(...f.outline.map((p) => p[1])), room.height];
      // Outwards (away from the room): as deep as it gets.
      if (f.n[axis] > 0) hi[axis] = hi[axis] + DEEP;
      else lo[axis] = lo[axis] - DEEP;
      return [{ box: [lo, hi] as Box, name: `le ${wallName(i)}` }];
    }),
  );
}

/** The walls (and beyond) as boxes, for a move in the view (features/box-clear.ts). */
export const roomKeepOuts = (doc: CadDocument): Box[] => wallKeepOuts(doc).map((w) => w.box);

/**
 * A cabinet whose sizes changed by hand, kept out of the walls and of the other cabinets: as asked when it stands in
 * nothing new; slid along the floor by what it took, flush, when there is room; a string: why this size cannot be.
 */
export function cabinetKeptClear(doc: CadDocument, next: CabinetFeature): CabinetFeature | string {
  const before = doc.features.find((f): f is CabinetFeature => f.id === next.id && f.type === "cabinet");
  if (!before) return next;
  const walls = wallKeepOuts(doc);
  const cabinets = doc.features.filter((f): f is CabinetFeature => f.type === "cabinet" && f.id !== next.id && !f.suppressed && !f.hidden);
  const others = [...walls.map((w) => w.box), ...cabinets.map(cabinetBox)];
  const [was, now] = [cabinetBox(before), cabinetBox(next)];
  const shift = clearGrown(was, now, others, [0, 1]);
  if (shift) return shift.some((v) => v !== 0) ? { ...next, origin: next.origin.map((v, i) => v + shift[i]!) as Vec3 } : next;
  const overlaps = (o: Box) => [0, 1, 2].every((i) => now[0][i]! < o[1][i]! - 1 && now[1][i]! > o[0][i]! + 1);
  const into = walls.find((w) => overlaps(w.box))?.name ?? `« ${cabinets.find((c) => overlaps(cabinetBox(c)))?.name ?? "un meuble voisin"} »`;
  return `${next.name} : à cette cote, il entrerait dans ${into}, et il n'y a pas la place de le décaler.`;
}
