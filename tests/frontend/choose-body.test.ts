import { describe, expect, it } from "vitest";
import { chooseBody } from "../../frontend/src/app/curic-common";

describe("chooseBody : plusieurs corps cliqués avant un seul OK", () => {
  it("ajoute un corps non choisi, le remplace quand on modifie une étape", () => {
    expect(chooseBody(["a"], "b", [], false, false)).toEqual(["a", "b"]);
    expect(chooseBody(["a"], "b", [], false, true)).toEqual(["b"]);
  });
  it("Maj + clic retire un corps choisi, ou celui dont on clique l'aperçu", () => {
    expect(chooseBody(["a", "b", "c"], "b", [], true, false)).toEqual(["a", "c"]);
    expect(chooseBody(["a", "b"], "md2#0", ["md1", "md2"], true, false)).toEqual(["a"]);
  });
  it("un corps choisi recliqué sans Maj reste choisi", () => {
    expect(chooseBody(["a", "b"], "a", [], false, false)).toEqual(["a", "b"]);
    expect(chooseBody(["a"], "a", [], true, true)).toEqual(["a"]);
  });
});
