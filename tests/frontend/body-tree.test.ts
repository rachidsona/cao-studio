/** Tree of the bodies in the browser: groups of the bodies made together, and the history of each body. */
import { describe, expect, it } from "vitest";
import { addHole, addPlate, renameBody } from "../../frontend/src/document/operations";
import { bodyHistory, bodyTree } from "../../frontend/src/document/body-tree";
import { createReferencePlate, type CadDocument } from "../../frontend/src/document/types";

/** Reference plate (sk1, ex1, h1) split in two by the XY plane (sp1). */
function splitPlate(): CadDocument {
  const doc = createReferencePlate();
  return { ...doc, features: [...doc.features, { id: "sp1", type: "split", name: "Scission 1", target: "h1", tool: { kind: "plane", plane: "XY", offset: 5 }, keep: "both" }] };
}

describe("arbre des corps", () => {
  it("l'historique d'un corps va de son esquisse à sa dernière opération", () => {
    expect(bodyHistory(createReferencePlate(), "h1")).toEqual(["sk1", "ex1", "h1"]);
    expect(bodyHistory(createReferencePlate(), "ex1")).toEqual(["sk1", "ex1"]);
  });

  it("une pièce de scission garde l'historique du corps coupé, puis ses propres opérations", () => {
    const doc = addHole(splitPlate(), "sp1#1", 10, 10, 4);
    const hole = doc.features.at(-1)!.id;
    expect(bodyHistory(doc, hole)).toEqual(["sk1", "ex1", "h1", "sp1", hole]);
    expect(bodyHistory(doc, "sp1#0")).toEqual(["sk1", "ex1", "h1", "sp1"]);
  });

  it("les pièces d'une scission sont regroupées sous le corps coupé, les autres corps restent seuls", () => {
    const doc = addPlate(splitPlate(), 20, 20, 5, 200, 0);
    const plate = doc.features.at(-1)!.id;
    const tree = bodyTree(doc, ["sp1#0", "sp1#1", plate]);
    expect(tree.map((n) => n.kind)).toEqual(["group", "body"]);
    const group = tree[0]!.kind === "group" ? tree[0]!.group : null;
    expect(group?.name).toBe("Corps 1");
    expect(group?.bodies.map((b) => [b.bodyId, b.label])).toEqual([
      ["sp1#0", "pièce 1"],
      ["sp1#1", "pièce 2"],
    ]);
    expect(tree[1]).toMatchObject({ kind: "body", body: { bodyId: plate, label: "Corps 2" } });
  });

  it("une pièce reprise par une opération reste dans son groupe ; une pièce seule n'est pas regroupée", () => {
    const doc = addHole(splitPlate(), "sp1#1", 10, 10, 4);
    const hole = doc.features.at(-1)!.id;
    const tree = bodyTree(doc, ["sp1#0", hole]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.kind === "group" && tree[0]!.group.bodies.map((b) => b.bodyId)).toEqual(["sp1#0", hole]);
    expect(bodyTree(doc, [hole])).toMatchObject([{ kind: "body", body: { bodyId: hole, label: "Corps 1 — pièce 2" } }]);
  });

  it("un nom donné à une pièce est gardé tel quel dans le groupe", () => {
    const doc = renameBody(splitPlate(), "sp1#1", "Dessus");
    const tree = bodyTree(doc, ["sp1#0", "sp1#1"]);
    expect(tree[0]!.kind === "group" && tree[0]!.group.bodies.map((b) => b.label)).toEqual(["pièce 1", "Dessus"]);
  });
});
