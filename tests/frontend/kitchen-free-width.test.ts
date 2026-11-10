/** Une largeur à soi dans « Ajouter des meubles » : tapée, ou celle de la place libre du linéaire. */
import { describe, expect, it } from "vitest";
import { entryAtWidth } from "../../frontend/src/app/kitchen/kitchen-catalog-view";
import { CATALOG } from "../../frontend/src/document/kitchen-catalog";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenRunItem } from "../../frontend/src/document/types";
import { entryItem, fillRun, itemEntry, newItem, settledItems, widestRoom } from "../../frontend/src/features/kitchen-run-items";

const p = { ...KITCHEN_PLAN, model: "I" as const, lengthA: 2400 };
const run = kitchenRuns(p)[0]!;
const fill = (items: KitchenRunItem[]) => {
  const s = kitchenSizes(p);
  return fillRun(runGeometry({ ...p, runs: { A: items } }, run), items, { worktop: p.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop });
};

describe("largeur libre d'un meuble ajouté", () => {
  it("fait un modèle du catalogue à la largeur tapée, et la place libre le comble au millimètre", () => {
    const bas = CATALOG.find((e) => e.id === "base-bas-1-porte-600")!;
    const odd = entryAtWidth(bas, 286);
    expect(odd).toMatchObject({ id: "base-bas-1-porte-286", width: 286, name: bas.name });
    const item = entryItem([], odd);
    expect(item).toMatchObject({ model: "base-bas-1-porte", width: 286 });
    expect(itemEntry(item)).toMatchObject({ width: 286, layout: "door" });

    // 2400 with 1000 + 1000 + 114 kept for a furnished caisson: the widest room left is the rest, that room not counted.
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-2-portes", 1000], ["base-bas-2-portes", 1000], ["space", 114]] as const) items = [...items, newItem(items, model, width)];
    const held = items.map((i) => (i.model === "space" ? { ...i, furnished: "sk9" } : i));
    const room = widestRoom(fill(held), "base");
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThan(400 - 114 + 1e-6);
    const full = [...held, entryItem(held, entryAtWidth(bas, Math.floor(room)))];
    expect(widestRoom(fill(full), "base")).toBeLessThan(1);
    expect(fill(full).missing).toEqual([]);
    // Kept free with no caisson in it: room for a unit, the open room beside it with it.
    expect(widestRoom(fill(items), "base")).toBeCloseTo(400, 0);
    expect(widestRoom(fill([]), "wall")).toBeGreaterThan(2000);
  });

  it("un meuble sans place prend la place gardée libre, pas celle qu'un caisson aménagé tient", () => {
    // A wall of 2400: a unit of 600, 1200 kept free, a unit of 600; then a sink unit of 1200 added, and one more.
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-1-porte", 600], ["space", 1200], ["base-bas-1-porte", 600]] as const) items = [...items, newItem(items, model, width)];
    const sink = newItem(items, "base-bas-2-portes", 1200);
    const more = newItem([...items, sink], "base-bas-2-portes", 1200);
    const f = fill([...items, sink, more]);
    // The first stands where the room was kept, between the two units; the second finds no room.
    expect(f.placed.find((pl) => pl.item.id === sink.id)?.at).toBeCloseTo(600, 3);
    expect(f.missing.map((i) => i.id)).toEqual([more.id]);
    expect(f.items.map((i) => i.id)).toEqual([items[0]!.id, sink.id, items[2]!.id, more.id]);
    expect(f.spaces).toEqual([]);
    // A narrower unit: the space keeps what is left, after it.
    const small = newItem(items, "base-bas-1-porte", 500);
    const g = fill([...items, small]);
    expect(g.placed.find((pl) => pl.item.id === small.id)?.at).toBeCloseTo(600, 3);
    expect(g.spaces.map((pl) => [pl.at, pl.item.width])).toEqual([[1100, 700]]);
    // Held by a furnished caisson: nothing goes there.
    const held = items.map((i) => (i.model === "space" ? { ...i, furnished: "sk9" } : i));
    const h = fill([...held, sink]);
    expect(h.missing.map((i) => i.id)).toEqual([sink.id]);
    expect(h.items).toEqual([...held, sink]);
    // Nothing to settle: the same array.
    expect(settledItems(runGeometry({ ...p, runs: { A: items } }, run), items, { worktop: p.worktopHeight, wallBottom: 1450, wallTop: 2150 })).toBe(items);
  });
});
