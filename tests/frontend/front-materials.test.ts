/** Les façades ne se font que de ce qui s'y prête : bois, mélaminé, MDF, HDF, stratifié, laque, verre. */
import { describe, expect, it } from "vitest";
import { frontChoices, frontMaterial, type Material } from "../../frontend/src/document/materials";

const board = (category: Material["category"], kind: Material["kind"] = "panel"): Material => ({ id: "c", name: "C", color: "#ffffff", look: "plain", sheet: [2800, 2070], kind, category });

describe("matières des façades", () => {
  it("bois, mélaminé, MDF, laque, massif ; ni fond, ni tasseaux", () => {
    const ids = frontChoices().map(([id]) => id);
    expect(ids).toEqual(expect.arrayContaining(["melamine-white", "melamine-oak", "mdf", "lacquer-white", "birch-plywood", "solid-oak"]));
    expect(ids).not.toContain("hdf");
    expect(ids).not.toContain("pine-batten");
    expect(ids).not.toContain("oak-batten");
  });

  it("du catalogue : verre, bois, stratifié, HDF oui ; marbre, pierre, métal non", () => {
    expect(["glass", "wood", "laminate", "solid", "melamine", undefined].map((c) => frontMaterial(board(c as Material["category"])))).toEqual([true, true, true, true, true, true]);
    expect(["marble", "stone", "metal"].map((c) => frontMaterial(board(c as Material["category"])))).toEqual([false, false, false]);
    expect(frontMaterial(board("solid", "backing"))).toBe(false);
  });

  it("la matière déjà choisie reste dans la liste, même si elle ne s'y prête pas", () => {
    expect(frontChoices("hdf").map(([id]) => id)).toContain("hdf");
  });
});
