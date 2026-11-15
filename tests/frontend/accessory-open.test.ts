/** Accessoires sortis au clic : ce qui bouge pour chaque modèle, et comment. */
import { describe, expect, it } from "vitest";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { accessoryOpening } from "../../frontend/src/app/drawer-toggle";
import { ACCESSORIES, accessoryParts, SET_BACK } from "../../frontend/src/features/accessory-parts";
import { accessoryMoves } from "../../frontend/src/features/accessory-open";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const niche = (m: (typeof ACCESSORIES)[number]) => {
  const width = Math.min(m.width[1], Math.max(m.width[0], 500));
  return { box: { x0: 100, x1: 100 + width, y0: 50, y1: 50 + m.height + 200 }, depth: m.depth + SET_BACK + 30 };
};

describe("accessoires sortis au clic", () => {
  it("tous les modèles bougent ; chaque pièce une seule fois", () => {
    for (const m of ACCESSORIES) {
      const n = niche(m);
      const parts = accessoryParts({ accessory: { model: m.id, lift: m.hung ? 0 : 100 }, thickness: 18 }, n);
      const moves = accessoryMoves(m.id, parts, n);
      const moved = moves.flatMap((x) => x.parts);
      expect(moved.length, m.id).toBeGreaterThan(0);
      expect(new Set(moved).size, m.id).toBe(moved.length);
      expect(moves.every((x) => x.slide || x.turn), m.id).toBe(true);
    }
  });

  it("un panier glisse vers l'avant, ses coulisses restent", () => {
    const m = ACCESSORIES.find((x) => x.id === "basket-wardrobe")!;
    const n = niche(m);
    const parts = accessoryParts({ accessory: { model: m.id, lift: 0 }, thickness: 18 }, n);
    const [move] = accessoryMoves(m.id, parts, n);
    expect(move!.slide).toEqual([0, 0, expect.closeTo(320, 6)]);
    expect(move!.parts.map((i) => parts[i]!.name)).not.toContain("Coulisse gauche");
    expect(move!.parts.length).toBe(parts.length - 2);
  });

  it("la penderie escamotable descend devant la niche ; les demi-lunes pivotent autour de leur montant", () => {
    const pd = ACCESSORIES.find((x) => x.id === "pulldown")!;
    const n = niche(pd);
    const [down] = accessoryMoves(pd.id, accessoryParts({ accessory: { model: pd.id, lift: 0 }, thickness: 18 }, n), n);
    expect(down!.slide![1]).toBeLessThan(0);
    expect(down!.slide![2]).toBeGreaterThan(n.depth / 2);
    const hm = ACCESSORIES.find((x) => x.id === "halfmoon")!;
    const h = niche(hm);
    const parts = accessoryParts({ accessory: { model: hm.id, lift: 0 }, thickness: 18 }, h);
    const [turn] = accessoryMoves(hm.id, parts, h);
    expect(turn!.turn!.angle).toBe(90);
    expect(turn!.parts.map((i) => parts[i]!.name)).not.toContain("Montant pivot");
    // The carousel's trays turn on their pole, with a grip each.
    const cr = ACCESSORIES.find((x) => x.id === "carousel")!;
    const c = niche(cr);
    const tray = accessoryParts({ accessory: { model: cr.id, lift: 0 }, thickness: 18 }, c);
    const [spin] = accessoryMoves(cr.id, tray, c);
    expect(spin!.turn!.angle).toBe(120);
    expect(spin!.parts.map((i) => tray[i]!.name)).toEqual(expect.arrayContaining(["Plateau 1", "Poignée 1", "Poignée 2"]));
    expect(spin!.parts.map((i) => tray[i]!.name)).not.toContain("Axe");
  });

  it("dans le document : les corps et leur pose ; un range-couverts dans un tiroir ouvre son tiroir", () => {
    const input: PartitionParams = { length: 1000, height: 2000, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };
    const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition 2 cases", input, [0, 0], 500)] }, "of1");
    if (typeof rebuilt === "string") throw new Error(rebuilt);
    const sketch: SketchFeature = { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
    const base = { type: "niche" as const, sketch: "sk1", partition: "of1", diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true };
    const basket: NicheFeature = { ...base, id: "ac1", name: "Panier 1", niche: [0], fill: "accessory", accessory: { model: "basket-wardrobe", lift: 200 } };
    const doc: CadDocument = { ...createReferencePlate(), features: [sketch, basket] };
    const bodies = Array.from({ length: 12 }, (_, i) => `ac1#${i}`);
    const open = accessoryOpening(doc, bodies, "ac1#3");
    expect(open?.key).toBe("ac1");
    expect(open?.bodies.length).toBe(5);
    // The front plane: the niche's front towards −Y.
    const pose = open!.pose!(1, open!.bodies[0]!);
    expect(pose.translation[1]).toBeLessThan(-300);
    expect(accessoryOpening(doc, bodies, "sk1")).toBeNull();
  });
});
