/** Blocages de l'éditeur signalés au serveur : au-delà d'une seconde, avec le dernier geste ; et un gros dressing
 * dont chaque corps est examiné à chaque clic (portes, tiroirs, accessoires) reste rapide. */
import { describe, expect, it } from "vitest";
import { accessoryOpening, doorsAmong, drawerBodies, drawersAmong } from "../../frontend/src/app/drawer-toggle";
import { bodyLabel } from "../../frontend/src/document/operations";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { nichePartsIn } from "../../frontend/src/features/niche-parts";
import { freezeReport } from "../../frontend/src/persistence/freeze-report";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

describe("blocages signalés", () => {
  it("une pause d'une seconde ou plus, avec sa durée et le geste d'avant", () => {
    expect(freezeReport(400, "Tiroirs (tiroirs)")).toBeNull();
    expect(freezeReport(1240, "clic dans la vue 3D")).toEqual({ message: "Blocage de l'éditeur après : clic dans la vue 3D", source: "1,2 s" });
    expect(freezeReport(3000, "")?.message).toBe("Blocage de l'éditeur après : aucun geste");
  });
});

/** Six walls of ten cases, each niche with five drawers and a door over it: about 2 000 bodies. */
function bigDressing(): { doc: CadDocument; bodies: string[] } {
  const input: PartitionParams = { length: 4000, height: 2400, thickness: 18, cases: 10, dividers: Array(9).fill("single"), boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
  const features: CadDocument["features"] = [];
  for (let w = 0; w < 6; w++) {
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord(`of${w}`, "Répartition", input, [0, 0], 600)] }, `of${w}`);
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    const sketch: SketchFeature = { id: `sk${w}`, type: "sketch", name: `Mur ${w}`, plane: "XZ", offset: w * 1000, ...rebuilt.geometry };
    features.push(sketch);
    for (let c = 0; c < 10; c++) {
      const base = { type: "niche" as const, sketch: sketch.id, partition: `of${w}`, niche: [c], diameter: 25, drop: 60, gap: 3, thickness: 18, handles: true };
      features.push({ ...base, id: `dr${w}-${c}`, name: `Tiroirs ${w}-${c}`, fill: "drawers", drawers: 5 } as NicheFeature);
      features.push({ ...base, id: `po${w}-${c}`, name: `Porte ${w}-${c}`, fill: "door", drawers: 3 } as NicheFeature);
    }
  }
  const doc: CadDocument = { ...createReferencePlate(), features };
  const bodies = features.filter((f): f is NicheFeature => f.type === "niche").flatMap((f) => nichePartsIn(features, f).map((_, i) => `${f.id}#${i}`));
  return { doc, bodies };
}

describe("un gros dressing reste rapide", () => {
  it("les noms, portes, tiroirs et accessoires de 2 000 corps en moins d'une demi-seconde", () => {
    const { doc, bodies } = bigDressing();
    expect(bodies.length).toBeGreaterThan(1500);
    const start = performance.now();
    // What a click in the view does: every body's name, every door, every drawer, then the body clicked.
    for (const id of bodies) bodyLabel(doc, id);
    const doors = doorsAmong(doc, bodies);
    const drawers = new Set(drawersAmong(doc, bodies).map((d) => d.key));
    for (const id of bodies.slice(0, 50)) {
      drawerBodies(doc, bodies, id);
      accessoryOpening(doc, bodies, id);
    }
    const spent = performance.now() - start;
    expect(doors.length).toBe(6 * 10);
    expect(drawers.size).toBe(6 * 10 * 5);
    // Before the parts of a niche were kept (commit 9c7d86e), this took several seconds.
    expect(spent).toBeLessThan(500);
  });
});
