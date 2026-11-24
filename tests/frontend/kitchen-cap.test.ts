/** La casquette des meubles hauts du Plan de cuisine (document/kitchen-cap.ts). */
import { describe, expect, it } from "vitest";
import { kitchenFromPlan } from "../../frontend/src/document/kitchen-plan-build";
import { KITCHEN_PLAN, capProblem, kitchenPlanProblem, kitchenSizes } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { newItem } from "../../frontend/src/features/kitchen-run-items";

const plan = (list: [string, number][], more: Partial<KitchenFloorPlan> = { cap: "flat" }): KitchenFloorPlan => {
  let items: KitchenRunItem[] = [];
  for (const [model, width] of list) items = [...items, newItem(items, model, width)];
  return { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A: items }, ...more };
};
const caps = (p: KitchenFloorPlan) => kitchenFromPlan(p).boxes.filter((b) => b.name.includes("asquette"));
/** Each piece: its name, from where to where along the wall (x), how far off it (y) and up (z). */
const pieces = (p: KitchenFloorPlan) => caps(p).map((b) => [b.name, Math.round(b.from[0]), Math.round(b.to[0]), Math.round(b.from[1]), Math.round(b.to[1]), b.from[2], b.to[2]]);
const TOP = kitchenSizes(KITCHEN_PLAN).wallTop;
const WALL = ["wall-haut-1-porte", 600] as [string, number];

describe("casquette des meubles hauts", () => {
  it("couvre la rangée haute, déborde devant et aux bouts libres, s'interrompt à la hotte", () => {
    const p = plan([WALL, ["app-hood", 600], WALL]);
    // 350 deep, the front's 19 and 30 of overhang; 38 thick on top of the wall units.
    expect(pieces(p)).toEqual([
      ["Casquette A", -30, 600, -399, 0, TOP, TOP + 38],
      ["Casquette A2", 1200, 1830, -399, 0, TOP, TOP + 38],
    ]);
    expect(caps(p).every((b) => b.kind === "panel")).toBe(true);
    expect(caps({ ...p, cap: undefined })).toEqual([]);
  });

  it("passe par-dessus la joue de finition, et prend l'épaisseur et le débord choisis", () => {
    const p = plan([WALL, WALL], { cap: "flat", endPanels: true, capThickness: 19, capOverhang: 0 });
    expect(pieces(p)).toEqual([["Casquette A", -19, 1219, -369, 0, TOP, TOP + 19]]);
  });

  it("sur une colonne, plus profonde : un morceau à part", () => {
    const p = plan([["tall-colonne-rangement", 600], WALL]);
    const D = kitchenSizes(p).cabinet;
    expect(pieces(p)).toEqual([
      ["Casquette A", -30, 600, -(D + 49), 0, TOP, TOP + 38],
      ["Casquette A2", 600, 1230, -399, 0, TOP, TOP + 38],
    ]);
  });

  it("en caisson : le dessus, le bandeau devant et les bouts aux bouts libres", () => {
    const p = plan([WALL], { cap: "box", capHeight: 100 });
    expect(pieces(p)).toEqual([
      ["Casquette A", -30, 630, -399, 0, TOP + 81, TOP + 100],
      ["Bandeau de casquette A", -30, 630, -399, -380, TOP, TOP + 81],
      ["Bout de casquette A (gauche)", -30, -11, -380, 0, TOP, TOP + 81],
      ["Bout de casquette A (droite)", 611, 630, -380, 0, TOP, TOP + 81],
    ]);
  });

  it("plus longue qu'un panneau brut : coupée au droit d'un côté de meuble", () => {
    const p = plan([["wall-haut-1-porte", 900], ["wall-haut-1-porte", 900], ["wall-haut-1-porte", 900], ["wall-haut-1-porte", 900]]);
    expect(pieces(p).map(([name, a, b]) => [name, a, b])).toEqual([["Casquette A", -30, 2700], ["Casquette A2", 2700, 3630]]);
    expect(kitchenFromPlan(p).notes.some((n) => n.startsWith("Casquette A : plus longue"))).toBe(true);
  });

  it("prévient : une porte relevante dessous, un plafond trop bas", () => {
    const lift = plan([["wall-haut-relevant", 600]]);
    expect(kitchenFromPlan(lift).notes.some((n) => n.includes("relevante bute contre la casquette"))).toBe(true);
    const low = plan([WALL], { cap: "flat", height: TOP + 20 });
    expect(caps(low)).toEqual([]);
    expect(kitchenFromPlan(low).notes.some((n) => n.includes("pas de casquette là"))).toBe(true);
  });

  it("refuse des cotes hors des limites", () => {
    expect(kitchenPlanProblem(plan([WALL], { cap: "flat", capThickness: 80 }))).toBe("La casquette a de 16 à 60 mm d'épaisseur.");
    expect(kitchenPlanProblem(plan([WALL], { cap: "box", capHeight: 300 }))).toBe("La casquette en caisson a de 4 à 20 cm de hauteur.");
    expect(kitchenPlanProblem(plan([WALL], { cap: "flat", capOverhang: 150 }))).toBe("Le débord de la casquette va de 0 à 10 cm.");
    expect(kitchenPlanProblem(plan([WALL]))).toBeNull();
  });

  it("dans un angle, s'arrête au bord de la casquette du linéaire qui passe", () => {
    const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
    const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "L-left", lengthA: 3000, lengthB: 2500, cap: "flat", wallCorners: { left: "unit" }, rest: { A: "end", B: "start" }, runs: { A: units([WALL]), B: units([WALL]) } };
    const all = caps(p);
    // Wall A along x at y = 0, wall B along y at x = 0: nowhere do two pieces overlap.
    const overlap = (a: (typeof all)[number], b: (typeof all)[number]) => [0, 1, 2].every((i) => Math.min(a.to[i]!, b.to[i]!) - Math.max(a.from[i]!, b.from[i]!) > 0.5);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((a, i) => all.some((b, j) => i < j && overlap(a, b)))).toBe(false);
  });
});

