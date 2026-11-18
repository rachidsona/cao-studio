/** Un meuble glissé sur la bande dans la place vide à côté de lui : il s'y pose, les autres ne bougent pas. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import { itemSlid, slideRoom } from "../../frontend/src/document/kitchen-slide";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { fillRun, isFiller, isSpace, newItem, openRoom, spaceLeft } from "../../frontend/src/features/kitchen-run-items";
import { withRoomLeft } from "../../frontend/src/app/kitchen/kitchen-strip-actions";

const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
const plan = (rest: "end" | "start" | "both", A: KitchenRunItem[], lengthA = 3600): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA, rest: { A: rest }, runs: { A } });
const heights = (p: KitchenFloorPlan) => ({ worktop: p.worktopHeight, wallBottom: kitchenSizes(p).wallBottom, wallTop: kitchenSizes(p).wallTop });
const run = (p: KitchenFloorPlan) => kitchenRuns(p)[0]!;
const fillOf = (p: KitchenFloorPlan, items: KitchenRunItem[]) => fillRun(runGeometry(p, run(p)), items, heights(p));
const at = (p: KitchenFloorPlan, items: KitchenRunItem[]) => Object.fromEntries(fillOf(p, items).placed.filter((pl) => !isFiller(pl.item)).map((pl) => [pl.item.id, Math.round(pl.at)]));

describe("glisser un meuble dans la place vide", () => {
  it("le dernier meuble glissé vers le bout : posé là, son voisin reste, la place qu'il laisse est gardée libre", () => {
    const items = units([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]]);
    const p = plan("end", items);
    const [first, second] = items as [KitchenRunItem, KitchenRunItem];
    expect(slideRoom(fillOf(p, items), second.id)).toEqual([0, 2000]);
    expect(slideRoom(fillOf(p, items), first.id)).toEqual([0, 0]);
    const made = itemSlid(p, run(p), undefined, items, heights(p), second.id, 500);
    if (typeof made === "string") throw new Error(made);
    expect(made).toMatchObject({ rest: "end", by: 500 });
    expect(made.items.map((i) => (isSpace(i) ? `espace ${i.width}` : i.id))).toEqual([first.id, "espace 500", second.id]);
    expect(at({ ...p, rest: { A: made.rest } }, made.items)).toEqual({ [first.id]: 0, [second.id]: 1500 });
    // Beyond its room: it stops at the end of it; near it: it goes right to it.
    const far = itemSlid(p, run(p), undefined, items, heights(p), second.id, 5000) as { by: number };
    expect(far.by).toBe(2000);
    expect((itemSlid(p, run(p), undefined, items, heights(p), second.id, 1990) as { by: number }).by).toBe(2000);
    expect(itemSlid(p, run(p), undefined, items, heights(p), first.id, 300)).toMatch(/Pas de place vide/);
  });

  it("le reste partagé en deux en haut : un haut glissé contre l'angle, l'autre et les bas ne bougent pas", () => {
    const items = units([["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200], ["wall-haut-1-porte", 600], ["wall-haut-1-porte", 600]]);
    const p = plan("both", items);
    const before = at(p, items);
    const [left, right] = [items[3]!, items[4]!];
    // 3600 − 1200 = 2400 left over up there, 1200 on each side.
    expect([before[left.id], before[right.id]]).toEqual([1200, 1800]);
    expect(slideRoom(fillOf(p, items), left.id)).toEqual([-1200, 0]);
    const made = itemSlid(p, run(p), undefined, items, heights(p), left.id, -1195);
    if (typeof made === "string") throw new Error(made);
    expect(made.by).toBe(-1200);
    const after = at({ ...p, rest: { A: made.rest } }, made.items);
    expect(after).toEqual({ ...before, [left.id]: 0 });
  });

  it("le reste d'en bas tenait par un fileur : il devient un fileur posé, à sa place, quand un haut est glissé", () => {
    const items = units([["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200], ["base-bas-2-portes", 1100], ["wall-haut-1-porte", 600]]);
    const p = plan("start", items);
    const fill = fillOf(p, items);
    expect(fill.fillers.map(([a, b]) => [Math.round(a), Math.round(b)])).toEqual([[0, 100]]);
    const high = items[3]!;
    const made = itemSlid(p, run(p), undefined, items, heights(p), high.id, -600);
    if (typeof made === "string") throw new Error(made);
    const next = { ...p, rest: { A: made.rest } };
    expect(fillOf(next, made.items).fillers).toEqual([]);
    expect(made.items.filter((i) => i.model === "filler").map((i) => i.width)).toEqual([100]);
    expect(at(next, made.items)).toEqual({ ...at(p, items), [high.id]: at(p, items)[high.id]! - 600 });
  });
});

describe("supprimer un meuble sur la bande", () => {
  it("sa place reste vide, ses voisins ne bougent pas ; un voisin glissé dedans la referme", () => {
    const items = units([["wall-haut-1-porte", 600], ["wall-haut-1-porte", 600], ["wall-haut-1-porte", 600], ["base-bas-2-portes", 1200]]);
    const p = plan("both", items);
    const before = at(p, items);
    const [one, two, three] = items as [KitchenRunItem, KitchenRunItem, KitchenRunItem];
    const left = withRoomLeft(items, [two.id]);
    expect(left.map((i) => i.model)).toEqual(["wall-haut-1-porte", "space-wall", "wall-haut-1-porte", "base-bas-2-portes"]);
    expect(left[1]).toEqual({ id: two.id, model: "space-wall", width: 600 });
    const after = at(p, left);
    expect([after[one.id], after[three.id]]).toEqual([before[one.id], before[three.id]]);
    // Room already kept free, taken out: it goes.
    expect(withRoomLeft(left, [two.id]).map((i) => i.id)).toEqual([one.id, three.id, items[3]!.id]);
    // The third one dragged against the first: the room between them is closed, the first stays.
    expect(slideRoom(fillOf(p, left), three.id)[0]).toBe(-600);
    const made = itemSlid(p, run(p), undefined, left, heights(p), three.id, -600);
    if (typeof made === "string") throw new Error(made);
    const closed = at({ ...p, rest: { A: made.rest } }, made.items);
    expect([closed[one.id], closed[three.id]]).toEqual([before[one.id], before[one.id]! + 600]);
  });

  it("un caisson aménagé à la main tient sa place : ni place libre, ni place où glisser un voisin", () => {
    const items = units([["base-bas-2-portes", 1000], ["space", 1200], ["base-bas-1-porte", 600]]).map((i) => (isSpace(i) ? { ...i, furnished: "sk1" } : i));
    const p = plan("end", items);
    const fill = fillOf(p, items);
    // 3600 − 2800: only the 800 at the end is open.
    expect(openRoom(fill, "base")).toEqual([[2800, 3600]]);
    expect(spaceLeft(fill, (mm) => `${mm / 10} cm`, false)).toBe("80 cm libres en bas");
    expect(slideRoom(fill, items[0]!.id)).toEqual([0, 0]);
    expect(slideRoom(fill, items[2]!.id)).toEqual([0, 800]);
  });
});
