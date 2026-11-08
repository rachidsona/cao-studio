/**
 * Les faces pareilles d'un corps, lues sur son maillage : même aire, même périmètre et à plat. Ce sont les côtés
 * d'un seau à pans ou les deux côtés d'un caisson : un clic sur l'une prend les autres. Pur.
 */
import type { BodyMesh } from "../geometry/protocol";

const AREA = 1e-3;
const PERIMETER = 0.5;

/** The area, the perimeter of a face, and whether it is flat. */
export function faceMeasure(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">, face: number): { area: number; perimeter: number; flat: boolean } {
  const g = mesh.faceGroups[face];
  if (!g) return { area: 0, perimeter: 0, flat: false };
  const at = (k: number) => [0, 1, 2].map((c) => mesh.vertices[mesh.indices[k]! * 3 + c]!);
  const key = (p: number[]) => p.map((c) => c.toFixed(3)).join(",");
  const edges = new Map<string, number>();
  let area = 0;
  let normal: number[] | null = null;
  let flat = true;
  for (let k = g.start; k + 2 < g.start + g.count; k += 3) {
    const [a, b, c] = [at(k), at(k + 1), at(k + 2)];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const twice = Math.hypot(n[0]!, n[1]!, n[2]!);
    area += twice / 2;
    if (twice > 1e-9) {
      const unit = n.map((x) => x / twice);
      if (normal && unit.reduce((s, x, i) => s + x * normal![i]!, 0) < 0.9999) flat = false;
      normal ??= unit;
    }
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const id = [key(p), key(q)].sort().join("|");
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  // The edges of a single triangle are the outline.
  let perimeter = 0;
  for (const [id, count] of edges) {
    if (count !== 1) continue;
    const [p, q] = id.split("|").map((s) => s.split(",").map(Number));
    perimeter += Math.hypot(p![0]! - q![0]!, p![1]! - q![1]!, p![2]! - q![2]!);
  }
  return { area, perimeter, flat };
}

/** The faces like this one (itself included): flat, of the same area and perimeter. */
export function faceTwins(mesh: Pick<BodyMesh, "vertices" | "indices" | "faceGroups">, face: number): number[] {
  const own = faceMeasure(mesh, face);
  if (!own.flat) return [face];
  return mesh.faceGroups.flatMap((_, other) => {
    const m = faceMeasure(mesh, other);
    return m.flat && Math.abs(m.area - own.area) <= AREA * own.area && Math.abs(m.perimeter - own.perimeter) <= PERIMETER ? [other] : [];
  });
}
