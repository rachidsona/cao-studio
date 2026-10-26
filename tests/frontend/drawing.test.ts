/** Mise en plan: orthographic views with hidden edges, and the drawing sheet. */
import { describe, expect, it } from "vitest";
import { buildSheet, projectView, type MeshInput } from "../../frontend/src/document/drawing";

/** A box as a mesh: 8 corners, 12 triangles, the 12 edges as segments. */
function box(id: string, lo: [number, number, number], hi: [number, number, number]): MeshInput {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const indices = quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]);
  const pairs = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return { id, vertices: corners.flat(), indices, edges: pairs.flatMap(([a, b]) => [...corners[a!]!, ...corners[b!]!]) };
}

const format = (mm: number) => `${Number(mm.toFixed(2))} mm`;

describe("projection", () => {
  it("une boîte de face : un rectangle de 600 × 720, les arêtes de derrière se confondent avec celles de devant", () => {
    const p = projectView([box("a", [0, 0, 0], [600, 560, 720])], "front");
    expect(p.lines).toHaveLength(4);
    expect(p.lines.every((l) => !l.hidden)).toBe(true);
    expect([p.max[0] - p.min[0], p.max[1] - p.min[1]]).toEqual([600, 720]);
  });

  it("de dessus : 600 × 560 ; de droite : 560 × 720, avec les axes de la vue (Y à droite, Z en haut)", () => {
    const m = [box("a", [0, 0, 0], [600, 560, 720])];
    const top = projectView(m, "top");
    expect([top.max[0] - top.min[0], top.max[1] - top.min[1]]).toEqual([600, 560]);
    const right = projectView(m, "right");
    expect([right.max[0] - right.min[0], right.max[1] - right.min[1]]).toEqual([560, 720]);
  });

  it("un corps derrière un autre : ses arêtes sont cachées (pointillés) ; sans « cachées », elles disparaissent", () => {
    const front = box("devant", [0, 0, 0], [100, 10, 100]);
    const behind = box("derriere", [20, 50, 20], [40, 60, 40]);
    const all = projectView([front, behind], "front", true);
    const hidden = all.lines.filter((l) => l.hidden);
    expect(hidden).toHaveLength(4);
    expect(all.lines.filter((l) => !l.hidden)).toHaveLength(4);
    expect(projectView([front, behind], "front", false).lines).toHaveLength(4);
  });

  it("un corps qui dépasse de celui de devant : la partie qui dépasse reste visible, le reste est caché", () => {
    const front = box("devant", [0, 0, 0], [100, 10, 100]);
    const behind = box("derriere", [50, 50, 20], [150, 60, 40]);
    const lines = projectView([front, behind], "front").lines;
    const visibleRight = lines.filter((l) => !l.hidden && Math.min(l.a[0], l.b[0]) >= 100 - 1e-6);
    const hiddenInside = lines.filter((l) => l.hidden);
    expect(visibleRight.length).toBeGreaterThanOrEqual(2);
    expect(hiddenInside.length).toBeGreaterThanOrEqual(2);
  });
});

describe("feuille", () => {
  const meshes = [box("a", [0, 0, 0], [600, 560, 720])];
  const options = { sheet: "A3" as const, scale: null, hidden: true, title: "Caisson 1", format, date: "2026-10-21" };

  it("A3 paysage, trois vues, cotes générales, cartouche, échelle normalisée qui tient", () => {
    const sheet = buildSheet(meshes, options);
    expect(sheet.svg).toContain('viewBox="0 0 420 297"');
    for (const t of ["Vue de face", "Vue de droite", "Vue de dessus", "Caisson 1", "600 mm", "720 mm", "560 mm", `Échelle 1:${sheet.scale}`]) expect(sheet.svg).toContain(t);
    expect([5, 10]).toContain(sheet.scale);
  });

  it("une échelle imposée est respectée ; A4 réduit plus que A3", () => {
    expect(buildSheet(meshes, { ...options, scale: 20 }).scale).toBe(20);
    expect(buildSheet(meshes, { ...options, sheet: "A4" }).scale).toBeGreaterThan(buildSheet(meshes, options).scale);
  });

  it("le texte du titre est échappé", () => {
    expect(buildSheet(meshes, { ...options, title: 'A<B & "C"' }).svg).toContain("A&lt;B &amp; &quot;C&quot;");
  });
});
