/** Familles de corps du menu « Affichage » (porté de poly_3D) : façades, carcasse, fonds, étagères, plinthes, pièce… */
import { describe, expect, it } from "vitest";
import { bodyFamily, visibleByFamily, WORK_VIEW_HIDDEN } from "../../frontend/src/document/display-families";
import { addLayer } from "../../frontend/src/document/layers";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type TrimFeature } from "../../frontend/src/document/types";

function doc(): CadDocument {
  const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson 1", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
  const fronts: FrontsFeature = { id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "drawers", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: false, handles: true };
  const trim: TrimFeature = { id: "tr1", type: "trim", name: "Finitions", parts: [{ name: "Plinthe", from: [0, 0, 0], to: [600, 16, 100] }, { name: "Joue gauche", from: [-18, 0, 0], to: [0, 560, 720] }] };
  const niche: NicheFeature = { id: "ni1", type: "niche", name: "Penderie", sketch: "sk1", partition: "pa1", niche: [0], fill: "rod", diameter: 25, drop: 60, drawers: 0, gap: 2, thickness: 18, handles: false };
  let d: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts, trim, niche, { id: "ex9", type: "extrude", name: "Étagère 2", sketch: "sk9", distance: 18, operation: "new" }, { id: "ex8", type: "extrude", name: "Mur A", sketch: "sk8", distance: 2500, operation: "new" }, { id: "ex7", type: "extrude", name: "Hotte", sketch: "sk7", distance: 100, operation: "new" }] };
  const { doc: withLayer, id } = addLayer(d, "Électroménager");
  d = { ...withLayer, bodyInfo: { ex8: { room: true }, ex7: { layer: id } }, bodyNames: { ex9: "Étagère 2", ex8: "Mur A", ex7: "Hotte" } };
  return d;
}

describe("famille d'un corps", () => {
  const d = doc();
  it("range les pièces d'un caisson par leur nom", () => {
    // cabinet parts: 0 Côté gauche, 1 Côté droit, 2 Dessous, 3 Dessus, 4 Fond, 5 Étagère 1 (features/cabinet-parts.ts order may differ: by name).
    const families = [0, 1, 2, 3, 4, 5].map((i) => bodyFamily(d, `cb1#${i}`));
    expect(families.filter((f) => f === "carcass").length).toBe(4);
    expect(families).toContain("backs");
    expect(families).toContain("shelves");
  });
  it("met les façades, les tiroirs et leurs côtés dans les façades", () => {
    expect(bodyFamily(d, "fr1#0")).toBe("fronts");
    expect(bodyFamily(d, "fr1#4")).toBe("fronts");
  });
  it("sépare les plinthes des autres finitions, la tringle du reste", () => {
    expect(bodyFamily(d, "tr1#0")).toBe("plinths");
    expect(bodyFamily(d, "tr1#1")).toBe("carcass");
    expect(bodyFamily(d, "ni1#0")).toBe("other");
  });
  it("reconnaît une étagère de Répartition, un mur de la pièce et l'électroménager de son calque", () => {
    expect(bodyFamily(d, "ex9")).toBe("shelves");
    expect(bodyFamily(d, "ex8")).toBe("room");
    expect(bodyFamily(d, "ex7")).toBe("appliances");
  });
});

describe("vue de travail", () => {
  it("cache les façades, les murs et l'électroménager, garde la carcasse", () => {
    const d = doc();
    const visible = visibleByFamily(d, ["cb1#0", "fr1#0", "ex8", "ex7", "ex9"], new Set(WORK_VIEW_HIDDEN));
    expect([...visible]).toEqual([["cb1#0", true], ["fr1#0", false], ["ex8", false], ["ex7", false], ["ex9", true]]);
  });
});
