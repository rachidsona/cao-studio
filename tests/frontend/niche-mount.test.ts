/** La pose des façades : une porte sur niches encastrée dans ses niches, des façades de tiroirs en applique devant les panneaux. */
import { describe, expect, it } from "vitest";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { INNER_SET_BACK, INNER_SPACER, INNER_SPACERS, nicheGeometry, nicheHardware, nicheParts, nicheProblem } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

/** Two cases, 1000 × 2000, 400 deep: the right one's niche is 509…982 × 18…1982. */
function sketch(): SketchFeature {
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition 2 cases", INPUT, [0, 0], 400)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
}

const equip = (patch: Partial<NicheFeature>): NicheFeature => ({
  id: "n1", type: "niche", name: "Tiroirs 1", sketch: "sk1", partition: "of1", niche: [1], fill: "drawers",
  diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: false, ...patch,
});

const partsOf = (f: NicheFeature) => {
  const n = nicheGeometry(f, sketch());
  if (typeof n === "string") throw new Error(n);
  expect(nicheProblem(f, n)).toBeNull();
  return nicheParts(f, n);
};

describe("pose des façades", () => {
  it("une porte sur niches encastrée : dans la niche, un jeu tout autour, sa face au nu des panneaux", () => {
    const [door] = partsOf(equip({ fill: "door", name: "Porte 1", gap: 4, thickness: 19, mount: "inset" }));
    expect(door).toMatchObject({ name: "Porte 1", role: "front", from: [513, 22, 381], to: [978, 1978, 400] });
    // En applique (as before): over half the side between the cases, the whole outer side, in front of the panels.
    const [over] = partsOf(equip({ fill: "door", name: "Porte 1", gap: 4, thickness: 19 }));
    expect(over).toMatchObject({ from: [502, 2, 400], to: [998, 1998, 419] });
  });

  it("des tiroirs en applique : façades devant les panneaux, sur la moitié du côté entre les cases ; les caissons restent dans la niche", () => {
    const parts = partsOf(equip({ mount: "overlay" }));
    const fronts = parts.filter((p) => p.role === "front");
    expect(fronts).toHaveLength(3);
    const h = (2000 - 1.5 - 1.5 - 2 * 3) / 3;
    expect(fronts[0]!.from[0]).toBe(501.5);
    expect(fronts[0]!.to[0]).toBe(998.5);
    expect(fronts[0]!.to[1]).toBe(1998.5);
    expect(fronts[0]!.to[1] - fronts[0]!.from[1]).toBeCloseTo(h, 6);
    expect(fronts[2]!.from[1]).toBeCloseTo(1.5, 6);
    for (const f of fronts) expect([f.from[2], f.to[2]]).toEqual([400, 418]);
    // Every box behind its front, inside the niche (509…982 × 18…1982), and behind the panels' front.
    for (const p of parts.filter((x) => !x.role)) {
      expect(p.from[0]).toBeGreaterThanOrEqual(509);
      expect(p.to[0]).toBeLessThanOrEqual(982);
      expect(p.from[1]).toBeGreaterThanOrEqual(18);
      expect(p.to[1]).toBeLessThanOrEqual(1982);
      expect(p.to[2]).toBeLessThanOrEqual(400);
    }
    // Encastrées (as before): in the niche, flush with the panels.
    const inset = partsOf(equip({})).filter((p) => p.role === "front");
    expect(inset[0]).toMatchObject({ from: [512, expect.any(Number), 382], to: [979, 1979, 400] });
  });

  it("des tiroirs à l'anglaise : devants en retrait derrière la porte, caissons sur cales passé les platines, sans poignée", () => {
    const f = equip({ inner: true, mount: "inset", handles: true });
    const parts = partsOf(f);
    const fronts = parts.filter((p) => p.role === "front");
    expect(fronts).toHaveLength(3);
    // In the niche (509…982), within the spacers and the side gap; set back behind the face of the panels (w = 400).
    for (const front of fronts) expect(front).toMatchObject({ from: [509 + INNER_SPACER + 3, expect.any(Number), 400 - INNER_SET_BACK - 18], to: [982 - INNER_SPACER - 3, expect.any(Number), 400 - INNER_SET_BACK] });
    const spacers = parts.filter((p) => p.name.startsWith("Cale "));
    expect(spacers).toHaveLength(6);
    expect(spacers.every((p) => p.role === "hardware")).toBe(true);
    expect(spacers[0]!.from[0]).toBe(509);
    expect(spacers[0]!.to[0]).toBe(509 + INNER_SPACER);
    // The boxes clear the spacers, and no handle: a notch.
    const left = parts.find((p) => p.name === "Tiroir 1 — côté gauche")!;
    expect(left.from[0]).toBeGreaterThanOrEqual(509 + INNER_SPACER);
    expect(left.to[2]).toBeLessThan(400 - INNER_SET_BACK - 18);
    expect(parts.some((p) => p.kind === "handle")).toBe(false);
    // The quote: slides and spacers, no handles.
    const doc = [sketch(), { ...f, id: "n1" }];
    expect(nicheHardware(doc, f)).toEqual([{ name: "Coulisse de tiroir (paire)", quantity: 3 }, { name: INNER_SPACERS, quantity: 3 }]);
    // Too shallow once set back.
    const n = nicheGeometry(f, sketch());
    if (typeof n === "string") throw new Error(n);
    expect(nicheProblem(f, { ...n, depth: 180 })).toBe("La niche n'est pas assez profonde pour des tiroirs.");
    expect(nicheProblem({ ...f, inner: undefined }, { ...n, depth: 180 })).toBeNull();
  });

  it("le document garde la pose, et refuse une pose inconnue", () => {
    const doc = (mount: unknown) => JSON.parse(JSON.stringify({ ...createReferencePlate(), features: [sketch(), { ...equip({}), mount }] }));
    expect(() => parseDocument(doc("overlay"))).not.toThrow();
    expect(() => parseDocument(doc("dehors"))).toThrow(/pose des façades inconnue/);
  });
});
