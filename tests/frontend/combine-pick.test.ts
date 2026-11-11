/** « Combiner des corps » choisi dans la vue : la cible d'abord, puis les corps outils ajoutés ou retirés d'un clic. */
import { describe, expect, it } from "vitest";
import { pickBody, type CombinePick } from "../../frontend/src/app/combine-pick";

const empty: CombinePick = { target: undefined, tools: [], choosing: "target" };

describe("combiner des corps choisis dans la vue", () => {
  it("le premier corps cliqué est la cible, les suivants s'ajoutent aux outils, un autre clic en retire un", () => {
    const a = pickBody(empty, "e1", "cb1");
    expect(a).toEqual({ target: "e1", tools: [], choosing: "tools" });
    const b = pickBody(pickBody(a, "e2", "cb1"), "e3", "cb1");
    expect(b.tools).toEqual(["e2", "e3"]);
    expect(pickBody(b, "e2", "cb1").tools).toEqual(["e3"]);
  });

  it("la cible ne devient pas un outil ; le résultat de l'aperçu tient lieu de la cible", () => {
    const a: CombinePick = { target: "e1", tools: ["e2"], choosing: "tools" };
    expect(pickBody(a, "e1", "cb1")).toBe(a);
    expect(pickBody(a, "cb1", "cb1")).toBe(a);
  });

  it("une autre cible choisie sort des outils, et les clics suivants choisissent de nouveau les outils", () => {
    const a: CombinePick = { target: "e1", tools: ["e2", "e3"], choosing: "target" };
    expect(pickBody(a, "e2", "cb1")).toEqual({ target: "e2", tools: ["e3"], choosing: "tools" });
    expect(pickBody(empty, "cb1", "cb1")).toBe(empty);
  });
});
