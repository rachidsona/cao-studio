/**
 * Un meuble qu'on tourne autour de la verticale ne se pose pas dans un autre : là où sa boîte tournée entrerait dans
 * celle d'un voisin (une colonne, un mur), elle est remise au ras, du côté le plus proche (box-clear.ts, `clearGrown`).
 * Le décalage passe par le pivot : tourner autour d'un autre centre, c'est tourner puis glisser — une seule rotation,
 * une seule annulation. Ce que le meuble touchait déjà (la plinthe sous lui) ne le gêne pas. Géométrie pure.
 */
import type { Vec3 } from "../document/types";
import { CLEARANCE, clearGrown } from "./box-clear";
import type { Box } from "./smart-align";

/** The box of `box` turned by `degrees` around the vertical through `center` (its axis-aligned bounds). */
export function turnedBox(box: Box, degrees: number, center: Vec3): Box {
  const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  const corners = [box[0][0], box[1][0]].flatMap((x) => [box[0][1], box[1][1]].map((y) => [x - center[0], y - center[1]] as const));
  const turned = corners.map(([x, y]) => [center[0] + c * x - s * y, center[1] + s * x + c * y] as const);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return [
    [round(Math.min(...turned.map((p) => p[0]))), round(Math.min(...turned.map((p) => p[1]))), box[0][2]],
    [round(Math.max(...turned.map((p) => p[0]))), round(Math.max(...turned.map((p) => p[1]))), box[1][2]],
  ];
}

/**
 * The pivot to turn `box` by `degrees` around (the vertical through `center` otherwise) so that it lands clear of the
 * `others`, flush beside the nearest; `moved`: it had to. Null: no place clear within its own size (it stays as asked).
 */
export function clearPivot(box: Box, degrees: number, center: Vec3, others: readonly Box[]): { center: Vec3; moved: boolean } | null {
  const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  // A whole turn moves nothing: no pivot can shift it.
  const det = (1 - c) ** 2 + s ** 2;
  if (det < 1e-9) return { center, moved: false };
  const turned = turnedBox(box, degrees, center);
  const reach = Math.max(turned[1][0] - turned[0][0], turned[1][1] - turned[0][1]);
  const t = clearGrown(box, turned, others, [0, 1], CLEARANCE, reach);
  if (!t) return null;
  if (Math.abs(t[0]) < 1e-9 && Math.abs(t[1]) < 1e-9) return { center, moved: false };
  // Turning around center + d is turning around center then sliding by (I − R)·d: d = (I − R)⁻¹·t.
  const d = [((1 - c) * t[0] - s * t[1]) / det, (s * t[0] + (1 - c) * t[1]) / det];
  return { center: [center[0] + d[0]!, center[1] + d[1]!, center[2]], moved: true };
}
