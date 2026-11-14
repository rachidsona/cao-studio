/**
 * Profils de moulure prêts, à balayer le long d'une arête avec « Suivre-moi » (plinthe, corniche, baguette, couvre-joint) :
 * quart-de-rond, congé (creux), demi-rond, chanfrein, doucine (deux quarts de cercle tangents, en S). Chacun est un
 * contour fermé posé par son coin (son milieu pour le demi-rond), contraint et coté par sa taille. Pur.
 */
import type { SketchGeometry } from "../document/sketch";
import type { Vec2 } from "./edit";
import { builder } from "./shapes";

export type MouldingProfile = "quarterRound" | "cove" | "halfRound" | "chamfer" | "ogee";

/** The profile of size `r` (its radius, or its side) laid at `at`: its curves, and its size as a dimension to keep. */
export function addMouldingProfile(g: SketchGeometry, kind: MouldingProfile, r: number, at: Vec2): { geometry: SketchGeometry; created: string[]; size: object[] } {
  const b = builder(g, false);
  const [x, y] = at;
  const size: object[] = [];
  const q = Math.PI / 2;
  if (kind === "halfRound") {
    // A half circle on its flat side: from its right end round to its left end.
    const [c, right, left] = [b.point([x, y]), b.point([x + r, y]), b.point([x - r, y])];
    const base = b.line(left, right);
    const arc = b.arc(c, right, left, r, 0, Math.PI);
    b.constraint({ kind: "horizontal", line: base } as never);
    // Its centre on the base: both ends on the circle put it in the middle.
    b.constraint({ kind: "pointOnCurve", point: c, curve: base } as never);
    size.push({ kind: "radius", curve: arc, value: r });
    return { geometry: b.next, created: b.created, size };
  }
  const o = b.point([x, y]);
  const a = b.point([x + r, y]);
  const top = b.point([x, y + r]);
  const bottom = b.line(o, a);
  const side = b.line(top, o);
  b.constraint({ kind: "horizontal", line: bottom } as never);
  b.constraint({ kind: "vertical", line: side } as never);
  size.push({ kind: "length", line: bottom, value: r });
  if (kind === "chamfer") {
    b.line(a, top);
    b.constraint({ kind: "equal", a: bottom, b: side } as never);
  } else if (kind === "quarterRound") {
    // Convex: about the corner itself.
    b.arc(o, a, top, r, 0, q);
  } else if (kind === "cove") {
    // Hollow: about the corner across the square.
    const c = b.point([x + r, y + r]);
    const hollow = b.arc(c, top, a, r, Math.PI, Math.PI + q);
    b.constraint({ kind: "equal", a: bottom, b: side } as never);
    size.push({ kind: "radius", curve: hollow, value: r });
  } else {
    // Ogee: a quarter convex at the bottom, a quarter hollow at the top, tangent in the middle.
    const m = b.point([x + r / 2, y + r / 2]);
    const c1 = b.point([x + r / 2, y]);
    const c2 = b.point([x + r / 2, y + r]);
    const low = b.arc(c1, a, m, r / 2, 0, q);
    const high = b.arc(c2, top, m, r / 2, Math.PI, Math.PI + q);
    b.constraint({ kind: "equal", a: bottom, b: side } as never);
    b.constraint({ kind: "pointOnCurve", point: c1, curve: bottom } as never);
    b.constraint({ kind: "equal", a: low, b: high } as never);
    // Tangent at the middle: both centres in line with it, one above the other.
    const axis = b.line(c1, c2, { construction: true });
    b.constraint({ kind: "vertical", line: axis } as never);
    b.constraint({ kind: "pointOnCurve", point: m, curve: axis } as never);
  }
  return { geometry: b.next, created: b.created, size };
}
