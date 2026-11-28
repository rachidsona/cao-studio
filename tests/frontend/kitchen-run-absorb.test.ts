/** Chaque meuble du linéaire garde sa place : la place gardée libre prend ce qui change avant elle ; rien ne sort du linéaire. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { absorbed, pushedOut } from "../../frontend/src/features/kitchen-run-absorb";
import { fillRun, newItem } from "../../frontend/src/features/kitchen-run-items";

const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" } };
const fill = (items: readonly KitchenRunItem[]) => fillRun(runGeometry(p, kitchenRuns(p)[0]!), items, { worktop: p.worktopHeight, wallBottom: kitchenSizes(p).wallBottom, wallTop: kitchenSizes(p).wallTop });
const at = (items: readonly KitchenRunItem[], id: string) => Math.round([...fill(items).placed, ...fill(items).spaces].find((q) => q.item.id === id)?.at ?? -1);
// A unit of 60, a room kept free of 100, a caisson in Répartition of 60 (a kept room that holds one), then a unit of 60.
const a: KitchenRunItem = { id: "a", model: "base-bas-1-porte", width: 600 };
const room: KitchenRunItem = { id: "r", model: "space", width: 1000 };
const held: KitchenRunItem = { id: "h", model: "space", width: 600, furnished: "sk9" };
const b: KitchenRunItem = { id: "b", model: "base-bas-1-porte", width: 600 };
const items = [a, room, held, b];

describe("chaque meuble garde sa place", () => {
  it("un meuble élargi prend sur la place gardée libre après lui : le caisson et le meuble d'après ne bougent pas", () => {
    const wide = absorbed(items, items.map((i) => (i.id === "a" ? { ...i, width: 900 } : i)), fill);
    expect(wide.find((i) => i.id === "r")!.width).toBe(700);
    expect([at(wide, "h"), at(wide, "b")]).toEqual([at(items, "h"), at(items, "b")]);
    // Narrower again: the room takes it back.
    const narrow = absorbed(wide, wide.map((i) => (i.id === "a" ? { ...i, width: 400 } : i)), fill);
    expect(narrow.find((i) => i.id === "r")!.width).toBe(1200);
    expect(at(narrow, "h")).toBe(at(items, "h"));
  });

  it("un meuble ajouté avant la place gardée libre la prend ; plus large qu'elle, il pousse la suite et se voit refusé", () => {
    const more = { ...newItem(items, "base-bas-1-porte", 400), id: "n" };
    const put = absorbed(items, [a, more, room, held, b], fill);
    expect(put.find((i) => i.id === "r")!.width).toBe(600);
    expect(at(put, "h")).toBe(at(items, "h"));
    // 1500 where 1000 is free: the room goes whole, the rest pushes — the last unit out of the run.
    const big = absorbed(items, [a, { ...more, width: 1900 }, room, held, b], fill);
    expect(pushedOut(fill(items), fill(big)).map((i) => i.id)).toContain("b");
  });

  it("un caisson en Répartition poussé hors du linéaire compte comme un meuble perdu", () => {
    const long = [a, { ...room, width: 2500 }, held];
    expect(pushedOut(fill([a, room, held]), fill(long)).map((i) => i.id)).toEqual(["h"]);
  });

  it("un changement de places (une place gardée faite, ôtée, redimensionnée ; un ordre changé) est laissé tel quel", () => {
    expect(absorbed(items, [a, { ...room, width: 500 }, held, b], fill)).toEqual([a, { ...room, width: 500 }, held, b]);
    expect(absorbed(items, [room, a, held, b], fill)).toEqual([room, a, held, b]);
    expect(absorbed(items, [a, held, b], fill)).toEqual([a, held, b]);
  });
});
