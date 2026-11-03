/**
 * Arêtes cachées (comme Curic Hidden) : là où deux pièces se rejoignent à fleur — deux planches côte à côte, une
 * planche posée sur une autre de même largeur, un côté sous un dessus qui le recouvre — la ligne de joint est effacée,
 * pour qu'elles montrent une seule surface lisse, en restant des pièces séparées. Une arête est un joint là où elle
 * court le long d'une arête de la boîte d'une pièce voisine (en boîte) : leurs faces de part et d'autre sont alors dans
 * le même plan. Un coin rentrant (une planche plus étroite posée sur une autre) reste dessiné. La vue seulement. Pur.
 */
import type { DrawnEdges } from "./body-layer";

export type Box = [[number, number, number], [number, number, number]];

const TOL = 0.05;

/** The intervals of [a, b] along `axis` that are joints with one of `others`. */
function jointSpans(p: number[], q: number[], axis: number, others: readonly Box[]): [number, number][] {
  const spans: [number, number][] = [];
  const [a, b] = [Math.min(p[axis]!, q[axis]!), Math.max(p[axis]!, q[axis]!)];
  for (const box of others) {
    // On an edge line of that box: both other coordinates on its bounds.
    const onEdge = [0, 1, 2].every((i) => i === axis || Math.abs(p[i]! - box[0][i]!) < TOL || Math.abs(p[i]! - box[1][i]!) < TOL);
    if (!onEdge || [0, 1, 2].some((i) => i !== axis && (p[i]! < box[0][i]! - TOL || p[i]! > box[1][i]! + TOL))) continue;
    const from = Math.max(a, box[0][axis]!);
    const to = Math.min(b, box[1][axis]!);
    if (to - from > TOL) spans.push([from, to]);
  }
  return spans.sort((x, y) => x[0] - y[0]);
}

/** The edge lines of a body less its joints with `others` (box-shaped bodies touching it); the picking map follows. */
export function hideJoints(drawn: DrawnEdges, own: Box, others: readonly Box[]): DrawnEdges {
  // Touching it along a face (not only along an edge or at a corner).
  const overlap = (b: Box, i: number) => Math.min(b[1][i]!, own[1][i]!) - Math.max(b[0][i]!, own[0][i]!);
  const near = others.filter((b) => [0, 1, 2].every((i) => overlap(b, i) >= -TOL) && [0, 1, 2].filter((i) => overlap(b, i) > TOL).length >= 2);
  if (!near.length) return drawn;
  const out: number[] = [];
  const groups: DrawnEdges["groups"] = [];
  const v = drawn.positions;
  for (const g of drawn.groups) {
    const start = out.length / 3;
    for (let k = g.start; k + 1 < g.start + g.count; k += 2) {
      const p = [v[k * 3]!, v[k * 3 + 1]!, v[k * 3 + 2]!];
      const q = [v[k * 3 + 3]!, v[k * 3 + 4]!, v[k * 3 + 5]!];
      const moves = [0, 1, 2].filter((i) => Math.abs(p[i]! - q[i]!) > TOL);
      // Only straight lines along X, Y or Z can lie along the edge of a box.
      const spans = moves.length === 1 ? jointSpans(p, q, moves[0]!, near) : [];
      if (!spans.length) {
        out.push(...p, ...q);
        continue;
      }
      const axis = moves[0]!;
      const at = (t: number) => p.map((c, i) => (i === axis ? t : c));
      const [a, b] = [Math.min(p[axis]!, q[axis]!), Math.max(p[axis]!, q[axis]!)];
      let from = a;
      for (const [s, e] of spans) {
        if (s - from > TOL) out.push(...at(from), ...at(s));
        from = Math.max(from, e);
      }
      if (b - from > TOL) out.push(...at(from), ...at(b));
    }
    const count = out.length / 3 - start;
    if (count) groups.push({ start, count, edge: g.edge });
  }
  return { positions: new Float32Array(out), groups };
}

/** Whether a body is its bounding box (a board, a block): only those hide the joints of their neighbours. */
export function isBoxBody(bbox: Box, volume: number): boolean {
  const v = (bbox[1][0] - bbox[0][0]) * (bbox[1][1] - bbox[0][1]) * (bbox[1][2] - bbox[0][2]);
  return v > 0 && Math.abs(v - volume) <= 1e-3 * v;
}
