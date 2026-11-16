/** La quincaillerie choisie par des règles : charnières selon le poids et la hauteur des portes. */
import { describe, expect, it } from "vitest";
import { modelHardware, stampHinges } from "../../frontend/src/document/hardware";
import { doorProblems } from "../../frontend/src/document/hardware-rules";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { frontsHoleCount } from "../../frontend/src/features/fronts-drillings";
import { hingeCount, hingesFor } from "../../frontend/src/features/fronts-parts";

const COLUMN: CabinetFeature = { id: "cb1", type: "cabinet", name: "Colonne", origin: [0, 0, 0], width: 600, height: 2100, depth: 560, thickness: 19, back: "applied", backThickness: 3, shelves: 4, plinth: 100, construction: "sides-through" };
const DOOR: FrontsFeature = { id: "fr1", type: "fronts", name: "Porte", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: false };
const doc = (patch: Partial<CadDocument> = {}, ...features: CadDocument["features"]): CadDocument => ({ ...createReferencePlate(), features, ...patch });
const hinges = (d: CadDocument) => modelHardware(d).find((h) => /Charnière/.test(h.name))?.quantity ?? 0;

describe("charnières selon le poids", () => {
  it("une porte lourde en a plus que sa hauteur n'en demande", () => {
    expect(hingesFor(2000)).toBe(hingeCount(2000));
    expect(hingesFor(2000, 30)).toBe(7);
    expect(hingesFor(700, 5)).toBe(2);
  });

  it("le devis, les perçages et le contrôle comptent les mêmes charnières", () => {
    // A light door (white melamine): its height decides; a solid oak one, 40 mm thick: its weight.
    const light = doc({}, COLUMN, DOOR);
    const heavy = doc({ bodyInfo: { "fr1#0": { material: "solid-oak" } } }, COLUMN, { ...DOOR, thickness: 40 });
    expect(hinges(light)).toBe(4);
    const many = hinges(heavy);
    expect(many).toBeGreaterThan(4);
    const stamped = stampHinges(heavy).features.find((f): f is FrontsFeature => f.type === "fronts")!;
    expect(stamped.hingeCounts?.[0]).toBe(many);
    expect(stampHinges(light).features.find((f) => f.type === "fronts")).not.toHaveProperty("hingeCounts");
    expect(frontsHoleCount(stamped, COLUMN)).toBe(many);
    // As many as it needs: no more « too heavy for its hinges ».
    expect(doorProblems(heavy).some((p) => /charnières : il en faudrait/.test(p.message))).toBe(false);
  });
});
