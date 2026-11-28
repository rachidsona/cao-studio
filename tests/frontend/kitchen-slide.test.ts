/** Un meuble glissé sur la bande dans la place vide à côté de lui : il s'y pose, les autres ne bougent pas. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import { itemSlid, slideRoom } from "../../frontend/src/document/kitchen-slide";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { fillRun, inKeptRoom, isFiller, isSpace, joinedSpaces, newItem, openRoom, spaceLeft } from "../../frontend/src/features/kitchen-run-items";
import { withRoomLeft } from "../../frontend/src/app/kitchen/kitchen-strip-actions";

const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
const plan = (rest: "end" | "start" | "both", A: KitchenRunItem[], lengthA = 3600): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA, rest: { A: rest }, runs: { A } });
const heights = (p: KitchenFloorPlan) => ({ worktop: p.worktopHeight, wallBottom: kitchenSizes(p).wallBottom, wallTop: kitchenSizes(p).wallTop });
const run = (p: KitchenFloorPlan) => kitchenRuns(p)[0]!;
const fillOf = (p: KitchenFloorPlan, items: KitchenRunItem[]) => fillRun(runGeometry(p, run(p)), items, heights(p));
const at = (p: KitchenFloorPlan, items: KitchenRunItem[]) => Object.fromEntries(fillOf(p, items).placed.filter((pl) => !isFiller(pl.item)).map((pl) => [pl.item.id, Math.round(pl.at)]));

describe("glisser un meuble dans la place vide", () => {
  it("une colonne remise là où une place est gardée en haut : elle la prend, les hauts d'après restent où ils étaient", () => {
    // A column deleted (its room kept, up there too), then put back in the base room it left.
    const [space, column, base, high] = units([["space", 348], ["tall-colonne-rangement", 900], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]]) as [KitchenRunItem, KitchenRunItem, KitchenRunItem, KitchenRunItem];
    const kept = { ...newItem([space, column, base, high], "space-wall", 1248), id: "kw" };
    const items = [space, column, base, kept, high];
    const p = plan("end", items);
    // Over the base unit, after the column: where it stood before.
    expect(at(p, items)[high.id]).toBe(1248);
    // The room kept up there: before the column only.
    expect(fillOf(p, items).spaces.filter((s) => s.row === "wall").map((s) => [Math.round(s.at), s.item.width])).toEqual([[0, 348]]);
  });

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

  it("un caisson aménagé glissé dans la place vide : posé là, il reste aménagé, ses voisins ne bougent pas", () => {
    const items = units([["base-bas-2-portes", 1000], ["space", 1200], ["base-bas-1-porte", 600]]).map((i) => (isSpace(i) ? { ...i, furnished: "sk1" } : i));
    const p = plan("end", items);
    const [first, held, last] = items as [KitchenRunItem, KitchenRunItem, KitchenRunItem];
    // The last unit first, to the end of the wall: room opens between it and the caisson.
    const away = itemSlid(p, run(p), undefined, items, heights(p), last.id, 800);
    if (typeof away === "string") throw new Error(away);
    const fill = fillOf({ ...p, rest: { A: away.rest } }, away.items);
    expect(slideRoom(fill, held.id)).toEqual([0, 800]);
    const made = itemSlid({ ...p, rest: { A: away.rest } }, run(p), undefined, away.items, heights(p), held.id, 500);
    if (typeof made === "string") throw new Error(made);
    expect(made.items.find((i) => i.id === held.id)).toMatchObject({ model: "space", furnished: "sk1", width: 1200 });
    const now = fillOf({ ...p, rest: { A: made.rest } }, made.items);
    const where = (id: string) => Math.round([...now.placed, ...now.spaces].find((pl) => pl.item.id === id)!.at);
    expect([where(first.id), where(held.id), where(last.id)]).toEqual([0, 1500, 3000]);
  });

  it("une place gardée libre avant le reste du bout : pas de fileur là (rien ne s'y tient), le meuble se glisse dans la place", () => {
    const items = units([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["space", 500]]);
    const p = plan("end", items, 2150);
    const fill = fillOf(p, items);
    expect(fill.fillers.length).toBe(0);
    const made = itemSlid(p, run(p), undefined, items, heights(p), items[1]!.id, 300);
    if (typeof made === "string") throw new Error(made);
    const now = fillOf({ ...p, rest: { A: made.rest } }, made.items);
    expect(now.placed.find((pl) => pl.item.id === items[1]!.id)!.at).toBeCloseTo(fill.placed.find((pl) => pl.item.id === items[1]!.id)!.at + 300);
    expect(now.missing).toEqual([]);
  });

  it("des places gardées côte à côte ne font qu'une : un meuble de leur largeur à toutes s'y met", () => {
    const items = units([["wall-haut-1-porte", 600], ["space-wall", 100], ["base-bas-1-porte", 600], ["space-wall", 50], ["space-wall", 400], ["wall-haut-1-porte", 600]]);
    // The base unit between them is of another row: they are side by side up there.
    expect(joinedSpaces(items).filter(isSpace).map((i) => i.width)).toEqual([550]);
    const put = inKeptRoom(items, newItem(items, "wall-haut-1-porte", 550))!;
    expect(put.map((i) => [i.model, i.width])).toEqual([["wall-haut-1-porte", 600], ["wall-haut-1-porte", 550], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]]);
    // A furnished caisson's room is not joined.
    expect(joinedSpaces([items[1]!, { ...items[3]!, furnished: "sk1" }]).length).toBe(2);
  });
});
