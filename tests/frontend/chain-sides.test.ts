/** « Séparer les côtés » d'un profil ouvert : un L, un U, un zigzag en biais, coupés à leurs coudes. */
import { basicFaceExtrusion, makePolygon, measureVolume, Vector, type Shape3D } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { chainWalls, splitChain } from "../../frontend/src/features/chain-sides";
import type { P2 } from "../../frontend/src/features/ring-sides";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const area = (poly: P2[]) => Math.abs(poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * p[1], 0) / 2);
const areas = (walls: P2[][]) => walls.map(area).map((a) => Math.round(a)).sort((a, b) => a - b);

const L: P2[] = [[0, 0], [600, 0], [600, 18], [18, 18], [18, 400], [0, 400]];
const U: P2[] = [[0, 0], [600, 0], [600, 400], [582, 400], [582, 18], [18, 18], [18, 400], [0, 400]];

/** A profile `t` thick centred on a polyline, its bends mitred: its outline. */
function thick(line: P2[], t: number): P2[] {
  const side = (s: number) =>
    line.map((p, k) => {
      const dir = (a: P2, b: P2): P2 => {
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      };
      const d1 = k > 0 ? dir(line[k - 1]!, p) : dir(p, line[k + 1]!);
      const d2 = k < line.length - 1 ? dir(p, line[k + 1]!) : d1;
      const n: P2 = [-(d1[1] + d2[1]), d1[0] + d2[0]];
      const l = Math.hypot(...n);
      const f = ((s * t) / 2) / ((n[0] / l) * -d1[1] + (n[1] / l) * d1[0]);
      return [p[0] + (n[0] / l) * f, p[1] + (n[1] / l) * f] as P2;
    });
  return [...side(-1), ...side(1).reverse()];
}

describe("les côtés d'un profil ouvert", () => {
  it("un L en onglet : la coupe va du coin intérieur au coin extérieur ; bout à bout, le plus long passe", () => {
    expect(areas(chainWalls(L, "miter") as P2[][])).toEqual([7038, 10638]);
    expect(areas(chainWalls(L, "butt") as P2[][])).toEqual([6876, 10800]);
    // The sides passing (upright, with up along y): the 400 side runs through, the 600 one stops against it.
    expect(areas(chainWalls(L, "butt", 0, { mode: "sides", up: [0, 1] }) as P2[][])).toEqual([7200, 10476]);
    // Each end its own way: the bend is at the bottom, mitred there.
    expect(areas(chainWalls(L, "butt", 0, { up: [0, 1], corners: { top: "boards", bottom: "miter" } }) as P2[][])).toEqual([7038, 10638]);
  });

  it("un U : trois côtés, ses deux coudes coupés ; un profil sans coude ou en T n'est pas pour ce calcul", () => {
    const miter = chainWalls(U, "miter") as P2[][];
    expect(miter).toHaveLength(3);
    expect(miter.reduce((s, w) => s + area(w), 0)).toBeCloseTo(area(U), 6);
    expect(areas(chainWalls(U, "butt", 0, { mode: "boards", up: [0, 1] }) as P2[][])).toEqual([6876, 6876, 10800]);
    expect(chainWalls([[0, 0], [600, 0], [600, 18], [0, 18]], "miter")).toBeNull();
    // A U with a shelf across (a T): not a chain.
    expect(chainWalls([[0, 0], [600, 0], [600, 18], [309, 18], [309, 300], [291, 300], [291, 18], [0, 18]], "miter")).toBeNull();
  });

  it("un zigzag de cinq côtés en biais, chacun de sa longueur sur 18 mm d'épaisseur ; élargis, les côtés débordent", () => {
    const line: P2[] = [[0, 0], [300, 120], [500, -40], [760, 200], [900, 60], [1200, 160]];
    const outline = thick(line, 18);
    const walls = chainWalls(outline, "miter") as P2[][];
    expect(walls).toHaveLength(5);
    const lengths = line.slice(1).map((p, k) => Math.hypot(p[0] - line[k]![0], p[1] - line[k]![1]) * 18);
    expect(areas(walls)).toEqual(lengths.map(Math.round).sort((a, b) => a - b));
    const wide = chainWalls(outline, "miter", 1) as P2[][];
    expect(wide.every((w, k) => area(w) > area(walls[k]!))).toBe(true);
  });
});

describe("un profil extrudé coupé en ses côtés (noyau)", () => {
  const prism = (poly: P2[], h: number): Shape3D => {
    const face = makePolygon(poly.map(([x, y]) => [x, y, 0] as [number, number, number]));
    const out = basicFaceExtrusion(face, new Vector([0, 0, h])) as Shape3D;
    face.delete();
    return out;
  };

  it("un L de 300 de long : deux corps en onglet, rien de perdu", () => {
    const body = prism(L, 300);
    const parts = splitChain("Côtés séparés 1", body, "miter")!;
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => Math.round(measureVolume(p) / 300)).sort((a, b) => a - b)).toEqual([7038, 10638]);
    for (const p of [body, ...parts]) p.delete();
  });

  it("un zigzag : cinq corps ; un bloc droit n'est pas un profil à coudes", () => {
    const body = prism(thick([[0, 0], [300, 120], [500, -40], [760, 200], [900, 60], [1200, 160]], 18), 250);
    const parts = splitChain("Côtés séparés 1", body, "butt")!;
    expect(parts).toHaveLength(5);
    expect(parts.reduce((s, p) => s + measureVolume(p), 0)).toBeCloseTo(measureVolume(body), 0);
    const block = prism([[0, 0], [600, 0], [600, 18], [0, 18]], 300);
    expect(splitChain("Côtés séparés 2", block, "miter")).toBeNull();
    for (const p of [body, block, ...parts]) p.delete();
  });
});
