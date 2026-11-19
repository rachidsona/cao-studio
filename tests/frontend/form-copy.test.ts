/** « Pipette de forme » : la forme d'un meuble, d'un caisson, de façades ou d'une niche donnée à un autre de même sorte. */
import { describe, expect, it } from "vitest";
import { formOf, withFormCopied } from "../../frontend/src/document/form-copy";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { findFeature } from "../../frontend/src/document/operations";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const empty = (features: unknown[] = []) => ({ ...createReferencePlate(), features }) as unknown as CadDocument;
const ok = (doc: CadDocument | string): CadDocument => {
  if (typeof doc === "string") throw new Error(doc);
  return doc;
};

describe("pipette de forme", () => {
  it("un meuble de cuisine prend le modèle et l'intérieur d'un autre, sa largeur gardée", () => {
    const made = withKitchenPlan(empty(), { ...KITCHEN_PLAN, model: "L-left" });
    const drawers = { ...newItem([], "base-bas-3-tiroirs", 600), id: "u1" };
    const door = { ...newItem([drawers], "base-bas-1-porte", 450), id: "u2" };
    const tall = { ...newItem([drawers, door], "wall-haut-1-porte", 600), id: "u3" };
    const built = withKitchenBuilt(made.doc, made.id, { runs: { A: [drawers, door, tall] } });
    if (typeof built === "string") throw new Error(built);
    const bodies = (id: string) => built.doc.features.filter((f) => f.type === "cabinet").map((f) => formOf(built.doc, `${f.id}#0`)).find((s) => s?.kind === "unit" && s.at.item === id)!;
    const from = bodies("u1");
    const to = bodies("u2");
    expect(from).toMatchObject({ kind: "unit", label: expect.stringContaining("60 cm") });
    const next = ok(withFormCopied(built.doc, from, to));
    const items = kitchenPlanIn(next, made.id)!.runs!.A!;
    expect(items.find((i) => i.id === "u2")).toMatchObject({ model: "base-bas-3-tiroirs", width: 450 });
    expect(() => parseDocument(next)).not.toThrow();
    // A base unit's form is no wall unit's; the unit itself: another one is asked for.
    expect(withFormCopied(built.doc, from, bodies("u3"))).toMatch(/bas.*haut/);
    expect(withFormCopied(built.doc, from, from)).toMatch(/autre/);
    // An appliance keeps its form: only the style of the doors goes.
    const framed = { ...kitchenPlanIn(built.doc, made.id)!.runs!.A!.find((i) => i.id === "u1")!, facade: { style: "frame" as const, frameWidth: 60 } };
    const sinkRuns = { A: [framed, { ...newItem([], "app-sink", 800), id: "u4" }] };
    const sinkDoc = withKitchenBuilt(built.doc, made.id, { runs: sinkRuns });
    if (typeof sinkDoc === "string") throw new Error(sinkDoc);
    const all = sinkDoc.doc.features.filter((f) => f.type === "cabinet").map((f) => formOf(sinkDoc.doc, `${f.id}#0`));
    const unit = (id: string) => all.find((s) => s?.kind === "unit" && s.at.item === id)!;
    const sink = kitchenPlanIn(ok(withFormCopied(sinkDoc.doc, unit("u1"), unit("u4"))), made.id)!.runs!.A!.find((i) => i.id === "u4");
    expect(sink).toMatchObject({ model: "app-sink", width: 800, facade: { style: "frame", frameWidth: 60 } });
  });

  it("un caisson prend les cotes d'un autre, à sa place ; des façades, la disposition et le style d'autres", () => {
    const cab = (id: string, x: number, width: number, shelves: number): CabinetFeature => ({ id, type: "cabinet", name: id, origin: [x, 0, 0], width, height: 720, depth: 560, thickness: 18, back: "none", backThickness: 3, shelves, plinth: 0, construction: "sides-through" });
    const front = (id: string, cabinet: string, extra: Partial<FrontsFeature>): FrontsFeature => ({ id, type: "fronts", name: id, cabinet, layout: "door", drawers: 0, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, ...extra });
    const doc = empty([cab("c1", 0, 800, 2), cab("c2", 1000, 400, 0), front("f1", "c1", { layout: "drawers", drawers: 4, style: "frame", frameWidth: 60 }), front("f2", "c2", {})]);
    const c1 = formOf(doc, "c1#0")!;
    const c2 = formOf(doc, "c2#3")!;
    expect(c2).toEqual({ kind: "cabinet", id: "c2", label: "c2" });
    const sized = ok(withFormCopied(doc, c1, c2));
    expect(findFeature(sized, "c2")).toMatchObject({ width: 800, shelves: 2, origin: [1000, 0, 0] });
    const fronted = ok(withFormCopied(doc, formOf(doc, "f1#0")!, formOf(doc, "f2#0")!));
    expect(findFeature(fronted, "f2")).toMatchObject({ cabinet: "c2", layout: "drawers", drawers: 4, style: "frame", frameWidth: 60 });
    // A cabinet is no fronts.
    expect(withFormCopied(doc, c1, formOf(doc, "f2#0")!)).toMatch(/style d'une porte/);
  });

  it("une niche prend les tiroirs d'une autre ; une porte donne son style à des tiroirs", () => {
    const niche = (id: string, fill: NicheFeature["fill"], extra: Partial<NicheFeature>): NicheFeature => ({ id, type: "niche", name: id, sketch: "sk1", partition: "o1", niche: [0], fill, diameter: 25, drop: 60, drawers: 2, gap: 3, thickness: 19, handles: true, ...extra });
    const doc = empty([niche("n1", "drawers", { drawers: 5, betweenGap: 4 }), niche("n2", "drawers", {}), niche("n3", "door", { style: "fluted", pitch: 30 }), niche("n4", "rod", {})]);
    const drawers = ok(withFormCopied(doc, formOf(doc, "n1#0")!, formOf(doc, "n2#0")!));
    expect(findFeature(drawers, "n2")).toMatchObject({ drawers: 5, betweenGap: 4 });
    const styled = ok(withFormCopied(doc, formOf(doc, "n3#0")!, formOf(doc, "n2#0")!));
    expect(findFeature(styled, "n2")).toMatchObject({ drawers: 2, style: "fluted", pitch: 30 });
    expect(withFormCopied(doc, formOf(doc, "n1#0")!, formOf(doc, "n4#0")!)).toMatch(/Penderie/);
  });
});
