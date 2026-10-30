/** Actions de l'assistant : appliquées par les fonctions des outils, refusées avec leur raison, contexte pour Claude. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyActions, assistantContext, type AssistantAction } from "../../frontend/src/document/assistant-actions";
import { MATERIALS } from "../../frontend/src/document/materials";
import { createReferencePlate } from "../../frontend/src/document/types";

const cabinet = (over: Partial<Extract<AssistantAction, { type: "add_cabinet" }>> = {}): AssistantAction => ({
  type: "add_cabinet", name: "Bas 1", width: 600, height: 870, depth: 560, shelves: 1, plinth: 150, back: "applied", x: 0, y: 0, z: 0, rotation: 0, ...over,
});

describe("actions de l'assistant", () => {
  it("un caisson, ses tiroirs, sa matière, puis un second à côté — désignés par leur nom", () => {
    const { doc, done, refused } = applyActions(createReferencePlate(), [
      cabinet(),
      { type: "add_fronts", cabinet: "Bas 1", layout: "drawers", drawers: 3, mount: "overlay", handles: true },
      { type: "set_material", ref: "Bas 1", material: "melamine-oak" },
      cabinet({ name: "Bas 2", x: 600 }),
      { type: "update_cabinet", ref: "bas 2", width: 450, height: null, depth: null, shelves: null, plinth: null, x: null, y: null, z: null, rotation: null },
    ]);
    expect(refused).toEqual([]);
    expect(done).toHaveLength(5);
    const cabinets = doc.features.filter((f) => f.type === "cabinet");
    expect(cabinets.map((c) => c.type === "cabinet" && [c.name, c.width, c.origin[0]])).toEqual([["Bas 1", 600, 0], ["Bas 2", 450, 600]]);
    const fronts = doc.features.find((f) => f.type === "fronts");
    expect(fronts?.type === "fronts" && fronts.cabinet).toBe(cabinets[0]!.id);
    expect(doc.bodyInfo?.[`${cabinets[0]!.id}#0`]?.material).toBe("melamine-oak");
    expect(doc.bodyInfo?.[`${fronts!.id}#0`]?.material).toBe("melamine-white");
  });

  it("refuse ce qui est impossible sans bloquer le reste", () => {
    const { doc, done, refused } = applyActions(createReferencePlate(), [
      cabinet({ width: 10 }),
      { type: "add_fronts", cabinet: "Inconnu", layout: "door", drawers: 0, mount: "overlay", handles: false },
      { type: "set_parameter", name: "2x", value: 3 },
      { type: "set_parameter", name: "largeur", value: 900 },
    ]);
    expect(done).toEqual(["Paramètre largeur = 900"]);
    expect(refused).toHaveLength(3);
    expect(refused[1]).toMatch(/pas de caisson « Inconnu »/);
    expect(doc.parameters.largeur?.value).toBe(900);
  });

  it("implante une cuisine et supprime une opération", () => {
    const { doc, refused } = applyActions(createReferencePlate(), [
      { type: "add_kitchen", layout: "I", length_a: 1800, length_b: 0, base_height: 870, depth: 560, fronts: "doors", wall_units: false, front_material: "melamine-anthracite", worktop_material: "solid-oak" },
      { type: "delete", ref: "Façades Bas A3" },
    ]);
    expect(refused).toEqual([]);
    expect(doc.features.filter((f) => f.type === "cabinet")).toHaveLength(3);
    expect(doc.features.filter((f) => f.type === "fronts").map((f) => f.name)).toEqual(["Façades Bas A1", "Façades Bas A2"]);
    expect(doc.layers?.map((l) => l.name)).toEqual(["Pièce"]);
  });

  it("le contexte nomme les opérations, avec les cotes des caissons", () => {
    const { doc } = applyActions(createReferencePlate(), [cabinet()]);
    const context = assistantContext(doc) as { features: { name: string; width?: number }[] };
    expect(context.features.at(-1)).toMatchObject({ name: "Bas 1", width: 600 });
  });

  it("le serveur connaît les mêmes matières que l'éditeur", () => {
    const python = readFileSync("apps/projects/assistant.py", "utf8");
    for (const m of MATERIALS) expect(python).toContain(`"${m.id}"`);
  });
});
