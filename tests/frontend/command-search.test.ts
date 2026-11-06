/** La recherche de la palette de commandes. */
import { describe, expect, it } from "vitest";
import { searchCommands, type Command } from "../../frontend/src/ui/command-search";

const c = (key: string, label: string, group = "", hint = ""): Command => ({ key, label, group, hint });
const TOOLS = [c("a", "Étagères", "Menuiserie", "divise une niche"), c("b", "Niche", "Menuiserie", "change sa hauteur"), c("c", "Plan de dressing", "Menuiserie"), c("d", "Dossier de production", "Atelier")];
const keys = (query: string, recent: string[] = []) => searchCommands(TOOLS, query, recent).map((t) => t.key);

describe("palette de commandes", () => {
  it("trouve sans les accents ni les majuscules", () => {
    expect(keys("ETAG")).toEqual(["a"]);
  });

  it("met le nom avant le groupe et la description", () => {
    expect(keys("niche")).toEqual(["b", "a"]);
  });

  it("demande tous les mots tapés, dans n'importe quel ordre", () => {
    expect(keys("production dossier")).toEqual(["d"]);
    expect(keys("dossier zzz")).toEqual([]);
  });

  it("préfère un début de mot", () => {
    expect(keys("dress")).toEqual(["c"]);
    expect(searchCommands([c("x", "Adresse"), c("y", "Plan dressing")], "dress").map((t) => t.key)).toEqual(["y", "x"]);
  });

  it("sans rien taper, montre d'abord les derniers utilisés", () => {
    expect(keys("", ["c", "gone"])).toEqual(["c", "a", "b", "d"]);
  });
});
