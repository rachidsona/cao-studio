/** Une porte sur niches qui s'ouvre vers le haut (relevable, sur compas) ou vers le bas (abattant). */
import { describe, expect, it } from "vitest";
import { doorSwing } from "../../frontend/src/app/drawer-toggle";
import { doorOf, withDoorFlipped, withDoorHinge } from "../../frontend/src/document/door-edit";
import { emptySketchGeometry, type PartitionParams } from "../../frontend/src/document/sketch";
import { createReferencePlate, type CadDocument, type NicheFeature, type SketchFeature } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";
import { FLAP_STAY } from "../../frontend/src/features/fronts-parts";
import { nicheGeometry, nicheHardware, nicheParts } from "../../frontend/src/features/niche-parts";
import { partitionRecord, rebuildChain } from "../../frontend/src/sketcher/partition-history";

const INPUT: PartitionParams = { length: 1000, height: 800, thickness: 18, cases: 2, dividers: ["single"], boards: true, plinth: 0, outer: "board", single: "board", double: "board" };

function sketch(): SketchFeature {
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [partitionRecord("of1", "Répartition", INPUT, [0, 0], 400)] }, "of1");
  if (typeof rebuilt === "string") throw new Error(rebuilt);
  return { id: "sk1", type: "sketch", name: "Esquisse 1", plane: "XZ", offset: 0, ...rebuilt.geometry };
}
const door = (hinge: "left" | "top" | "bottom"): NicheFeature => ({
  id: "pn1", type: "niche", name: "Porte 1", sketch: "sk1", partition: "of1", niche: [1], fill: "door",
  diameter: 25, drop: 60, drawers: 3, gap: 3, thickness: 18, handles: true, hinges: [hinge],
});
const docWith = (f: NicheFeature): CadDocument => ({ ...createReferencePlate(), features: [sketch(), f] }) as unknown as CadDocument;

describe("porte sur niches vers le haut ou le bas", () => {
  it("relevable : la poignée couchée en travers, près du bas ; les charnières en haut et une paire de compas", () => {
    const f = door("top");
    const n = nicheGeometry(f, sketch());
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(f, n);
    expect(parts[0]).toMatchObject({ name: "Porte 1", role: "front", handle: "bottom" });
    const handle = parts.find((p) => p.kind === "handle")!;
    // Across: the same height at both ends, near the bottom edge of the door.
    expect(handle.from[1]).toBe(handle.to[1]);
    expect(handle.to[0] - handle.from[0]).toBe(128);
    expect(handle.from[1]).toBeLessThan(parts[0]!.from[1] + 60);
    const hw = nicheHardware([sketch(), f], f);
    expect(hw.some((h) => h.name.startsWith("Compas de porte relevable"))).toBe(true);
    expect(hw.find((h) => h.name === "Charnière à boîtier Ø35")?.quantity).toBe(2);
  });

  it("abattant : un compas d'abattant, la poignée près du haut ; la porte tourne autour de son bas, vers l'avant", () => {
    const f = door("bottom");
    const n = nicheGeometry(f, sketch());
    if (typeof n === "string") throw new Error(n);
    const parts = nicheParts(f, n);
    expect(parts[0]!.handle).toBe("top");
    expect(nicheHardware([sketch(), f], f).find((h) => h.name === FLAP_STAY)?.quantity).toBe(1);
    // About a horizontal axis (x for a sketch in XZ), its pivot at the bottom edge of the door.
    const swing = doorSwing(docWith(f), "pn1#0");
    expect(swing?.axis).toBe(0);
    expect(swing && Math.abs(swing.angle)).toBe(90);
    const lift = doorSwing(docWith(door("top")), "pn1#0");
    expect(lift?.axis).toBe(0);
    expect(lift && Math.abs(lift.angle)).toBe(100);
    expect(lift!.pivot[2]).toBeGreaterThan(swing!.pivot[2]);
    // On a side, as before: about the vertical.
    expect(doorSwing(docWith(door("left")), "pn1#0")?.axis).toBe(2);
  });

  it("le menu de la porte : vers le haut, l'autre côté (vers le bas), de nouveau sur le côté ; et le document l'accepte", () => {
    let doc = withDoorHinge(docWith(door("left")), "pn1#0", "top") as CadDocument;
    expect(doorOf(doc, "pn1#0")).toMatchObject({ kind: "niche", hinge: null, lift: "top" });
    doc = withDoorFlipped(doc, "pn1#0") as CadDocument;
    expect(doorOf(doc, "pn1#0")).toMatchObject({ lift: "bottom" });
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    doc = withDoorHinge(doc, "pn1#0", "left") as CadDocument;
    expect(doorOf(doc, "pn1#0")).toMatchObject({ hinge: "left", lift: null });
  });
});
