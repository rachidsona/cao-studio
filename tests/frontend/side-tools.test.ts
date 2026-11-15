import { describe, expect, it } from "vitest";
import { placed } from "../../frontend/src/ui/side-tools";
import { insertTool, normalize } from "../../frontend/src/ui/tool-columns-store";

describe("glisser une icône dans une barre", () => {
  it("la met à sa place dans la colonne de droite, sans la doubler", () => {
    expect(placed(["a", "b"], "c", 1)).toEqual(["a", "c", "b"]);
    expect(placed(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(placed([], "a", 5)).toEqual(["a"]);
  });

  it("la met à sa place dans une des sept colonnes, venue d'une autre barre", () => {
    const state = normalize({ columns: [["x", "y"]] }, () => true);
    expect(insertTool(state, 0, "z", 1).columns[0]).toEqual(["x", "z", "y"]);
    expect(insertTool(state, 0, "x", 2).columns[0]).toEqual(["y", "x"]);
    expect(insertTool(state, 2, "z", 0).columns[2]).toEqual(["z"]);
  });
});
