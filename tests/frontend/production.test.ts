/** Production : chutes du stock et chutes à garder, liste d'achat, lot de projets, calques DXF, devis (perçages, remises, scénarios, avenants), massif. */
import { describe, expect, it } from "vitest";
import { cutList, type CutRow, type PartInput } from "../../frontend/src/document/cut-list";
import { setBodyInfo } from "../../frontend/src/document/materials";
import { KEEP, layoutSheets } from "../../frontend/src/document/nesting";
import { combineHardware, combineRows, purchaseList } from "../../frontend/src/document/purchase";
import { DEFAULT_RATES, makeQuote, quoteChanges, quoteCsv, scenarioTotals, withSavedQuote } from "../../frontend/src/document/quote";
import type { CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { motifShift } from "../../frontend/src/appearance/assign";
import { boardUvs } from "../../frontend/src/appearance/three-materials";
import { layerName, partsDxf, type FlatPart } from "../../frontend/src/io/dxf";

const row = (patch: Partial<CutRow> = {}): CutRow => ({ names: ["P"], quantity: 1, length: 700, width: 400, thickness: 19, material: "Mélaminé blanc", grain: "length", edges: { length1: true, length2: false, width1: false, width2: false }, band: 1, cutLength: 700, cutWidth: 399, approximate: false, ...patch });

describe("calepinage et stock de chutes", () => {
  it("une chute du stock de la même matière passe avant un panneau neuf", () => {
    const stock = [{ id: 7, material: "Mélaminé blanc", thickness: 19, length: 900, width: 500, quantity: 1 }, { id: 8, material: "MDF brut", thickness: 19, length: 2000, width: 1000, quantity: 1 }];
    const { sheets } = layoutSheets([row()], undefined, stock);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.offcut).toBe(7);
    expect(sheets[0]!.placements[0]).toMatchObject({ x: 0, y: 0, w: 700, h: 399 });
    // Too small an offcut: a new sheet.
    expect(layoutSheets([row({ cutLength: 1200 })], undefined, stock).sheets[0]!.offcut).toBeUndefined();
  });

  it("ce qui reste d'un panneau assez grand est proposé comme chute à garder", () => {
    const { sheets } = layoutSheets([row({ quantity: 2 })]);
    const left = sheets[0]!.leftovers;
    expect(left.length).toBeGreaterThan(0);
    expect(left.every(([, , w, h]) => Math.max(w, h) >= KEEP[0] && Math.min(w, h) >= KEEP[1])).toBe(true);
    // The band above the strip spans the whole width of the sheet.
    expect(left.some(([x, , w]) => x === 10 && w === 2780)).toBe(true);
  });

  it("liste d'achat : panneaux neufs, chant avec sa surlongueur, quincaillerie en boîtes", () => {
    const rows = [row({ quantity: 4 })];
    const { sheets } = layoutSheets(rows);
    const lines = purchaseList(sheets, rows, [{ name: "Vis confirmat 7 × 50", quantity: 176 }, { name: "Tringle de penderie Ø25 (m)", quantity: 1.2, unit: "m" }]);
    expect(lines[0]).toMatchObject({ label: "Mélaminé blanc 19 mm", quantity: 1, unit: "panneau" });
    expect(lines.find((l) => l.label === "Chant 1 mm")?.quantity).toBe(3);
    expect(lines.find((l) => l.label === "Vis confirmat 7 × 50")).toMatchObject({ quantity: 2, unit: "boîtes de 100" });
    expect(lines.find((l) => l.label.startsWith("Tringle"))).toMatchObject({ quantity: 1.2, unit: "m" });
  });

  it("un lot : chaque projet en quantité, ses pièces préfixées, sa quincaillerie additionnée", () => {
    const rows = combineRows([{ name: "Bas 60", quantity: 3, rows: [row({ names: ["Côté g", "Côté d"], quantity: 2 })] }, { name: "Haut", quantity: 1, rows: [row({ names: ["Dessus"] })] }]);
    expect(rows.map((r) => r.quantity)).toEqual([6, 1]);
    expect(rows[0]!.names).toHaveLength(6);
    expect(rows[0]!.names.slice(0, 2)).toEqual(["Bas 60 — Côté g", "Bas 60 — Côté d"]);
    expect(combineHardware([{ quantity: 3, hardware: [{ name: "Pied réglable", quantity: 4 }] }, { quantity: 1, hardware: [{ name: "Pied réglable", quantity: 4 }] }])).toEqual([{ name: "Pied réglable", quantity: 16 }]);
  });

  it("le massif est débité avec sa surcote", () => {
    const doc: CadDocument = setBodyInfo({ format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [] }, ["x"], { material: "solid-oak" });
    const parts: PartInput[] = [{ id: "x", bbox: [[0, 0, 0], [800, 300, 22]], volume: 800 * 300 * 22 }];
    const [r] = cutList(doc, parts).rows;
    expect([r!.roughLength, r!.roughWidth]).toEqual([820, 310]);
    expect(layoutSheets([r!]).sheets[0]!.placements[0]).toMatchObject({ w: 820, h: 310 });
  });
});

