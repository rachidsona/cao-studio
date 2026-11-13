/** Entailles de gorge en fabrication : la liste de débit, son CSV, les fiches et la face mise à plat les montrent. */
import { measureArea } from "replicad";
import { beforeAll, describe, expect, it } from "vitest";
import { cutList, cutListCsv } from "../../frontend/src/document/cut-list";
import { notchText, sideNotches } from "../../frontend/src/document/side-notches";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { buildCabinet } from "../../frontend/src/features/cabinet";
import { GORGE, gorgeNotches } from "../../frontend/src/features/fronts-parts";
import { setupKernel } from "./kernel-setup";

beforeAll(() => setupKernel(), 120_000);

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 0, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: false, grip: "gorge", ...over });
const docOf = (...features: (CabinetFeature | FrontsFeature)[]): CadDocument => ({ ...createReferencePlate(), features, bodyInfo: { "cb1#0": { material: "melamine-white" }, "cb1#1": { material: "melamine-white" } } });

describe("les entailles d'un côté", () => {
  it("les deux côtés seulement, depuis le bas du côté, de bas en haut ; en clair", () => {
    const doc = docOf(cabinet, fronts());
    const left = sideNotches(doc, "cb1#0");
    expect(left).toHaveLength(3);
    expect(left.map((n) => n.z1 - n.z0)).toEqual([GORGE.height, GORGE.height, GORGE.height].map((v) => expect.closeTo(v, 6)));
    expect(left[2]!.z1).toBeCloseTo(720 - 18);
    expect(sideNotches(doc, "cb1#1")).toEqual(left);
    expect(sideNotches(doc, "cb1#2")).toEqual([]);
    expect(sideNotches(docOf(cabinet, fronts({ grip: undefined })), "cb1#0")).toEqual([]);
    // Bottom and top through: the sides start on the bottom board.
    const through = { ...cabinet, construction: "top-bottom-through" as const };
    expect(sideNotches(docOf(through, fronts()), "cb1#0")[2]!.z1).toBeCloseTo(720 - 18 - (100 + 18));
    expect(notchText(left, (mm) => String(Math.round(mm)))).toBe(`3 entailles 57 × 26 mm à l'avant (profil gorge), leur bas à ${left.map((n) => Math.round(n.z0)).join(" ; ")} mm du bas du côté`);
    expect(notchText(left.slice(0, 1), (mm) => String(mm / 10).replace(".", ","), "cm")).toBe(`1 entaille 5,7 × 2,6 cm à l'avant (profil gorge), leur bas à ${String(left[0]!.z0 / 10).replace(".", ",")} cm du bas du côté`);
    expect(notchText([])).toBe("");
  });

  it("la liste de débit range les côtés entaillés à part, sans les dire approximatifs, et le CSV les nomme", () => {
    const doc = docOf(cabinet, fronts());
    // The sides as the kernel makes them: their box, less the notches' volume.
    const box: [[number, number, number], [number, number, number]] = [[0, 0, 0], [18, 557, 720]];
    const notched = 18 * 557 * 720 - 3 * 18 * GORGE.depth * GORGE.height;
    const { rows } = cutList(doc, [{ id: "cb1#0", bbox: box, volume: notched }, { id: "cb1#1", bbox: box, volume: notched }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 2, approximate: false, length: 720, width: 557 });
    expect(rows[0]!.notches).toEqual(sideNotches(doc, "cb1#0"));
    expect(cutListCsv(rows)).toContain("Bas — Côté gauche, Bas — Côté droit (3 entailles 57 × 26 mm à l'avant (profil gorge)");
    expect(cutListCsv(rows, "cm")).toContain("(3 entailles 5,7 × 2,6 cm à l'avant");
    // Without the gorge: a plain board again.
    const plain = cutList(docOf(cabinet, fronts({ grip: undefined })), [{ id: "cb1#0", bbox: box, volume: 18 * 557 * 720 }]);
    expect(plain.rows[0]!.notches).toBeUndefined();
  });

  it("la grande face du côté, celle que lisent le DXF, le G-code et les fiches, porte les entailles dans son contour", () => {
    const notches = gorgeNotches(fronts(), cabinet);
    const out = buildCabinet({ ...cabinet, notches });
    const side = out.shapes[0]!;
    const faces = [...side.faces].sort((a, b) => measureArea(b) - measureArea(a));
    const large = faces[0]!;
    // A rectangle notched three times on one edge: 4 + 3 × 4 edges, and its area less three notches.
    expect(large.wires.reduce((n, w) => n + w.edges.length, 0)).toBe(16);
    expect(measureArea(large)).toBeCloseTo(557 * 720 - 3 * GORGE.depth * GORGE.height, 0);
    for (const s of out.shapes) s.delete();
  });
});
