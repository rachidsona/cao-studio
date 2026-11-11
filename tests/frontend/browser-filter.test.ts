import { describe, expect, it } from "vitest";
import { entryBodies, type BodyEntry } from "../../frontend/src/ui/browser";
import { filterEntries, filterSketches, filtering } from "../../frontend/src/ui/browser-filter";
import type { NavItem } from "../../frontend/src/ui/feature-meta";

const item = (id: string, name: string, hidden = false): NavItem => ({ id, name, type: "extrude", state: "ok", suppressed: false, hidden });
const body = (id: string, name: string, hidden = false): BodyEntry => ({ body: { item: item(id, name, hidden), label: name, history: [] } });
const tree: BodyEntry[] = [
  { group: { id: "g1", name: "Placard cellier", entries: [body("a", "Côté gauche"), body("b", "Étagère", true)] } },
  body("c", "Plan de travail"),
  body("d", "Fileur", true),
];
const names = (entries: BodyEntry[]) => entries.flatMap(entryBodies).map((r) => r.label);

describe("recherche du Navigateur", () => {
  it("garde les corps dont le nom contient le texte, sans accents ni majuscules", () => {
    expect(names(filterEntries(tree, { query: "ETAGERE", hiddenOnly: false }))).toEqual(["Étagère"]);
    expect(names(filterEntries(tree, { query: "plan", hiddenOnly: false }))).toEqual(["Plan de travail"]);
    expect(filterEntries(tree, { query: "rien", hiddenOnly: false })).toEqual([]);
  });

  it("un dossier trouvé par son nom garde tout ce qu'il contient", () => {
    expect(names(filterEntries(tree, { query: "cellier", hiddenOnly: false }))).toEqual(["Côté gauche", "Étagère"]);
  });

  it("garde seulement les éléments cachés, avec la recherche en plus", () => {
    expect(names(filterEntries(tree, { query: "", hiddenOnly: true }))).toEqual(["Étagère", "Fileur"]);
    expect(names(filterEntries(tree, { query: "fil", hiddenOnly: true }))).toEqual(["Fileur"]);
    const sketches = [item("s1", "Esquisse 1"), item("s2", "Façade", true)];
    expect(filterSketches(sketches, { query: "", hiddenOnly: true }).map((s) => s.name)).toEqual(["Façade"]);
    expect(filterSketches(sketches, { query: "esq", hiddenOnly: false }).map((s) => s.name)).toEqual(["Esquisse 1"]);
  });

  it("sans texte ni bouton, tout est là", () => {
    expect(filtering({ query: "  ", hiddenOnly: false })).toBe(false);
    expect(filterEntries(tree, { query: "", hiddenOnly: false })).toEqual(tree);
  });
});
