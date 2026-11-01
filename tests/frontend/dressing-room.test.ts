/** Dressing dans une pièce relevée, portes battantes ou coulissantes, accessoires et hauteurs hors de portée. */
import { beforeAll, describe, expect, it } from "vitest";
import { DRESSING, dressingDocument, type DressingSettings } from "../../frontend/src/document/dressing-plan";
import { modelHardware } from "../../frontend/src/document/hardware";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature, type TrimFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { nicheGeometry, nicheParts, worldBox } from "../../frontend/src/features/niche-parts";
import { roomRuns } from "../../frontend/src/features/room-runs";
import { Recomputer } from "../../frontend/src/history/recompute";
import { setupKernel } from "./kernel-setup";

beforeAll(setupKernel);

const empty = (): CadDocument => ({ ...createReferencePlate(), features: [] });
const settings = (patch: Partial<DressingSettings> = {}): DressingSettings => ({ ...structuredClone(DRESSING), ...patch });

describe("dressing : pièce, portes, accessoires", () => {
  it("posé contre le mur B d'une pièce : tourné, ses façades vers la pièce", () => {
    const room = { walls: [{ length: 3000, angle: 90 }, { length: 2400, angle: 90 }, { length: 3000, angle: 90 }, { length: 2400, angle: 90 }], height: 2500, thickness: 200, obstacles: [] };
    const runs = roomRuns(room, 1, "I");
    if (typeof runs === "string") throw new Error(runs);
    const s = settings({ lengthA: 2400, programs: { A: ["shelves", "drawers"], B: [], C: [] } });
    const { doc, problems } = dressingDocument(empty(), s, runs.place);
    expect(problems).toEqual([]);
    // No walls drawn (the room has its own); the sketch on the room's wall B: X = 3000, facing −X.
    expect(doc.features.some((f) => f.type === "extrude" && /^Mur /.test(f.name))).toBe(false);
    const sketch = doc.features.find((f): f is SketchFeature => f.type === "sketch")!;
    expect(sketch.frame).toMatchObject({ origin: [3000, 0, 0], normal: [-1, 0, 0] });
    const drawers = doc.features.find((f): f is NicheFeature => f.type === "niche" && f.fill === "drawers")!;
    const n = nicheGeometry(drawers, sketch);
    if (typeof n === "string") throw new Error(n);
    const [lo, hi] = worldBox(n, nicheParts(drawers, n).find((p) => p.role === "front")!);
    expect(lo[0]).toBeGreaterThanOrEqual(2400 - 1e-6);
    expect(hi[0]).toBeLessThanOrEqual(2418 + 1e-6);
    expect(lo[1]).toBeLessThan(0);
    expect(hi[1]).toBeGreaterThan(-2400);
  });

  it("une hauteur plus basse sous un rampant, un mur borné avant une porte", () => {
    const s = settings({ layout: "L", lengthA: 3000, lengthB: 2500, free: { B: [600, 1800] }, heights: { B: 1900 }, programs: { A: ["long", "shelves"], B: ["shelves", "drawers"], C: [] } });
    const { doc, problems, notes } = dressingDocument(empty(), s);
    expect(problems).toEqual([]);
    const b = doc.features.find((f): f is SketchFeature => f.type === "sketch" && f.name === "Dressing — mur B")!;
    expect(b.offsets![0]!.step).toMatchObject({ input: { height: 1900, length: 1200 } });
    expect(notes.join(" ")).toMatch(/Mur B : hauteur ramenée à 190 cm/);
  });

  it("portes battantes : l'équipement Portes de chaque répartition", () => {
    const { doc } = dressingDocument(empty(), settings({ doors: "hinged", programs: { A: ["long", "shelves", "drawers"], B: [], C: [] } }));
    const doors = doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.fill === "doors");
    expect(doors).toHaveLength(1);
    const sketch = doc.features.find((f): f is SketchFeature => f.type === "sketch")!;
    expect(sketch.offsets![0]!.step).toMatchObject({ doors: { gap: 3, thickness: 18 } });
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it("portes coulissantes, porte-pantalons et penderie escamotable au devis ; tringle trop haute signalée", () => {
    const s = settings({ doors: "sliding", programs: { A: ["long", "trousers", "shoes"], B: [], C: [] } });
    const without = dressingDocument(empty(), s);
    expect(without.notes.join(" ")).toMatch(/hors de portée/);
    const { doc, notes } = dressingDocument(empty(), { ...s, pullDown: true });
    const trim = doc.features.find((f): f is TrimFeature => f.type === "trim")!;
    expect(trim.parts.filter((p) => p.name.startsWith("Porte coulissante"))).toHaveLength(3);
    expect(notes.join(" ")).toMatch(/Porte-pantalons coulissant/);
    const hw = modelHardware(doc);
    expect(hw).toEqual(expect.arrayContaining([{ name: "Porte-pantalons coulissant", quantity: 1 }, { name: "Penderie escamotable", quantity: 1 }, { name: "Rail de porte coulissante", quantity: 6, unit: "m" }]));
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    const { statuses } = new Recomputer().recompute(doc);
    expect(statuses.filter((st) => st.state !== "ok").map((st) => `${st.id} ${st.message}`)).toEqual([]);
  });
});
