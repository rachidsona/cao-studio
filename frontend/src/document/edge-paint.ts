/** Le chant sous le pointeur : le bord d'une planche le plus proche d'un point, et ces bords en segments pour la vue. Pur. */
import type { BodyInfo, Vec3 } from "./types";

export type Edges = NonNullable<BodyInfo["edges"]>;
export type EdgeKey = keyof Edges;
type Box = readonly [readonly number[], readonly number[]];

/** The axes of a board: its length, its width, its thickness, as the cut list measures them. */
export function boardAxes(box: Box): [number, number, number] {
  const size = [0, 1, 2].map((k) => (box[1][k] as number) - (box[0][k] as number));
  return [0, 1, 2].sort((a, b) => (size[b] as number) - (size[a] as number)) as [number, number, number];
}

/** The edge of this board nearest to this point. */
export function nearestEdge(box: Box, point: readonly number[]): EdgeKey {
  const [l, w] = boardAxes(box);
  const near: [EdgeKey, number][] = [
    ["length1", Math.abs((point[w] as number) - (box[0][w] as number))],
    ["length2", Math.abs((point[w] as number) - (box[1][w] as number))],
    ["width1", Math.abs((point[l] as number) - (box[0][l] as number))],
    ["width2", Math.abs((point[l] as number) - (box[1][l] as number))],
  ];
  return near.sort((a, b) => a[1] - b[1])[0]?.[0] as EdgeKey;
}

/** The line of an edge, along the middle of its thickness. */
export function edgeLine(box: Box, key: EdgeKey): [Vec3, Vec3] {
  const [l, w, t] = boardAxes(box);
  const point = (along: number, across: number): Vec3 => {
    const p: Vec3 = [0, 0, 0];
    p[l] = along;
    p[w] = across;
    p[t] = ((box[0][t] as number) + (box[1][t] as number)) / 2;
    return p;
  };
  const [l0, l1, w0, w1] = [box[0][l] as number, box[1][l] as number, box[0][w] as number, box[1][w] as number];
  if (key === "length1") return [point(l0, w0), point(l1, w0)];
  if (key === "length2") return [point(l0, w1), point(l1, w1)];
  return key === "width1" ? [point(l0, w0), point(l0, w1)] : [point(l1, w0), point(l1, w1)];
}
