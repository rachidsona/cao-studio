/**
 * Vue éclatée sur une feuille de mise en plan : chaque pièce s'écarte du meuble le long de l'axe où elle dépasse le
 * plus (vers l'œil pour une pièce du milieu), comme dans la notice de montage (document/assembly-steps.ts). `factor`
 * est la part de la plus grande taille du meuble dont elle s'écarte (0,3 : 30 %). Pur.
 */
import { explodeDirection, unionBox } from "../document/assembly-steps";
import type { V3 } from "./model";
import type { MeshInput } from "./projection";

type Box = [V3, V3];

function boxOf(vertices: ArrayLike<number>): Box {
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, vertices[i + k]!);
      hi[k] = Math.max(hi[k]!, vertices[i + k]!);
    }
  }
  return [lo, hi];
}

const moved = (values: ArrayLike<number>, by: V3): Float32Array => {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i]! + by[i % 3]!;
  return out;
};

/** The pieces moved apart; `toEye`: where the view looks from. */
export function explodeMeshes(meshes: readonly MeshInput[], factor: number, toEye: V3): MeshInput[] {
  if (!(factor > 0) || meshes.length < 2) return [...meshes];
  const boxes = meshes.map((m) => boxOf(m.vertices));
  const model = unionBox(boxes) as Box;
  const reach = factor * Math.max(...[0, 1, 2].map((i) => model[1][i]! - model[0][i]!));
  return meshes.map((m, k) => {
    const d = explodeDirection(boxes[k]!, model, toEye) as V3;
    const by: V3 = [d[0] * reach, d[1] * reach, d[2] * reach];
    return { ...m, vertices: moved(m.vertices, by), edges: moved(m.edges, by) };
  });
}
