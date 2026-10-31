/** Penderie and Tiroirs in a niche of a Répartition: the parts, their place in the world, the hardware, the checks. */
import { describe, expect, it } from "vitest";
import { isHardwareBody, modelHardware } from "../../frontend/src/document/hardware";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { nicheGeometry, nicheHardware, nicheParts, nicheProblem, worldBox, nicheWorld } from "../../frontend/src/features/niche-parts";
import { withEquipment } from "../../frontend/src/document/equipment";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

/** A Répartition of 2 cases, 1000 × 2000, its panels 400 deep, in the front plane. */
function sketch(depth: number | null = 400): SketchFeature {
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], depth ?? undefined)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
}

const rod = (patch: Partial<NicheFeature> = {}): NicheFeature => ({
  id: "pd1", type: "niche", name: "Penderie 1", sketch: "sk1", partition: "of1", niche: [0], fill: "rod",
  diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true, ...patch,
});
const drawers = (patch: Partial<NicheFeature> = {}): NicheFeature => rod({ id: "td1", name: "Tiroirs 1", niche: [1], fill: "drawers", ...patch });

const doc = (...features: NicheFeature[]): CadDocument => ({ ...createReferencePlate(), features: [sketch(), ...features] });

describe("équipement d'une niche", () => {
  it("trouve la niche de la répartition, avec la profondeur de ses panneaux", () => {
    const n = nicheGeometry(rod(), sketch());
    expect(n).toMatchObject({ depth: 400, box: { x0: 18, x1: 491, y0: 18, y1: 1982 } });
  });

  it("refuse une niche disparue ou une répartition non extrudée", () => {
    expect(nicheGeometry(rod({ niche: [5] }), sketch())).toBe("Sa niche n'existe plus.");
    expect(nicheGeometry(rod(), sketch(null))).toMatch(/pas extrudés/);
    expect(nicheGeometry(rod({ partition: "of9" }), sketch())).toMatch(/n'existe plus/);
  });

  it("penderie : une tringle d'un côté à l'autre, à mi-profondeur, sous le haut, entre deux supports", () => {
    const n = nicheGeometry(rod(), sketch());
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(rod(), n);
    expect(parts.map((p) => p.name)).toEqual(["Tringle", "Support gauche", "Support droit"]);
    const [bar] = parts;
    expect(bar).toMatchObject({ kind: "rod", from: [21, 1922, 200], to: [488, 1922, 200], radius: 12.5, role: "hardware" });
    // The front plane: x stays, the sketch's y is the height (z), the depth goes along −Y.
    expect(nicheWorld(n, bar!.from)).toEqual([21, -200, 1922]);
  });

  it("tiroirs : façades encastrées au nu des panneaux, caissons derrière sur coulisses du commerce", () => {
    const n = nicheGeometry(drawers(), sketch());
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(drawers(), n);
    expect(parts).toHaveLength(3 * 6);
    const fronts = parts.filter((p) => p.role === "front");
    expect(fronts.map((p) => p.name)).toEqual(["Façade tiroir 1", "Façade tiroir 2", "Façade tiroir 3"]);
    const h = (1964 - 4 * 3) / 3;
    expect(fronts[0]!.to[1] - fronts[0]!.from[1]).toBeCloseTo(h);
    expect(fronts[0]!.to[1]).toBeCloseTo(1982 - 3); // the top drawer first, a gap under the top
    expect([fronts[0]!.from[2], fronts[0]!.to[2]]).toEqual([382, 400]);
    const side = parts.find((p) => p.name === "Tiroir 1 — côté gauche")!;
    expect(side.to[2] - side.from[2]).toBe(350); // 400 − 18 − 10 = 372: the 350 slide
    // In the world, the fronts are at the front of the panels (y from −400 to −382).
    const [a, b] = worldBox(n, fronts[0]!);
    expect([a[1], b[1]]).toEqual([-400, -382]);
  });

  it("tiroirs : un jeu dessus/dessous entre les façades, un autre jeu sur leurs côtés", () => {
    const n = nicheGeometry(drawers(), sketch());
    if (typeof n === "string") throw new Error(n);
    const fronts = nicheParts(drawers({ gap: 4, sideGap: 2 }), n).filter((p) => p.role === "front");
    // The second niche: 509…982 across, 18…1982 high.
    expect([fronts[0]!.from[0], fronts[0]!.to[0]]).toEqual([511, 980]);
    expect(fronts[0]!.to[1]).toBeCloseTo(1982 - 4);
    expect(fronts[0]!.from[1] - fronts[1]!.to[1]).toBeCloseTo(4);
    // Older drawers, one gap all round.
    const old = nicheParts(drawers({ gap: 3 }), n).find((p) => p.role === "front")!;
    expect([old.from[0], old.to[0]]).toEqual([512, 979]);
    expect(nicheProblem(drawers({ sideGap: -1 }), n)).toMatch(/négatif/);
    expect(nicheProblem(drawers({ sideGap: 300 }), n)).toMatch(/jeu de côté/);
  });

  it("dit pourquoi une niche ne peut pas être équipée", () => {
    const n = nicheGeometry(rod(), sketch());
    if (typeof n === "string") throw new Error(n);
    expect(nicheProblem(rod({ drop: 10 }), n)).toMatch(/sous le haut/);
    expect(nicheProblem(rod({ drop: 2000 }), n)).toMatch(/sous le bas/);
    expect(nicheProblem(rod({ diameter: 80 }), n)).toMatch(/10 à 50/);
    expect(nicheProblem(drawers({ drawers: 9 }), n)).toMatch(/1 à 8/);
    expect(nicheProblem(drawers({ drawers: 8, gap: 200 }), n)).toMatch(/trop basse/);
    expect(nicheProblem(rod(), n)).toBeNull();
  });

  it("compte la tringle au mètre et ses supports, les coulisses et poignées des tiroirs ; la tringle n'est pas débitée", () => {
    const d = doc(rod(), drawers());
    expect(nicheHardware(d.features, rod())).toEqual([
      { name: "Tringle de penderie Ø25 (m)", quantity: 0.47, unit: "m" },
      { name: "Support de tringle", quantity: 2 },
    ]);
    expect(modelHardware(d)).toEqual(
      expect.arrayContaining([
        { name: "Tringle de penderie Ø25 (m)", quantity: 0.47, unit: "m" },
        { name: "Coulisse de tiroir (paire)", quantity: 3 },
        { name: "Poignée entraxe 128 mm", quantity: 3 },
      ]),
    );
    expect(isHardwareBody(d, "pd1#0")).toBe(true);
    expect(isHardwareBody(d, "pd1#2")).toBe(true);
    expect(isHardwareBody(d, "td1#0")).toBe(false);
  });

  it("met les caissons de tiroir en contreplaqué et leurs fonds en HDF ; le document reste valide", () => {
    const d = withEquipment(doc(), [drawers()]);
    expect(d.features.at(-1)?.id).toBe("td1");
    expect(d.bodyInfo?.["td1#0"]?.material).toBeUndefined(); // the front: the panels' material
    expect(d.bodyInfo?.["td1#1"]?.material).toBe("birch-plywood");
    expect(d.bodyInfo?.["td1#5"]?.material).toBe("hdf");
    expect(() => parseDocument(JSON.parse(JSON.stringify(d)))).not.toThrow();
    expect(() => parseDocument({ ...d, features: [...d.features, { ...rod(), id: "pd9", fill: "shelf" }] })).toThrow(/équipement inconnu/);
  });
});
