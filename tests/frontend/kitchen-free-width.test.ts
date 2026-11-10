/** Une largeur à soi dans « Ajouter des meubles » : tapée, ou celle de la place libre du linéaire. */
import { describe, expect, it } from "vitest";
import { entryAtWidth } from "../../frontend/src/app/kitchen/kitchen-catalog-view";
import { CATALOG } from "../../frontend/src/document/kitchen-catalog";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenRunItem } from "../../frontend/src/document/types";
import { entryItem, fillRun, itemEntry, newItem, widestRoom } from "../../frontend/src/features/kitchen-run-items";

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

    // 2400 with 1000 + 1000 + 114 (a space kept): the widest room left is the rest, the space not counted.
    let items: KitchenRunItem[] = [];
    for (const [model, width] of [["base-bas-2-portes", 1000], ["base-bas-2-portes", 1000], ["space", 114]] as const) items = [...items, newItem(items, model, width)];
    const room = widestRoom(fill(items), "base");
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThan(400 - 114 + 1e-6);
    const full = [...items, entryItem(items, entryAtWidth(bas, Math.floor(room)))];
    expect(widestRoom(fill(full), "base")).toBeLessThan(1);
    expect(fill(full).missing).toEqual([]);
    expect(widestRoom(fill([]), "wall")).toBeGreaterThan(2000);
  });
});
