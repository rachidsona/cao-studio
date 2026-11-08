/** Le dessin de face des meubles du catalogue : à l'échelle, et fidèle à ce que contient le meuble. */
import { describe, expect, it } from "vitest";
import { elevation, unitSummary } from "../../frontend/src/app/unit-elevation";
import { CATALOG, type CatalogEntry } from "../../frontend/src/document/kitchen-catalog";

const unit = (id: string): CatalogEntry => CATALOG.find((e) => e.id === id)!;
const count = (svg: string, tag: string) => svg.split(`<${tag} `).length - 1;
const size = (svg: string) => [Number(/width="([\d.]+)"/.exec(svg)![1]), Number(/height="([\d.]+)"/.exec(svg)![1])];

describe("dessin d'un meuble", () => {
  it("garde les proportions d'une même famille", () => {
    const [narrow, wide] = [size(elevation(unit("base-bas-1-porte-300"))), size(elevation(unit("base-bas-2-portes-1200")))];
    expect(wide[0]).toBeCloseTo(narrow[0]! * 4, 5);
    expect(wide[1]).toBe(narrow[1]);
  });

  it("tient dans la case du catalogue, à toutes les largeurs", () => {
    for (const e of CATALOG) {
      const [w, h] = size(elevation(e));
      expect(w, e.id).toBeLessThanOrEqual(92);
      expect(h, e.id).toBeLessThanOrEqual(92);
    }
  });

  it("montre une poignée par porte et par tiroir", () => {
    expect(count(elevation(unit("base-bas-1-porte-600")), "line")).toBe(1);
    expect(count(elevation(unit("base-bas-2-portes-800")), "line")).toBe(2);
    expect(count(elevation(unit("base-bas-3-tiroirs-600")), "line")).toBe(3);
  });

  it("dessine le four dans sa niche et le robinet sur l'évier", () => {
    expect(elevation(unit("base-bas-four-600"))).toContain("fill-gray-700");
    expect(elevation(unit("base-bas-evier-800"))).toContain("<path");
    expect(elevation(unit("base-bas-2-portes-800"))).not.toContain("<path");
  });
});

describe("description d'un meuble", () => {
  it("dit ce qu'il contient", () => {
    expect(unitSummary(unit("base-bas-2-portes-800"))).toBe("2 portes · 1 étagère");
    expect(unitSummary(unit("wall-haut-1-porte-600"))).toBe("1 porte · 2 étagères");
    expect(unitSummary(unit("base-bas-3-tiroirs-600"))).toBe("3 tiroirs");
    expect(unitSummary(unit("base-bas-four-600"))).toBe("Niche pour four");
    expect(unitSummary(unit("base-bas-evier-800"))).toBe("2 portes · 2 traverses");
  });
});
