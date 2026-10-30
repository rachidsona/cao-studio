/** Le navigateur range les corps chacun dans son dossier, et leurs pièces par sorte : un dossier Étagères, un dossier Côtés… */
import { describe, expect, it } from "vitest";
import type { BodyEntry, BodyRow } from "../../frontend/src/ui/browser";
import { bodyKind, groupByCorps, groupByKind } from "../../frontend/src/ui/body-kinds";

const row = (name: string): BodyRow => ({ item: { id: name, name, type: "extrude", state: "ok", suppressed: false, hidden: false }, label: name, history: [] });
const body = (name: string): BodyEntry => ({ body: row(name) });
const names = (entries: BodyEntry[]): string[] => entries.map((e) => ("group" in e ? `[${e.group.name}: ${names(e.group.entries).join(", ")}]` : e.body.label));

describe("ranger les corps par sorte", () => {
  it("reconnaît les pièces d'une répartition, numérotées ou non", () => {
    expect(bodyKind("Étagère 12")?.folder).toBe("Étagères");
    expect(bodyKind("Côté 3")?.folder).toBe("Côtés");
    expect(bodyKind("Dessous")?.folder).toBe("Dessous");
    expect(bodyKind("Cloison 1")?.folder).toBe("Cloisons");
    expect(bodyKind("Plateau")).toBeNull();
    expect(bodyKind("Étagère du haut")).toBeNull();
  });

  it("un dossier par sorte, à la place de la première pièce", () => {
    const entries = [body("Dessous 1"), body("Dessous 2"), body("Dessus 1"), body("Côté 1"), body("Côté 2"), body("Étagère 1"), body("Étagère 2"), body("Étagère 3"), body("Plateau")];
    expect(names(groupByKind(entries))).toEqual(["[Dessous: Dessous 1, Dessous 2]", "Dessus 1", "[Côtés: Côté 1, Côté 2]", "[Étagères: Étagère 1, Étagère 2, Étagère 3]", "Plateau"]);
  });

  it("une pièce seule de sa sorte reste à sa place, sans dossier", () => {
    expect(names(groupByKind([body("Cloison 1"), body("Plateau")]))).toEqual(["Cloison 1", "Plateau"]);
  });

  it("les dossiers déjà faits (un caisson) restent comme ils sont", () => {
    const cabinet: BodyEntry = { group: { id: "cab1", name: "Caisson bas", entries: [body("Côté gauche"), body("Côté droit")] } };
    expect(groupByKind([cabinet, body("Étagère 1"), body("Étagère 2")])).toEqual([cabinet, { group: { id: "kind:etagere", name: "Étagères", entries: [body("Étagère 1"), body("Étagère 2")] } }]);
  });

  it("chaque corps a son dossier, ses pièces rangées par sorte à l'intérieur, sans mélanger celles d'un autre corps", () => {
    const penderie: BodyEntry = { group: { id: "pd1", name: "Penderie 1", entries: [body("Tringle"), body("Support gauche")] } };
    // « Étagère 1, 2 » au mur A, « Étagère 3, 4 » au mur B, un plateau seul et des étagères hors de tout corps.
    const of: Record<string, string> = { "Côté 1": "A", "Côté 2": "A", "Étagère 1": "A", "Étagère 2": "A", "Penderie 1": "A", "Côté 3": "B", "Étagère 3": "B", "Étagère 4": "B" };
    const entries = [body("Côté 1"), body("Côté 2"), body("Étagère 1"), body("Côté 3"), body("Étagère 3"), body("Étagère 4"), body("Étagère 2"), penderie, body("Plateau"), body("Étagère 7"), body("Étagère 8")];
    const tree = groupByCorps(entries, (e) => {
      const wall = of["group" in e ? e.group.name : e.body.label];
      return wall ? { id: `sk${wall}`, name: `Mur ${wall}` } : null;
    });
    expect(names(tree)).toEqual([
      "[Mur A: [Côtés: Côté 1, Côté 2], [Étagères: Étagère 1, Étagère 2], [Penderie 1: Tringle, Support gauche]]",
      "[Mur B: Côté 3, [Étagères: Étagère 3, Étagère 4]]",
      "Plateau",
      "[Étagères: Étagère 7, Étagère 8]",
    ]);
    // Les dossiers de sorte de deux corps ont chacun leur id (replié ou déplié chacun pour soi).
    const ids = tree.flatMap((e) => ("group" in e ? e.group.entries.flatMap((c) => ("group" in c ? [c.group.id] : [])) : []));
    expect(ids).toEqual(["kind:skA:cote", "kind:skA:etagere", "pd1", "kind:skB:etagere"]);
    expect(tree[0]).toMatchObject({ group: { id: "corps:skA" } });
  });
});