describe("casquette en caissons à porte relevante (sur-meubles)", () => {
  const units = (p: KitchenFloorPlan) => kitchenFromPlan(p).units.filter((u) => u.name.startsWith("Casquette"));

  it("un caisson par meuble haut et par colonne, de sa largeur, 60 cm de profondeur (réglable), posé dessus ; pas sur la hotte", () => {
    const p = plan([["tall-colonne-rangement", 600], WALL, ["app-hood", 600], ["wall-haut-1-porte", 400]], { cap: "units" });
    const made = units(p);
    expect(made.map((u) => [u.width, u.height, u.layout, u.side])).toEqual([
      [600, 350, "door", "top"],
      [600, 350, "door", "top"],
      [400, 350, "door", "top"],
    ]);
    // On top of the wall row; 60 cm deep over a column and a wall unit alike, or as set.
    expect(made.every((u) => Math.abs(u.origin[2] - TOP) < 1e-6)).toBe(true);
    expect(made.map((u) => u.depth)).toEqual([600, 600, 600]);
    expect(units({ ...p, capDepth: 450 }).map((u) => u.depth)).toEqual([450, 450, 450]);
    expect(capProblem({ ...p, capDepth: 900 })).toMatch(/profondeur/);
    // No panels of a flat casquette.
    expect(caps(p)).toEqual([]);
  });

  it("sur les meubles hauts d'angle aussi (droit ou en L), sans qu'aucun caisson n'en recouvre un autre", async () => {
    const { cabinetBox } = await import("../../frontend/src/document/kitchen-catalog");
    const list = (l: [string, number][]) => l.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
    for (const corner of ["unit", "l"] as const) {
      const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "L-left", lengthA: 3000, lengthB: 2500, cap: "units", wallCorners: { left: corner }, rest: { A: "end", B: "start" }, runs: { A: list([WALL]), B: list([WALL]) } };
      const made = units(p);
      expect(made.some((u) => u.name.startsWith("Casquette d'angle"))).toBe(true);
      expect(made.every((u) => Math.abs(u.origin[2] - TOP) < 1e-6)).toBe(true);
      const boxes = made.map((u) => cabinetBox(u));
      const overlap = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => [0, 1, 2].every((i) => Math.min(a[1][i]!, b[1][i]!) - Math.max(a[0][i]!, b[0][i]!) > 0.5);
      expect(boxes.some((a, i) => boxes.some((b, j) => i < j && overlap(a, b)))).toBe(false);
    }
  });

  it("leur hauteur choisie, de 25 à 60 cm ; sous un plafond trop bas, pas de caisson et un mot", () => {
    expect(units(plan([WALL], { cap: "units", capHeight: 300 }))[0]!.height).toBe(300);
    expect(kitchenPlanProblem(plan([WALL], { cap: "units", capHeight: 100 }))).toMatch(/25 à 60 cm/);
    const low = kitchenFromPlan(plan([WALL], { cap: "units", height: TOP + 200 }));
    expect(low.units.filter((u) => u.name.startsWith("Casquette"))).toEqual([]);
    expect(low.notes.join(" ")).toMatch(/pas de caisson là/);
  });
});
