/** Le navigateur range les pièces d'une répartition par sorte : un dossier Étagères, un dossier Côtés… */
import { describe, expect, it } from "vitest";
import type { BodyEntry, BodyRow } from "../../frontend/src/ui/browser";
import { bodyKind, groupByKind } from "../../frontend/src/ui/body-kinds";

const row = (name: string): BodyRow => ({ item: { id: name, name, type: "extrude", state: "ok", suppressed: false, hidden: false }, label: name, history: [] });
const body = (name: string): BodyEntry => ({ body: row(name) });
const names = (entries: BodyEntry[]) => entries.map((e) => ("group" in e ? `[${e.group.name}: ${e.group.bodies.map((b) => b.label).join(", ")}]` : e.body.label));

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
    const cabinet: BodyEntry = { group: { id: "cab1", name: "Caisson bas", bodies: [row("Côté gauche"), row("Côté droit")] } };
    expect(groupByKind([cabinet, body("Étagère 1"), body("Étagère 2")])).toEqual([cabinet, { group: { id: "kind:etagere", name: "Étagères", bodies: [row("Étagère 1"), row("Étagère 2")] } }]);
  });
});
