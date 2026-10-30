/**
 * A drawer pulled out in the view (a click opens it, another closes it): which bodies are the same drawer — its
 * front and its box, « Façade tiroir 2 », « Tiroir 2 — côté gauche »… — and how far and which way it slides, from
 * where its front stands against its back. Pure.
 */
import type { Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

/** The number of the drawer a body belongs to, by its name (null: not a piece of a drawer). */
export function drawerNumber(label: string): number | null {
  const all = [...label.matchAll(/\btiroir (\d+)/gi)];
  const last = all.at(-1);
  return last ? Number(last[1]) : null;
}

const center = (b: Box) => [0, 1, 2].map((i) => (b[0][i]! + b[1][i]!) / 2) as Vec3;

/**
 * The slide of a drawer: along the axis from its back to its front, out by most of its depth (the slides keep
 * a part of it in the cabinet).
 */
export function drawerSlide(front: Box, back: Box, reach = 0.8): Vec3 {
  const [f, b] = [center(front), center(back)];
  const d = [f[0] - b[0], f[1] - b[1], f[2] - b[2]];
  const axis = [0, 1, 2].reduce((best, i) => (Math.abs(d[i]!) > Math.abs(d[best]!) ? i : best), 0);
  const out: Vec3 = [0, 0, 0];
  out[axis] = d[axis]! * reach;
  return out;
}
