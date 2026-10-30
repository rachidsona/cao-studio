/** Façades d'un caisson : portes et tiroirs aux bonnes cotes, quincaillerie comptée et usinée. */
import { beforeAll, describe, expect, it } from "vitest";
import { bodyLabel } from "../../frontend/src/document/operations";
import { createReferencePlate, type CabinetFeature, type CadDocument, type FrontsFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { frontsHardware, frontsMaterials, frontsParts } from "../../frontend/src/features/fronts-parts";
import { bodyMetrics } from "../../frontend/src/geometry/kernel";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const cabinet: CabinetFeature = { id: "cb1", type: "cabinet", name: "Caisson", origin: [0, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 100, construction: "sides-through" };
const fronts = (over: Partial<FrontsFeature> = {}): FrontsFeature => ({ id: "fr1", type: "fronts", name: "Façades", cabinet: "cb1", layout: "door", drawers: 3, mount: "overlay", gap: 3, thickness: 19, hinges: true, handles: true, ...over });
const size = (p: { from: number[]; to: number[] }) => p.to.map((v, i) => Number((v - p.from[i]!).toFixed(6)));

describe("façades", () => {
  it("une porte en applique couvre le caisson moins le demi-jeu, devant lui", () => {
    const [door] = frontsParts(fronts(), cabinet);
    expect(size(door!)).toEqual([597, 19, 617]);
    expect(door!.from[1]).toBe(-19);
  });

  it("deux portes encastrées tiennent dans l'ouverture, avec le jeu au milieu", () => {
    const parts = frontsParts(fronts({ layout: "doors", mount: "inset" }), cabinet);
    expect(parts.map((p) => p.name)).toEqual(["Porte gauche", "Porte droite"]);
    const [l, r] = parts.map(size);
    expect(l![0]! + r![0]! + 3 * 3).toBeCloseTo(600 - 2 * 18, 6);
    expect(l![2]).toBeCloseTo(720 - 100 - 2 * 18 - 2 * 3, 6);
  });

  it("trois tiroirs : façades égales et caissons sur coulisses de longueur du commerce", () => {
    const parts = frontsParts(fronts({ layout: "drawers" }), cabinet);
    expect(parts).toHaveLength(3 * 6);
    const facades = parts.filter((p) => p.role?.kind === "drawer").map(size);
    facades.forEach((f) => expect(f[2]).toBeCloseTo((617 - 2 * 3) / 3, 6));
    const side = parts.find((p) => p.name === "Tiroir 1 — côté gauche")!;
    expect(size(side)[1]).toBe(500); // depth 557 − 10 → 500 mm slides
    expect(frontsHardware(fronts({ layout: "drawers" }), cabinet)).toEqual([
      { name: "Coulisse de tiroir (paire)", quantity: 3 },
      { name: "Poignée entraxe 128 mm", quantity: 3 },
    ]);
  });

  it("dans le modèle : une porte percée de 2 boîtiers Ø35 et de 2 trous de poignée, nommée dans l'arbre", () => {
    const doc: CadDocument = { ...createReferencePlate(), features: [cabinet, fronts()] };
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    const r = new Recomputer();
    const { statuses, bodies } = r.recompute(doc);
    expect(statuses.find((s) => s.id === "fr1")?.state).toBe("ok");
    expect(bodyLabel(doc, "fr1#0")).toBe("Façades — Porte");
    expect(bodies).toContain("fr1#0");
    const out = r.output("fr1");
    const door = out?.kind === "solids" ? out.shapes[0]! : null;
    const removed = 597 * 19 * 617 - bodyMetrics(door!).volume;
    // Two Ø35 × 13 cups and two Ø5 holes through 19 mm (the drills go 0.005 mm further, for a clean cut).
    const expected = 2 * Math.PI * 17.5 ** 2 * 13 + 2 * Math.PI * 2.5 ** 2 * 19;
    expect(Math.abs(removed - expected)).toBeLessThan(20);
    expect(frontsHardware(fronts(), cabinet)[0]).toEqual({ name: "Charnière à boîtier Ø35", quantity: 2 });
  });
});

describe("matières des façades", () => {
  it("façades dans la matière du caisson, tiroirs en bouleau, fonds en HDF", () => {
    const m = frontsMaterials(fronts({ layout: "drawers", drawers: 1 }), cabinet, "melamine-oak");
    expect(m).toEqual(["melamine-oak", "birch-plywood", "birch-plywood", "birch-plywood", "birch-plywood", "hdf"]);
    expect(frontsMaterials(fronts(), cabinet)).toEqual(["melamine-white"]);
  });
});
