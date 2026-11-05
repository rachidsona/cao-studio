/** Les onglets de projets : ceux qu'on retrouve en ouvrant la page. */
import { describe, expect, it } from "vitest";
import { MOST_TABS, restoredTabs } from "../../frontend/src/app/project-tabs";

const p = (id: string, name = id) => ({ id, name });

describe("onglets retrouvés", () => {
  it("gardent leur ordre, et le projet de la page s'ajoute à la fin", () => {
    expect(restoredTabs([p("a"), p("b")], p("c"), [p("a"), p("b"), p("c")]).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("ne doublent pas le projet de la page", () => {
    expect(restoredTabs([p("a"), p("b")], p("a"), [p("a"), p("b")]).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("perdent un projet supprimé et prennent le nom de maintenant", () => {
    expect(restoredTabs([p("a", "ancien"), p("b")], p("c"), [p("a", "nouveau"), p("c")])).toEqual([p("a", "nouveau"), p("c")]);
  });

  it("restent tels quels si la liste n'a pas pu être lue", () => {
    expect(restoredTabs([p("a"), p("b")], p("c"), null).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("ne dépassent pas le nombre d'onglets, le projet de la page compris", () => {
    const kept = Array.from({ length: MOST_TABS + 2 }, (_, i) => p(`k${i}`));
    const tabs = restoredTabs(kept, p("c"), null);
    expect(tabs).toHaveLength(MOST_TABS);
    expect(tabs.at(-1)?.id).toBe("c");
  });
});
