/** Un tiroir s'ouvre d'un clic dans la vue : ses pièces ensemble, tirées du côté de sa façade. */
import { describe, expect, it } from "vitest";
import { drawerBodies } from "../../frontend/src/app/drawer-toggle";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature } from "../../frontend/src/document/types";
import { drawerNumber, drawerSlide } from "../../frontend/src/features/drawer-open";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function doc(fill: NicheFeature["fill"]): CadDocument {
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  const niche: NicheFeature = { id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk1", partition: "of1", niche: [1], fill, diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true };
  return { ...createReferencePlate(), features: [{ id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry }, niche] };
}

describe("ouvrir un tiroir dans la vue", () => {
  it("reconnaît le numéro du tiroir d'une pièce, même sous un nom de groupe", () => {
    expect(drawerNumber("Tiroirs 1 — Façade tiroir 2")).toBe(2);
    expect(drawerNumber("Tiroir 3 — côté gauche")).toBe(3);
    expect(drawerNumber("Tiroirs 1")).toBeNull();
    expect(drawerNumber("Étagère 2")).toBeNull();
  });

  it("toutes les pièces du même tiroir s'ouvrent ensemble, pas celles des autres ni d'une penderie", () => {
    const bodies = Array.from({ length: 18 }, (_, i) => `td1#${i}`);
    const drawer = drawerBodies(doc("drawers"), bodies, "td1#8");
    expect(drawer).toEqual({ key: "td1:2", bodies: ["td1#6", "td1#7", "td1#8", "td1#9", "td1#10", "td1#11"] });
    expect(drawerBodies(doc("rod"), ["td1#0", "td1#1"], "td1#0")).toBeNull();
    expect(drawerBodies(doc("drawers"), bodies, "sk1")).toBeNull();
  });

  it("glisse du fond vers la façade, de l'essentiel de sa profondeur", () => {
    // A front at y −400…−382 (the front of the dressing is towards −Y), the back at −28…−10.
    expect(drawerSlide([[0, -400, 0], [500, -382, 200]], [[18, -28, 18], [482, -10, 180]])).toEqual([0, expect.closeTo(-297.6), 0]);
    expect(drawerSlide([[0, 0, 0], [18, 400, 200]], [[400, 0, 0], [418, 400, 200]], 1)).toEqual([-400, 0, 0]);
  });
});
