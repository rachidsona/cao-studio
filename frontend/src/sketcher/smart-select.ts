/**
 * Sélections intelligentes de l'esquisse : tout le dessin (Ctrl ou ⌘ + A), les éléments semblables à ceux choisis
 * (même sorte et même taille : tous les trous de Ø 5, toutes les lignes de 600, tous les arcs de rayon 10), la
 * chaîne entière des traits choisis (le contour qu'ils forment). Ni les axes, ni la géométrie projetée d'un corps. Pur.
 */
import type { SketchCurve, SketchGeometry } from "../document/sketch";
import { pointPos } from "./edit";
import { connectedChain } from "./offset";

/** Two sizes this close (mm) are the same. */
const SAME = 1e-3;

/** Every drawn curve (construction ones too), not the projected edges of a body. */
export function allCurves(g: SketchGeometry): string[] {
  return g.curves.filter((c) => !c.projected).map((c) => c.id);
}

/** What makes two curves alike: their kind, and their length or radius. */
function signature(g: SketchGeometry, c: SketchCurve): { kind: string; size: number; construction: boolean } {
  if (c.kind === "line") {
    const [a, b] = [pointPos(g, c.p1), pointPos(g, c.p2)];
    return { kind: "line", size: Math.hypot(b[0] - a[0], b[1] - a[1]), construction: !!c.construction };
  }
  return { kind: c.kind, size: c.radius, construction: !!c.construction };
}

/** The curves like the chosen ones (same kind, same size, drawn or construction alike), the chosen ones included. */
export function similarCurves(g: SketchGeometry, selection: ReadonlySet<string>): string[] {
  const chosen = g.curves.filter((c) => selection.has(c.id)).map((c) => signature(g, c));
  if (!chosen.length) return [];
  return g.curves
    .filter((c) => !c.projected)
    .filter((c) => {
      const s = signature(g, c);
      return chosen.some((k) => k.kind === s.kind && k.construction === s.construction && Math.abs(k.size - s.size) < SAME);
    })
    .map((c) => c.id);
}

/** The whole chains (contours) the chosen curves belong to. */
export function chainCurves(g: SketchGeometry, selection: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const c of g.curves) if (selection.has(c.id)) for (const id of connectedChain(g, c.id)) out.add(id);
  return [...out];
}
