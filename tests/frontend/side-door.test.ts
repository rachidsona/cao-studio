/** Un meuble à deux portes : une de face, l'autre sur son côté gauche ou droit, ce côté sans panneau. */
import { describe, expect, it } from "vitest";
import { kitchenPlanIn, withKitchenBuilt, withKitchenPlan } from "../../frontend/src/document/kitchen-floor";
import { cabinetBox } from "../../frontend/src/document/kitchen-catalog";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { cabinetPartNames } from "../../frontend/src/features/cabinet-parts";
import { frontsCabinet, frontsParts } from "../../frontend/src/features/fronts-parts";
import { newItem } from "../../frontend/src/features/kitchen-run-items";
import { turnedBox } from "../../frontend/src/features/turn-clear";

const CAB: CabinetFeature = { id: "cb1", type: "cabinet", name: "Colonne", origin: [0, -580, 0], width: 600, height: 2150, depth: 580, thickness: 18, back: "applied", backThickness: 3, shelves: 4, plinth: 150, construction: "sides-through" };
/** A door's box in the model, as the fronts are turned with the cabinet they hang on. */
const doorBox = (f: FrontsFeature, c: CabinetFeature) => {
  const hung = frontsCabinet(f, c)!;
  const part = frontsParts(f, c).find((p) => p.role?.kind === "door")!;
  return turnedBox([part.from, part.to], hung.rotation ?? 0, hung.origin);
};

describe("porte de côté", () => {
  it("le côté choisi n'a plus de panneau, le dessus et le dessous vont jusqu'au bord", () => {
    expect(cabinetPartNames({ ...CAB, open: "right" })).not.toContain("Côté droit");
    expect(cabinetPartNames({ ...CAB, open: "right" })).toContain("Côté gauche");
    expect(cabinetPartNames({ ...CAB, open: "left" })).not.toContain("Côté gauche");
  });

  for (const rotation of [0, 90, 180, 270] as const)
    it(`la porte se pose sur le côté, dehors, sur toute la profondeur (caisson tourné de ${rotation}°)`, () => {
      const c = { ...CAB, rotation, open: "right" as const };
      const front: FrontsFeature = { id: "fr2", type: "fronts", name: "Porte de côté", cabinet: "cb1", layout: "door", side: "left", face: "right", drawers: 1, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true };
      const [lo, hi] = doorBox(front, c);
      const [blo, bhi] = cabinetBox(c);
      // Thin across the side, as long as the cabinet is deep, beside the box and touching it.
      const size = [0, 1].map((i) => hi[i]! - lo[i]!);
      expect(Math.min(...size)).toBeCloseTo(19, 3);
      expect(Math.max(...size)).toBeGreaterThan(550);
      const touches = [0, 1].some((i) => Math.abs(lo[i]! - bhi[i]!) < 1e-6 || Math.abs(hi[i]! - blo[i]!) < 1e-6);
      expect(touches).toBe(true);
    });

  it("à droite d'un caisson non tourné : contre son côté droit, du devant au fond ; à gauche, contre son côté gauche", () => {
    const front = (face: "left" | "right"): FrontsFeature => ({ id: "fr2", type: "fronts", name: "Porte de côté", cabinet: "cb1", layout: "door", side: face === "right" ? "left" : "right", face, drawers: 1, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true });
    const [rlo, rhi] = doorBox(front("right"), { ...CAB, open: "right" });
    expect([Math.round(rlo[0]!), Math.round(rhi[0]!)]).toEqual([600, 619]);
    expect(rlo[1]!).toBeGreaterThanOrEqual(-580 - 1e-6);
    expect(rhi[1]!).toBeLessThanOrEqual(0 + 1e-6);
    const [llo, lhi] = doorBox(front("left"), { ...CAB, open: "left" });
    expect([Math.round(llo[0]!), Math.round(lhi[0]!) + 0]).toEqual([-19, 0]);
  });

  it("dans le plan : « Porte de côté » d'un meuble lui donne une deuxième façade sur ce côté, ce côté ouvert", () => {
    const base = withKitchenPlan({ ...createReferencePlate(), features: [] } as CadDocument, { ...KITCHEN_PLAN, model: "I", lengthA: 3600, runs: {}, made: {} });
    const built = withKitchenBuilt(base.doc, base.id, { runs: { A: [{ ...newItem([], "tall-colonne-rangement", 600), sideDoor: "left" }] } });
    if (typeof built === "string") throw new Error(built);
    const cab = built.doc.features.find((f): f is CabinetFeature => f.type === "cabinet")!;
    const fronts = built.doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === cab.id);
    expect(cab.open).toBe("left");
    expect(fronts.map((f) => f.face ?? "front")).toEqual(["front", "left"]);
    // Hinged on its front edge: it opens towards the room.
    expect(fronts[1]!.side).toBe("right");
    expect(kitchenPlanIn(built.doc, base.id)!.runs!.A![0]!.sideDoor).toBe("left");
  });
});
