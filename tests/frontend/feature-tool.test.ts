/** L'historique montre l'outil utilisé : un prolongement (« Prolonger élément »), des côtés séparés — pas l'opération. */
import { describe, expect, it } from "vitest";
import type { Feature } from "../../frontend/src/document/types";
import { toolOf } from "../../frontend/src/ui/feature-tool";

const f = (x: object) => x as unknown as Feature;

describe("l'outil d'une étape", () => {
  it("prolongement, raccourci, côtés séparés ; une extrusion ordinaire reste la sienne", () => {
    expect(toolOf(f({ type: "extrude", name: "Prolongement 3", faces: [{}], distance: 10 }))?.label).toBe("Prolonger élément");
    expect(toolOf(f({ type: "extrude", name: "Raccourci", faces: [{}], distance: -10 }))?.sprite).toBe("i-extend-element");
    expect(toolOf(f({ type: "shell", name: "Côtés séparés 1", sides: "separate", frame: true, faces: [], thickness: 0 }))?.label).toBe("Séparer les côtés");
    expect(toolOf(f({ type: "extrude", name: "Extrusion 4", sketch: "sk1", distance: 10 }))).toBeNull();
    expect(toolOf(f({ type: "extrude", name: "Mon bout", faces: [{}], tool: "extend-element" }))?.label).toBe("Prolonger élément");
  });
});