describe("DXF : calques nommés pour la machine", () => {
  const part: FlatPart = { name: "Côté", thickness: 19, width: 700, height: 400, edges: [{ kind: "line", a: [0, 0], b: [700, 0] }, { kind: "circle", center: [37, 50], radius: 2.5, depth: 12 }, { kind: "circle", center: [37, 82], radius: 2.5, depth: 12 }] };
  it("diamètre et profondeur dans le nom du calque, déclarés dans la table", () => {
    expect(layerName("PERCAGE_D{d}_Z{z}", { d: 5, z: 12, t: 19 })).toBe("PERCAGE_D5_Z12");
    expect(layerName("Z{t} é/x", { t: 19 })).toBe("Z19_e_x");
    const dxf = partsDxf([part], 20, { contour: "CONTOUR_Z{t}", drill: "Z{z}-D{d}" });
    expect(dxf).toContain("\r\nCONTOUR_Z19\r\n");
    expect(dxf.match(/\r\n8\r\nZ12-D5\r\n/g)).toHaveLength(2);
    // The layer table lists each layer once.
    expect(dxf.match(/LAYER\r\n2\r\nZ12-D5/g)).toHaveLength(1);
    // The default stays as it was.
    expect(partsDxf([part])).toContain("\r\n8\r\nPERCAGE\r\n");
  });
});

describe("devis : perçages, remises, scénarios, avenants", () => {
  const totals = [{ material: "Mélaminé blanc", thickness: 19, area: 4, bandLength: 10, parts: 10 }];
  it("les perçages au prix de l'unité, la remise du palier atteint", () => {
    const plain = makeQuote(totals, DEFAULT_RATES);
    const q = makeQuote(totals, { ...DEFAULT_RATES, perHole: 0.2, tiers: [[100, 5], [100000, 10]] }, [], "mm", 40);
    expect(q.lines.find((l) => l.label === "Perçages (usinage)")).toMatchObject({ quantity: 40, total: 8 });
    expect(q.discountRate).toBe(5);
    expect(q.net).toBeCloseTo((plain.net + 8 * 1.3) * 0.95, 1);
    expect(quoteCsv(q)).toContain('"Remise 5 %"');
    expect(plain.discount).toBeUndefined();
  });

  it("un scénario de matière, et les avenants avec ce qui a changé", () => {
    const oak = makeQuote(scenarioTotals(totals, "Mélaminé blanc", "Chêne massif"), DEFAULT_RATES);
    expect(oak.gross).toBeGreaterThan(makeQuote(totals, DEFAULT_RATES).gross);
    const first = withSavedQuote([], makeQuote(totals, DEFAULT_RATES), "2026-11-01T10:00:00Z");
    const both = withSavedQuote(first, oak, "2026-11-02T10:00:00Z");
    expect(both.map((v) => v.label)).toEqual(["Devis initial", "Avenant 1"]);
    const changes = quoteChanges(both[0]!, both[1]!);
    expect(changes.map((c) => c.label)).toEqual(["Mélaminé blanc 19 mm (chutes 15 % comprises)", "Chêne massif 19 mm (chutes 15 % comprises)"]);
    const doc = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [], quotes: both };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });
});

describe("rendu : le veinage décalé d'une planche à l'autre", () => {
  it("chaque corps a son décalage, toujours le même", () => {
    expect(motifShift("cb1#0")).toEqual(motifShift("cb1#0"));
    expect(motifShift("cb1#0")).not.toEqual(motifShift("cb1#1"));
    const uv = boardUvs([0, 0, 0], [0, 0, 1], 0, [500, 500], undefined, [0.25, 0.5]);
    expect([...uv]).toEqual([0.25, 0.5]);
  });
});
