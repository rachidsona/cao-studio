/** Ce qui reste dans la vue d'une zone isolée : une pièce faite d'une pièce de la zone reste avec elle. */
import { describe, expect, it } from "vitest";
import { staysInView } from "../../frontend/src/app/zone-members";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";

describe("une zone isolée", () => {
  it("garde les côtés séparés d'une façade de tiroir de sa zone, pas ceux d'une autre", () => {
    const doc = { ...createReferencePlate(), features: [
      { id: "td1", type: "niche", name: "Tiroirs 1", sketch: "sk1", partition: "of1", niche: [0], fill: "drawers" },
      { id: "td2", type: "niche", name: "Tiroirs 2", sketch: "sk2", partition: "of1", niche: [0], fill: "drawers" },
      { id: "sh1", type: "shell", name: "Côtés séparés 1", target: "td1#0", faces: [], thickness: 0, sides: "separate", joint: "miter", frame: true },
      { id: "sh2", type: "shell", name: "Côtés séparés 2", target: "td2#0", faces: [], thickness: 0, sides: "separate", joint: "miter", frame: true },
    ] } as unknown as CadDocument;
    const keep = (f: { type: string; sketch?: string }) => f.type === "niche" && f.sketch === "sk1";
    expect(staysInView(doc, "sh1#0", keep as never)).toBe(true);
    expect(staysInView(doc, "sh2#1", keep as never)).toBe(false);
  });
});
