/** Comme OpenCutList : repères des pièces, débit en barres des tasseaux, import d'une liste de pièces en CSV. */
import { describe, expect, it } from "vitest";
import { layoutBars } from "../../frontend/src/document/bars";
import { cutList, cutListCsv, partTag, type CutRow, type PartInput } from "../../frontend/src/document/cut-list";
import { setBodyInfo } from "../../frontend/src/document/materials";
import { layoutSheets } from "../../frontend/src/document/nesting";
import { importParts, parsePartsCsv } from "../../frontend/src/document/parts-import";
import { combineRows, purchaseList } from "../../frontend/src/document/purchase";
import { DEFAULT_RATES, makeQuote } from "../../frontend/src/document/quote";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";

const box = (id: string, l: number, w: number, t: number): PartInput => ({ id, bbox: [[0, 0, 0], [l, w, t]], volume: l * w * t });
const plate = (): CadDocument => ({ ...createReferencePlate(), features: [] });

describe("repères des pièces", () => {
  it("A … Z puis AA, AB", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(partTag)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });

  it("chaque ligne a sa lettre et ses corps ; le CSV commence par le repère ; un lot ne garde ni l'un ni l'autre", () => {
    let doc = setBodyInfo(plate(), ["a", "b"], { material: "melamine-white" });
    doc = setBodyInfo(doc, ["c"], { material: "mdf" });
    const { rows, totals } = cutList(doc, [box("a", 600, 400, 19), box("b", 600, 400, 19), box("c", 800, 300, 19)]);
    expect(rows.map((r) => [r.tag, r.ids])).toEqual([["A", ["c"]], ["B", ["a", "b"]]]);
    expect(totals.find((t) => t.material === "Mélaminé blanc")?.metres).toBeCloseTo(1.2);
    expect(cutListCsv(rows).split("\r\n")[1]).toMatch(/^"A";/);
    const lot = combineRows([{ name: "P", quantity: 2, rows }]);
    expect(lot[0]).not.toHaveProperty("tag");
    expect(lot[0]).not.toHaveProperty("ids");
    // On the sheet layout, each part carries its mark.
    expect(layoutSheets(rows).sheets.flatMap((s) => s.placements.map((p) => p.tag)).sort()).toEqual(["A", "B", "B"]);
  });
});

describe("débit en barres", () => {
  const rows = (): CutRow[] => {
    const doc = setBodyInfo(plate(), ["t1", "t2", "t3", "t4", "t5", "p"], { material: "pine-batten" });
    const sheet = setBodyInfo(doc, ["p"], { material: "melamine-white" });
    return cutList(sheet, [box("t1", 1500, 45, 45), box("t2", 1500, 45, 45), box("t3", 800, 45, 45), box("t4", 600, 45, 27), box("t5", 2500, 45, 45), box("p", 600, 400, 19)]).rows;
  };

  it("les plus longues d'abord, dans la première barre où elles tiennent, par section ; trop longue à part", () => {
    const { bars, tooLong } = layoutBars(rows());
    expect(tooLong).toEqual(["t5"]);
    const square = bars.filter((b) => b.section.join() === "45,45");
    // 1500 + 800 in the first bar (10 + 1500 + 4 + 800 ≤ 2400), 1500 alone in the second.
    expect(square.map((b) => b.cuts.map((c) => c.length))).toEqual([[1500, 800], [1500]]);
    expect(square[0]!.cuts.map((c) => c.x)).toEqual([10, 1514]);
    expect(square[0]!.rest).toBe(2400 - 2314 - 4);
    expect(bars.filter((b) => b.section.join() === "45,27")).toHaveLength(1);
  });

  it("pas sur les panneaux ; à la liste d'achat en barres ; au devis au mètre", () => {
    const r = rows();
    expect(layoutSheets(r).sheets.map((s) => s.material)).toEqual(["Mélaminé blanc"]);
    const { bars } = layoutBars(r);
    const buy = purchaseList([], r, [], bars);
    expect(buy).toContainEqual(expect.objectContaining({ label: "Tasseau sapin raboté 45 × 45 mm", quantity: 2, unit: "barres" }));
    const doc = setBodyInfo(plate(), ["t"], { material: "pine-batten" });
    const quote = makeQuote(cutList(doc, [box("t", 2000, 45, 45)]).totals, { ...DEFAULT_RATES, waste: 10 });
    expect(quote.lines[0]).toMatchObject({ quantity: 2.2, unit: "m", unitPrice: 32.4, total: 71.28 }); // 3 € the metre, in dirhams
  });
});

describe("importer une liste de pièces", () => {
  it("lit l'en-tête, l'unité, la virgule décimale et la matière ; signale les lignes fausses", () => {
    const csv = "Désignation;Qté;Longueur (cm);Largeur (cm);Épaisseur (cm);Matière\r\nCôté;2;72;55,7;1,9;Mélaminé blanc\nDos;x;10;10;1\nÉtagère;1;56,4;;1,9;\n";
    const { parts, problems } = parsePartsCsv(csv);
    expect(parts).toEqual([{ name: "Côté", quantity: 2, length: 720, width: 557, thickness: 19, material: "melamine-white" }]);
    expect(problems).toEqual(["Ligne 3 : la quantité doit être un nombre entier.", "Ligne 4 : longueur et largeur attendues."]);
  });

  it("sans en-tête : nom, quantité, longueur, largeur, épaisseur, matière ; virgules ou tabulations", () => {
    expect(parsePartsCsv("Tablette,3,800,300,22,mdf").parts).toEqual([{ name: "Tablette", quantity: 3, length: 800, width: 300, thickness: 22, material: "mdf" }]);
    expect(parsePartsCsv("Fond\t1\t700\t500").parts[0]).toMatchObject({ length: 700, width: 500, thickness: 19 });
  });

  it("la liste de débit exportée se réimporte", () => {
    const doc = setBodyInfo(plate(), ["a", "b"], { material: "birch-plywood" });
    const csv = cutListCsv(cutList(doc, [box("a", 600, 400, 18), box("b", 600, 400, 18)]).rows);
    expect(parsePartsCsv(csv).parts).toEqual([{ name: "a, b", quantity: 2, length: 600, width: 400, thickness: 18, material: "birch-plywood" }]);
  });

  it("des planches à plat côte à côte, nommées et dans leur matière, en une étape", () => {
    const { doc, boards } = importParts(plate(), [{ name: "Côté", quantity: 2, length: 720, width: 557, thickness: 19, material: "melamine-white" }, { name: "Tablette", quantity: 1, length: 2500, width: 300, thickness: 22 }], [1000, -200]);
    expect(boards).toBe(3);
    const extrudes = doc.features.filter((f) => f.type === "extrude");
    expect(extrudes.map((f) => [f.name, f.type === "extrude" && f.distance])).toEqual([["Côté (1)", 19], ["Côté (2)", 19], ["Tablette", 22]]);
    expect(doc.bodyInfo?.[extrudes[0]!.id]).toEqual({ material: "melamine-white", grain: "length" });
    expect(doc.bodyNames?.[extrudes[2]!.id]).toBe("Tablette");
    const sketches = doc.features.filter((f) => f.type === "sketch");
    const xs = sketches.map((s) => (s.type === "sketch" ? Math.min(...s.points.map((p) => p.x)) : 0));
    const ys = sketches.map((s) => (s.type === "sketch" ? Math.min(...s.points.map((p) => p.y)) : 0));
    // The third would end beyond 3 m from the start: on a new row, behind the deepest of the first.
    expect(xs).toEqual([1000, 1770, 1000]);
    expect(ys).toEqual([-200, -200, -200 + 557 + 50]);
  });
});
