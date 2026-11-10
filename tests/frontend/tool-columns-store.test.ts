import { describe, expect, it } from "vitest";
import { COLUMN_COUNT, moveTool, normalize, readColumns, toggleFold, toggleTool } from "../../frontend/src/ui/tool-columns-store";

const known = (key: string) => key !== "data-action:gone";

describe("barre à sept colonnes : ce qui est retenu", () => {
  it("garde toujours sept colonnes, sans outil inconnu ni doublon", () => {
    const state = normalize({ columns: [["data-action:move", "data-action:gone", "data-action:move", 3]], folded: [false, true, "oui"] }, known);
    expect(state.columns).toHaveLength(COLUMN_COUNT);
    expect(state.columns[0]).toEqual(["data-action:move"]);
    expect(state.columns[6]).toEqual([]);
    expect(state.folded).toEqual([false, true, false, false, false, false, false]);
    expect(normalize("abîmé", known).columns).toEqual([[], [], [], [], [], [], []]);
  });

  it("commence avec sept colonnes vides et dépliées, les mêmes pour tous les espaces", () => {
    const state = readColumns(() => true);
    expect(state.columns).toEqual([[], [], [], [], [], [], []]);
    expect(state.folded).toEqual([false, false, false, false, false, false, false]);
  });

  it("ajoute un outil à une colonne puis l'en retire ; replie une colonne seule", () => {
    const empty = normalize({}, known);
    const added = toggleTool(empty, 2, "data-action:fillet");
    expect(added.columns[2]).toEqual(["data-action:fillet"]);
    expect(added.columns[1]).toEqual([]);
    expect(toggleTool(added, 2, "data-action:fillet").columns[2]).toEqual([]);
    const folded = toggleFold(empty, 1);
    expect(folded.folded).toEqual([false, true, false, false, false, false, false]);
    expect(toggleFold(folded, 1).folded).toEqual([false, false, false, false, false, false, false]);
  });

  it("change l'ordre des outils d'une colonne, ou en passe un dans une autre sans le doubler", () => {
    const state = normalize({ columns: [["a", "b", "c"], ["c"]] }, () => true);
    expect(moveTool(state, 0, "c", 0, 0).columns[0]).toEqual(["c", "a", "b"]);
    expect(moveTool(state, 0, "a", 0, 2).columns[0]).toEqual(["b", "c", "a"]);
    expect(moveTool(state, 0, "b", 0, -3).columns[0]).toEqual(["b", "a", "c"]);
    expect(moveTool(state, 0, "a", 0, 99).columns[0]).toEqual(["b", "c", "a"]);
    const across = moveTool(state, 0, "c", 1, 0);
    expect(across.columns[0]).toEqual(["a", "b"]);
    expect(across.columns[1]).toEqual(["c"]);
    expect(moveTool(state, 0, "b", 1, 0).columns[1]).toEqual(["b", "c"]);
    expect(moveTool(state, 1, "zz", 0, 0)).toBe(state);
  });
});
