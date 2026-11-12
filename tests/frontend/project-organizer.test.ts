/** La colonne « Projets » : ses groupes, un par dossier puis « Sans dossier », et la recherche. */
import { describe, expect, it } from "vitest";
import { groupProjects } from "../../frontend/src/app/project-organizer";

const project = (name: string, folder: number | null) => ({ id: name, name, space: "design", folder, updated_at: "2026-11-12T10:00:00Z" });
const list = {
  folders: [{ id: 1, name: "Clients" }, { id: 2, name: "Vides" }],
  projects: [project("Cuisine Dupont", 1), project("Meuble télé", null), project("Dressing Martin", 1), project("Perdu", 9)],
};

describe("groupes de la colonne Projets", () => {
  it("un par dossier dans son ordre, puis « Sans dossier » (et un dossier inconnu y retombe)", () => {
    const groups = groupProjects(list);
    expect(groups.map((g) => [g.id, g.name, g.projects.map((p) => p.name)])).toEqual([
      [1, "Clients", ["Cuisine Dupont", "Dressing Martin"]],
      [2, "Vides", []],
      [null, "Sans dossier", ["Meuble télé", "Perdu"]],
    ]);
  });

  it("la recherche, sans casse, ne garde que les groupes qui ont un projet du nom cherché", () => {
    expect(groupProjects(list, "  MEUBLE ").map((g) => [g.name, g.projects.map((p) => p.name)])).toEqual([["Sans dossier", ["Meuble télé"]]]);
    expect(groupProjects(list, "zzz")).toEqual([]);
  });
});
