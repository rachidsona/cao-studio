/** Plusieurs meubles d'un linéaire réglés ensemble : cote commune, même largeur, place partagée, modèle, doubles. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenRunItem } from "../../frontend/src/document/types";
import { withCommonSize, withDuplicated, withEqualWidths, withModel, withRoomShared } from "../../frontend/src/features/kitchen-run-multi";

const p = { ...KITCHEN_PLAN };
const items: KitchenRunItem[] = [
  { id: "a", model: "base-bas-1-porte", width: 400 },
  { id: "b", model: "base-bas-2-portes", width: 800 },
  { id: "c", model: "app-dishwasher", width: 600 },
  { id: "h", model: "wall-haut-1-porte", width: 600 },
  { id: "d", model: "base-bas-3-tiroirs", width: 600 },
];
const width = (list: KitchenRunItem[], id: string) => list.find((i) => i.id === id)!.width;

describe("plusieurs meubles d'un linéaire", () => {
  it("une largeur commune pour tous, sauf l'appareil qui garde la sienne", () => {
    const { items: next, kept } = withCommonSize(p, items, ["a", "b", "c"], "width", 500);
    expect([width(next, "a"), width(next, "b"), width(next, "c")]).toEqual([500, 500, 600]);
    expect(kept).toEqual(["c"]);
  });

  it("une hauteur commune ne va qu'aux hauts et colonnes ; une profondeur, à tous dans leurs limites", () => {
    const h = withCommonSize(p, items, ["a", "h"], "height", 900);
    expect(h.items.find((i) => i.id === "h")!.height).toBe(900);
    expect(h.kept).toEqual(["a"]);
    const d = withCommonSize(p, items, ["a", "h"], "depth", 9999);
    expect(d.items.find((i) => i.id === "a")!.depth).toBeLessThanOrEqual(600);
    expect(d.items.find((i) => i.id === "h")!.depth).toBe(600);
  });

  it("la même largeur pour tous : leur largeur totale partagée, au millimètre", () => {
    const next = withEqualWidths(p, items, ["a", "b", "d"]);
    expect([width(next, "a"), width(next, "b"), width(next, "d")]).toEqual([600, 600, 600]);
    const odd = withEqualWidths(p, [{ id: "x", model: "base-bas-1-porte", width: 450 }, { id: "y", model: "base-bas-1-porte", width: 500 }, { id: "z", model: "base-bas-1-porte", width: 501 }], ["x", "y", "z"]);
    expect(odd.map((i) => i.width)).toEqual([483, 483, 485]);
  });

  it("la place libre partagée entre eux, chacun dans ses limites", () => {
    const { items: next, given } = withRoomShared(p, items, ["a", "b", "h"], "base", 301);
    expect([width(next, "a"), width(next, "b"), width(next, "h")]).toEqual([550, 950, 600]);
    expect(given).toBe(300);
  });

  it("un autre modèle pour tous, à la largeur la plus proche ; un double de chacun après eux", () => {
    const next = withModel(items, ["a", "b"], "base-bas-3-tiroirs", [300, 400, 600, 900]);
    expect(next.slice(0, 2).map((i) => [i.model, i.width])).toEqual([["base-bas-3-tiroirs", 400], ["base-bas-3-tiroirs", 900]]);
    const { items: copied, copies } = withDuplicated(items, ["a", "b"]);
    expect(copies).toHaveLength(2);
    expect(copied.map((i) => i.model).slice(0, 4)).toEqual(["base-bas-1-porte", "base-bas-2-portes", "base-bas-1-porte", "base-bas-2-portes"]);
    expect(copied.length).toBe(items.length + 2);
  });
});
