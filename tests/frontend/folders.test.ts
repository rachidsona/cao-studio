/** Les dossiers du navigateur, faits à la main comme dans Fusion : créer, renommer, ranger, défaire. */
import { describe, expect, it } from "vitest";
import { addFolder, folderIndex, moveToFolder, removeFolder, renameFolder } from "../../frontend/src/document/folders";
import { createReferencePlate } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const base = createReferencePlate();

describe("dossiers du navigateur", () => {
  it("crée des dossiers aux noms uniques, avec les corps choisis", () => {
    const a = addFolder(base, "Dossier", ["ex1", "ex2"]);
    const b = addFolder(a.doc);
    const c = addFolder(b.doc, "Placard");
    const d = addFolder(c.doc, "Placard");
    expect(d.doc.folders?.map((f) => [f.id, f.name])).toEqual([["fd1", "Dossier 1"], ["fd2", "Dossier 2"], ["fd3", "Placard"], ["fd4", "Placard 1"]]);
    expect(d.doc.folders?.[0]?.bodies).toEqual(["ex1", "ex2"]);
  });

  it("un corps n'est que dans un dossier : le ranger ailleurs le sort du premier", () => {
    const { doc, id } = addFolder(base, "Placard", ["ex1", "ex2"]);
    const dressing = addFolder(doc, "Dressing", ["ex2", "ex3"]);
    expect(dressing.doc.folders?.map((f) => f.bodies)).toEqual([["ex1"], ["ex2", "ex3"]]);
    const back = moveToFolder(dressing.doc, ["ex3", "ex3"], id);
    expect(back.folders?.map((f) => f.bodies)).toEqual([["ex1", "ex3"], ["ex2"]]);
    expect([...folderIndex(back)]).toEqual([["ex1", "fd1"], ["ex3", "fd1"], ["ex2", "fd2"]]);
    expect(moveToFolder(back, ["ex1"], null).folders?.[0]?.bodies).toEqual(["ex3"]);
  });

  it("renomme (un nom vide ne change rien) et défait un dossier ; le document reste valide", () => {
    const { doc, id } = addFolder(base, "Placard", ["ex1"]);
    expect(renameFolder(doc, id, "  Dressing ").folders?.[0]?.name).toBe("Dressing");
    expect(renameFolder(doc, id, " ")).toBe(doc);
    expect(removeFolder(doc, id).folders).toBeUndefined();
    expect(() => parseDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
    expect(() => parseDocument({ ...doc, folders: [{ id: "fd1", name: "X", bodies: [3] }] })).toThrow(/folders/);
  });
});
