import { describe, expect, it } from "vitest";
import { addSeparator, columnName, COLUMN_COUNT, isSeparator, moveTool, normalize, readColumns, renamed, separatorKind, toggleFold, toggleTool, cardsOf, cardClosed, toggleCard } from "../../frontend/src/ui/tool-columns-store";

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

  it("ajoute des lignes et des espaces vides, chacun le sien, qui se déplacent, se gardent et se retirent comme un outil", () => {
    let state = toggleTool(normalize({}, known), 0, "data-action:move");
    state = addSeparator(state, 0, "line");
    state = addSeparator(state, 0, "space");
    state = addSeparator(state, 3, "line");
    expect(state.columns[0]).toEqual(["data-action:move", "sep:line:1", "sep:space:2"]);
    expect(state.columns[3]).toEqual(["sep:line:3"]);
    expect([separatorKind("sep:line:1"), separatorKind("sep:space:2"), separatorKind("data-action:move")]).toEqual(["line", "space", null]);
    expect(isSeparator("sep:mur:1")).toBe(false);
    // Moved before the tool, kept as they are (an unknown tool dropped), then taken out.
    state = moveTool(state, 0, "sep:space:2", 0, 0);
    expect(state.columns[0]).toEqual(["sep:space:2", "data-action:move", "sep:line:1"]);
    expect(normalize(JSON.parse(JSON.stringify({ ...state, columns: [[...state.columns[0]!, "data-action:gone"]] })), known).columns[0]).toEqual(state.columns[0]);
    expect(toggleTool(state, 0, "sep:line:1").columns[0]).toEqual(["sep:space:2", "data-action:move"]);
  });

  it("range les icônes d'une colonne en cartes : une ligne en commence une autre, une carte vide attend ses icônes", () => {
    expect(cardsOf([])).toEqual([]);
    expect(cardsOf(["a", "sep:space:1", "b"])).toEqual([{ line: null, keys: ["a", "sep:space:1", "b"] }]);
    expect(cardsOf(["a", "sep:line:1", "b", "c", "sep:line:2"])).toEqual([{ line: null, keys: ["a"] }, { line: "sep:line:1", keys: ["b", "c"] }, { line: "sep:line:2", keys: [] }]);
    // A line first: no empty card before it.
    expect(cardsOf(["sep:line:1", "a"])).toEqual([{ line: "sep:line:1", keys: ["a"] }]);
  });

  it("une carte se replie et se déplie, chacune la sienne, et c'est gardé", () => {
    const state = normalize({ columns: [["a", "sep:line:1", "b"]] }, () => true);
    const [first, second] = cardsOf(state.columns[0]!);
    expect(cardClosed(state, 0, second!)).toBe(false);
    const folded = toggleCard(state, 0, second!);
    expect([cardClosed(folded, 0, first!), cardClosed(folded, 0, second!), cardClosed(folded, 1, second!)]).toEqual([false, true, false]);
    expect(normalize(JSON.parse(JSON.stringify(folded)), () => true).closed).toEqual(["0:sep:line:1"]);
    expect(normalize({ closed: ["0:", "x", 3, "0:"] }, () => true).closed).toEqual(["0:"]);
    expect(toggleCard(folded, 0, second!).closed).toEqual([]);
  });

  it("chaque colonne a un nom, son numéro tant qu'on ne lui en donne pas, gardé d'une visite à l'autre", () => {
    const known = () => true;
    const state = normalize({}, known);
    expect(state.names).toEqual(Array.from({ length: COLUMN_COUNT }, () => ""));
    expect(columnName(state, 2)).toBe("Colonne 3");
    const named = renamed(state, 2, "  Dressing   et   portes ");
    expect(columnName(named, 2)).toBe("Dressing et portes");
    // Kept as stored; too long, cut; not a string, empty.
    expect(normalize(JSON.parse(JSON.stringify(named)), known).names[2]).toBe("Dressing et portes");
    expect(renamed(state, 0, "x".repeat(40)).names[0]).toHaveLength(24);
    expect(normalize({ names: [12, null] }, known).names.slice(0, 2)).toEqual(["", ""]);
    // An empty name: back to its number.
    expect(columnName(renamed(named, 2, " "), 2)).toBe("Colonne 3");
  });
});
