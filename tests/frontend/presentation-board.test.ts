/** Planche de présentation : les faits du projet (hors tout, matières, rangements, composition) et sa page. */
import { describe, expect, it } from "vitest";
import { boardCss, boardFacts, boardHtml } from "../../frontend/src/document/presentation-board";
import { setBodyInfo } from "../../frontend/src/document/materials";
import { createReferencePlate, type CadDocument, type NicheFeature, type Vec3 } from "../../frontend/src/document/types";

const niche = (patch: Partial<NicheFeature>): NicheFeature => ({ id: "n1", type: "niche", name: "Tiroirs 1", sketch: "sk", partition: "of", niche: [0], fill: "drawers", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: false, ...patch });

describe("planche de présentation", () => {
  it("dit le hors-tout, les matières les plus employées d'abord, les rangements et la composition", () => {
    let doc: CadDocument = { ...createReferencePlate(), features: [niche({}), niche({ id: "n2", name: "Penderie escamotable 1", fill: "accessory", accessory: { model: "pulldown", lift: 0 } }), niche({ id: "n3", name: "Penderie escamotable 2", fill: "accessory", accessory: { model: "pulldown", lift: 0 } })], furniture: [{ name: "Îlot de dressing 1", ask: { kind: "island", width: 1200, height: 900, depth: 900, thickness: 18, option: "drawers" }, material: "melamine-oak", corner: [0, 0, 0], along: [1, 0], features: [] }] };
    doc = setBodyInfo(doc, ["a", "b"], { material: "melamine-oak" });
    doc = setBodyInfo(doc, ["c"], { material: "lacquer-white" });
    const box = (from: Vec3, to: Vec3) => [from, to] as [Vec3, Vec3];
    const facts = boardFacts(doc, [{ id: "a", box: box([0, 0, 0], [1200, 600, 2500]) }, { id: "b", box: box([1200, 0, 0], [2400, 600, 2500]) }, { id: "c", box: box([0, -900, 0], [600, 0, 900]) }]);
    expect(facts.size).toEqual([2400, 1500, 2500]);
    expect(facts.materials).toEqual([{ name: "Mélaminé chêne", color: "#c9a26b", count: 2 }, { name: "MDF laqué blanc", color: "#fafafa", count: 1 }]);
    expect(facts.equipment).toEqual(["3 tiroirs", "Penderie escamotable × 2"]);
    expect(facts.furniture).toEqual(["Îlot de dressing 1"]);
  });

  it("met sur la page le titre, le client, le mot (échappé), les vues, les faits et le prix s'il est demandé", () => {
    const facts = { size: [2400, 600, 2500] as Vec3, materials: [{ name: "Mélaminé chêne", color: "#c9a26b", count: 2 }], equipment: ["3 tiroirs"], furniture: ["Dressing — mur A"] };
    const page = { title: "Dressing Martin", client: "M. Martin", date: "14/11/2026", message: "Tout en chêne <clair>\nsur mesure", images: { main: "data:image/png;base64,AAA", front: "data:image/png;base64,BBB", top: "" }, price: "12 345,00 MAD", facts, length: (mm: number) => `${mm / 10} cm` };
    const html = boardHtml(page);
    expect(html).toContain("<h1>Dressing Martin</h1>");
    expect(html).toContain("Pour M. Martin — 14/11/2026");
    expect(html).toContain("Tout en chêne &#60;clair&#62;<br>sur mesure");
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(html).toContain('alt="Vue de face"');
    expect(html).not.toContain('alt="Vue de dessus"');
    expect(html).toContain("240 cm × 60 cm × 250 cm");
    expect(html).toContain('background:#c9a26b');
    expect(html).toContain("<b>12 345,00 MAD</b>");
    expect(boardHtml({ ...page, price: null })).not.toContain("Prix TTC");
    expect(boardCss(420, 297)).toContain("@page{size:420mm 297mm");
  });
});
