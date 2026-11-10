import { describe, expect, it } from "vitest";
import { COLUMN_COUNT, normalize, readColumns, toggleFold, toggleTool } from "../../frontend/src/ui/tool-columns-store";

const known = (key: string) => key !== "data-action:gone";

describe("barre à quatre colonnes : ce qui est retenu", () => {
  it("garde toujours quatre colonnes, sans outil inconnu ni doublon", () => {
    const state = normalize({ columns: [["data-action:move", "data-action:gone", "data-action:move", 3]], folded: [false, true, "oui"] }, known);
    expect(state.columns).toHaveLength(COLUMN_COUNT);
    expect(state.columns[0]).toEqual(["data-action:move"]);
    expect(state.columns[3]).toEqual([]);
    expect(state.folded).toEqual([false, true, false, false]);
    expect(normalize("abîmé", known).columns).toEqual([[], [], [], []]);
  });

  it("commence avec quatre colonnes vides et dépliées, les mêmes pour tous les espaces", () => {
    const state = readColumns(() => true);
    expect(state.columns).toEqual([[], [], [], []]);
    expect(state.folded).toEqual([false, false, false, false]);
  });

  it("ajoute un outil à une colonne puis l'en retire ; replie une colonne seule", () => {
    const empty = normalize({}, known);
    const added = toggleTool(empty, 2, "data-action:fillet");
    expect(added.columns[2]).toEqual(["data-action:fillet"]);
    expect(added.columns[1]).toEqual([]);
    expect(toggleTool(added, 2, "data-action:fillet").columns[2]).toEqual([]);
    const folded = toggleFold(empty, 1);
    expect(folded.folded).toEqual([false, true, false, false]);
    expect(toggleFold(folded, 1).folded).toEqual([false, false, false, false]);
  });
});
