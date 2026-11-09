/** Saisie rapide, filtre du débit, fil continu, façades communes, chants d'un clic et modèle d'étiquette. */
import { describe, expect, it } from "vitest";
import { casesJoined, doorCount, withCasesJoined, withDoorSwing } from "../../frontend/src/document/door-fronts";
import { boardAxes, edgeLine, nearestEdge } from "../../frontend/src/document/edge-paint";
import { withGrainRun, withoutGrainRun } from "../../frontend/src/document/grain-run";
import { DEFAULT_LABEL, labelCss, labelHtml, movedField, type LabelData } from "../../frontend/src/document/label-template";
import { compactNames, cutSheetHtml } from "../../frontend/src/app/workshop/cut-list-view";
import { rowMatches, type CutRow, type CutTotals } from "../../frontend/src/document/cut-list";
import { layoutSheets } from "../../frontend/src/document/nesting";
import { emptySketchGeometry, type OffsetRecord, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { partitionDoors } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";
import { quickDivision } from "../../frontend/src/sketcher/shelves";

const CM = (value: number) => value * 10;
const row = (patch: Partial<CutRow>): CutRow => ({ names: ["Porte"], quantity: 1, length: 1000, width: 400, thickness: 18, material: "Chêne", grain: "length", edges: { length1: true, length2: false, width1: false, width2: false }, ...patch }) as CutRow;

describe("saisie rapide", () => {
  it("*3 : 3 étagères ; /4 : 4 niches égales, donc 3 étagères", () => {
    expect(quickDivision("*3", CM)?.count).toBe(3);
    expect(quickDivision("/4", CM)?.count).toBe(3);
  });
  it("30;40;50 : ces hauteurs de niches dans l'unité du projet, puis ce qui reste", () => {
    expect(quickDivision("30;40;50", CM)).toEqual({ count: 3, mode: "set", heights: [300, 400, 500, null] });
  });
  it("le reste n'est pas une saisie", () => {
    expect(quickDivision("trois", CM)).toBeNull();
    expect(quickDivision("/0", CM)).toBeNull();
  });
});

describe("filtre du débit", () => {
  it("cherche le nom, la matière et l'épaisseur, sans accent ni majuscule", () => {
    expect(rowMatches(row({}), "porte")).toBe(true);
    expect(rowMatches(row({}), "CHENE")).toBe(true);
    expect(rowMatches(row({}), "18")).toBe(true);
    expect(rowMatches(row({}), "tiroir")).toBe(false);
    expect(rowMatches(row({}), "")).toBe(true);
  });
});

describe("fil continu", () => {
  const boxes: [string, [[number, number, number], [number, number, number]]][] = [["b", [[500, 0, 0], [900, 18, 2000]]], ["a", [[0, 0, 0], [400, 18, 2000]]]];
  const parts = boxes.map(([id, box]) => ({ id, box }));
  it("une rangée, dans l'ordre le long du mur, puis retirée", () => {
    const doc = withGrainRun(createReferencePlate(), parts);
    const [a, b] = [doc.bodyInfo?.a?.grainRun, doc.bodyInfo?.b?.grainRun];
    expect(a?.id).toBe(b?.id);
    expect(a!.at).toBeLessThan(b!.at);
    const out = withoutGrainRun(doc, ["a"]);
    expect(out.bodyInfo?.a?.grainRun).toBeUndefined();
    expect(out.bodyInfo?.b?.grainRun).toBeUndefined();
  });
  it("le calepinage garde les façades ensemble, et dit quand elles ne tiennent pas", () => {
    const front = (name: string, at: number) => row({ names: [name], cutLength: 2000, cutWidth: 400, runs: [{ id: "run1", at }] });
    const { sheets, brokenRuns } = layoutSheets([front("P1", 1), front("P2", 2), front("P3", 3)]);
    expect(brokenRuns).toEqual([]);
    expect(sheets[0]?.runs).toHaveLength(1);
    const wide = (name: string, at: number) => row({ names: [name], cutLength: 2000, cutWidth: 1100, runs: [{ id: "run1", at }] });
    expect(layoutSheets([wide("P1", 1), wide("P2", 2), wide("P3", 3)]).brokenRuns).toEqual(["P1, P2, P3"]);
  });
});

describe("façades communes", () => {
  const input: PartitionParams = { length: 2000, height: 2000, thickness: 18, cases: 4, dividers: ["single", "single", "single"], boards: true, plinth: 0, outer: "board", sinks: [] } as unknown as PartitionParams;
  const record = partitionRecord("of1", "Répartition 4 cases", input, [0, 0], 400);
  const step = { ...record.step!, doors: { gap: 3, thickness: 18, handles: true } } as OffsetRecord["step"];
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [{ ...record, step }] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
  const base: CadDocument = { ...createReferencePlate(), features: [sketch] };

  it("une porte sur deux cases ; recliquer les sépare", () => {
    const joined = withCasesJoined(base, "sk1", "of1", 1, 2);
    expect(casesJoined(joined, "sk1", "of1", 2, 1)).toBe(true);
    expect(doorCount(joined, "sk1", "of1")).toBe(3);
    const apart = withCasesJoined(joined, "sk1", "of1", 2, 1);
    expect(doorCount(apart, "sk1", "of1")).toBe(4);
  });
  it("la porte fusionnée couvre les deux cases", () => {
    const four = partitionDoors(input, [0, 0], 3) as [number, number, number, number][];
    const three = partitionDoors(input, [0, 0], 3, [1]) as [number, number, number, number][];
    expect(three).toHaveLength(3);
    expect(three[1]?.[0]).toBeCloseTo(four[1]![0]);
    expect(three[1]?.[2]).toBeCloseTo(four[2]![2]);
  });
  it("le sens d'ouverture : par paires en miroir, ou d'un seul côté", () => {
    const hinges = (doc: CadDocument) => (doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "doors"))?.hinges;
    expect(hinges(withDoorSwing(base, "sk1", "of1", "pairs"))).toEqual(["left", "right", "left", "right"]);
    expect(hinges(withDoorSwing(base, "sk1", "of1", "right"))).toEqual(["right", "right", "right", "right"]);
  });
  it("une porte fusionnée redonne des charnières par porte", () => {
    const swung = withDoorSwing(withCasesJoined(base, "sk1", "of1", 0, 1), "sk1", "of1", "pairs");
    expect((swung.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "doors"))?.hinges).toHaveLength(3);
  });
});

