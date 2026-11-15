/** « Modifier les portes… » : les portes d'un caisson réglées — une ou deux, pose, jeu, épaisseur, charnières, poignées. */
import { describe, expect, it } from "vitest";
import { withDoorsChanged } from "../../frontend/src/document/door-edit";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Bas", origin: [0, 0, 0], width: 800, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", side: "right", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts] };
const of = (d: CadDocument | string) => {
  if (typeof d === "string") throw new Error(d);
  return d.features.find((f) => f.id === "fr1") as FrontsFeature;
};

describe("modifier les portes d'un caisson", () => {
  it("passe à deux portes (sans sens à garder), encastrées, plus fines, sans poignées", () => {
    const two = of(withDoorsChanged(doc, "fr1", { layout: "doors" }));
    expect(two.layout).toBe("doors");
    expect(two.side).toBeUndefined();
    expect(of(withDoorsChanged(doc, "fr1", { mount: "inset", thickness: 16, handles: false, hinges: false }))).toMatchObject({ mount: "inset", thickness: 16, handles: false, hinges: false, side: "right" });
  });

  it("refuse une épaisseur nulle, des tiroirs, une porte qui n'existe plus", () => {
    expect(withDoorsChanged(doc, "fr1", { thickness: 0 })).toMatch(/épaisseur/);
    expect(withDoorsChanged({ ...doc, features: [cabinet, { ...fronts, layout: "drawers" }] }, "fr1", { gap: 2 })).toMatch(/n'existent plus/);
    expect(withDoorsChanged(doc, "zz", { gap: 2 })).toMatch(/n'existent plus/);
  });
});
