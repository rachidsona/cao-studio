/** La pipette d'Apparence : l'apparence d'un corps, telle que la vue la montre, donnée à d'autres. */
import { describe, expect, it } from "vitest";
import { bodyAppearance, withLookCopied } from "../../frontend/src/appearance/assign";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";

const doc = (bodyInfo: CadDocument["bodyInfo"]): CadDocument => ({ ...createReferencePlate(), bodyInfo });
const face = { normal: [0, 0, 1] as [number, number, number], rel: [0.5, 0.5, 1] as [number, number, number], appearance: "melamine-oak" };

describe("pipette d'apparence", () => {
  it("un verre transparent, une laque et sa couleur, des faces peintes passent d'un corps aux autres", () => {
    const glass = withLookCopied(doc({ a: { appearance: "acrylic-clear" }, b: { appearance: "melamine-oak" } }), "a", ["b", "c"]);
    expect([bodyAppearance(glass, "b", undefined)?.appearance.id, bodyAppearance(glass, "c", undefined)?.appearance.id]).toEqual(["acrylic-clear", "acrylic-clear"]);
    const lacquer = withLookCopied(doc({ a: { appearance: "lacquer-satin", color: "#336699", faces: [face] }, b: {} }), "a", ["b"]);
    expect(bodyAppearance(lacquer, "b", undefined)).toMatchObject({ appearance: { id: "lacquer-satin" }, color: "#336699" });
    expect(lacquer.bodyInfo?.b?.faces).toEqual([face]);
    // Its material's look, when it has none of its own: given as the appearance; the material itself stays.
    const material = withLookCopied(doc({ a: { material: "melamine-walnut" }, b: { material: "melamine-white" } }), "a", ["b"]);
    expect(material.bodyInfo?.b).toMatchObject({ material: "melamine-white", appearance: "melamine-walnut" });
  });
});