describe("chant sous le pointeur", () => {
  const box = [[0, 0, 0], [18, 400, 2000]] as const;
  it("les axes : longueur, largeur, épaisseur", () => {
    expect(boardAxes(box)).toEqual([2, 1, 0]);
  });
  it("le bord le plus proche", () => {
    expect(nearestEdge(box, [18, 5, 1000])).toBe("length1");
    expect(nearestEdge(box, [18, 395, 1000])).toBe("length2");
    expect(nearestEdge(box, [18, 200, 3])).toBe("width1");
    expect(nearestEdge(box, [18, 200, 1995])).toBe("width2");
  });
  it("sa ligne longe le bord, au milieu de l'épaisseur", () => {
    expect(edgeLine(box, "length2")).toEqual([[9, 400, 0], [9, 400, 2000]]);
    expect(edgeLine(box, "width1")).toEqual([[9, 0, 0], [9, 400, 0]]);
  });
});

describe("modèle d'étiquette", () => {
  const data: LabelData = { name: "Porte <1>", tag: "A", size: "1000 × 400 × 18 mm", material: "Chêne", edges: "Chants : L1", grain: "Fil : long", project: "Dressing", qr: "<svg></svg>" };
  const escape = (text: string) => text.replaceAll("<", "&lt;");
  it("dit ce qui est coché, dans l'ordre, et échappe le texte", () => {
    const html = labelHtml({ ...DEFAULT_LABEL, fields: ["material", "name"] }, data, escape);
    expect(html.indexOf("Chêne")).toBeLessThan(html.indexOf("Porte"));
    expect(html).toContain("Porte &lt;1>");
    expect(html).not.toContain("Dressing");
  });
  it("le QR code se place, ou s'enlève", () => {
    const right = labelHtml({ ...DEFAULT_LABEL, qr: "right" }, data, escape);
    expect(right.indexOf("text")).toBeLessThan(right.indexOf("qr"));
    expect(labelHtml({ ...DEFAULT_LABEL, qr: "none" }, data, escape)).not.toContain("<svg");
  });
  it("le format donne la grille de la planche", () => {
    expect(labelCss({ ...DEFAULT_LABEL, format: "2x4" })).toContain("repeat(2,105mm)");
  });
  it("monter un champ, sans sortir de la liste", () => {
    expect(movedField(["name", "size"], "size", -1)).toEqual(["size", "name"]);
    expect(movedField(["name", "size"], "name", -1)).toEqual(["name", "size"]);
  });
});

describe("présentation de la liste de débit", () => {
  const panel = (patch: Partial<CutRow>) => row({ tag: "A", band: 1, cutLength: 1000, cutWidth: 399, ...patch });
  const totals: CutTotals[] = [{ material: "Chêne", thickness: 18, area: 1.2, bandLength: 2, metres: 3, parts: 3 }];
  it("le mot commun une seule fois", () => {
    expect(compactNames(["Cloison 6", "Cloison 9", "Étagère 2"])).toBe("Cloison 6, 9 · Étagère 2");
    expect(compactNames(["Dessous", "Dessus"])).toBe("Dessous · Dessus");
  });
  it("le résumé additionne, et le fil commun passe dans le titre", () => {
    const html = cutSheetHtml([panel({})], totals, "cm");
    expect(html).toContain("<dt>Pièces</dt><dd>3</dd>");
    expect(html).toContain("fil en longueur");
    expect(html).not.toContain(">Fil</th>");
  });
  it("des fils différents gardent leur colonne", () => {
    expect(cutSheetHtml([panel({}), panel({ tag: "B", grain: "width" })], totals, "cm")).toContain(">Fil</th>");
  });
  it("la colonne Coupe n'existe que si une coupe diffère", () => {
    expect(cutSheetHtml([panel({})], totals, "cm")).toContain(">Coupe</th>");
    expect(cutSheetHtml([panel({ cutWidth: 400 })], totals, "cm")).not.toContain(">Coupe</th>");
  });
  it("les noms sont échappés", () => {
    expect(cutSheetHtml([panel({ names: ["<b>"] })], totals, "cm")).toContain("&lt;b&gt;");
  });
});
