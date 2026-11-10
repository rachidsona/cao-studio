/** Le plan de travail et la crédence d'un linéaire suivent ses meubles : rien au-dessus de la place libre ni à travers une colonne. */
import { describe, expect, it } from "vitest";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const plan = (list: [string, number, Partial<KitchenRunItem>?][], rest: "start" | "end" = "end"): KitchenFloorPlan => {
  let items: KitchenRunItem[] = [];
  for (const [model, width, more] of list) items = [...items, { ...newItem(items, model, width), ...more }];
  return { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: rest }, runs: { A: items } };
};
/** The pieces of a kind, each from where to where along the wall (x). */
const spans = (p: KitchenFloorPlan, kind: string) => kitchenFromPlan(p).boxes.filter((b) => b.kind === kind).map((b) => [b.name, Math.round(b.from[0]), Math.round(b.to[0])]);

describe("plan de travail qui suit les meubles", () => {
  it("s'arrête au dernier meuble : rien au-dessus de la place qui reste, la crédence non plus", () => {
    const p = plan([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]]);
    expect(spans(p, "worktop")).toEqual([["Plan de travail A", 0, 1600]]);
    expect(spans(p, "splashback")).toEqual([["Crédence A", 0, 1600]]);
    // The rest of the wall at the start: the worktop starts where the units do.
    expect(spans(plan([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600]], "start"), "worktop")).toEqual([["Plan de travail A", 2000, 3600]]);
    // The wall full: one worktop from end to end, as before.
    expect(spans(plan([["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200], ["base-bas-2-portes", 1200]]), "worktop")).toEqual([["Plan de travail A", 0, 3600]]);
  });

  it("s'interrompt sur une place gardée libre et à une colonne, pas sur celle d'un caisson aménagé ni d'un lave-vaisselle", () => {
    // A room kept free between two units (a cooker to come): two worktops, the second named after the first.
    const gap = plan([["base-bas-2-portes", 1000], ["space", 600], ["base-bas-1-porte", 600]]);
    expect(spans(gap, "worktop")).toEqual([["Plan de travail A", 0, 1000], ["Plan de travail A2", 1600, 2200]]);
    expect(spans(gap, "splashback")).toEqual([["Crédence A", 0, 1000], ["Crédence A2", 1600, 2200]]);
    // Held by a furnished caisson: the worktop runs over it.
    expect(spans(plan([["base-bas-2-portes", 1000], ["space", 600, { furnished: "sk9" }], ["base-bas-1-porte", 600]]), "worktop")).toEqual([["Plan de travail A", 0, 2200]]);
    // A dishwasher has no cabinet, but the worktop covers it; a column stops it.
    expect(spans(plan([["base-bas-2-portes", 1000], ["app-dishwasher", 600], ["base-bas-1-porte", 600]]), "worktop")).toEqual([["Plan de travail A", 0, 2200]]);
    expect(spans(plan([["base-bas-2-portes", 1000], ["tall-colonne-rangement", 600], ["base-bas-1-porte", 600]]), "worktop")).toEqual([["Plan de travail A", 0, 1000], ["Plan de travail A2", 1600, 2200]]);
  });

  it("donne à chaque morceau les découpes des meubles qu'il couvre", () => {
    const p = plan([["base-bas-1-porte", 600], ["app-sink", 800], ["base-bas-1-porte", 400], ["space", 600], ["base-bas-1-porte", 300], ["app-hob", 600], ["base-bas-1-porte", 300]]);
    const tops = kitchenFromPlan(p).boxes.filter((b) => b.kind === "worktop");
    expect(tops.map((b) => [b.name, (b.holes ?? []).map((h) => h.appliance)])).toEqual([["Plan de travail A", ["sink-1"]], ["Plan de travail A2", ["hob-60"]]]);
  });
});
