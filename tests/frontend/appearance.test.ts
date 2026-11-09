/** Bibliothèque d'apparences : catalogue, recherche, apparence de chaque corps, textures calculées, matières three.js. */
import { describe, expect, it } from "vitest";
import { bodyAppearance, setBodyAppearance } from "../../frontend/src/appearance/assign";
import { APPEARANCES, CATEGORIES, MATERIAL_APPEARANCE, WALL_APPEARANCE, appearanceById, searchAppearances } from "../../frontend/src/appearance/library";
import { existsSync } from "node:fs";
import { grainMaps, motifMaps, normalMap, sampleMotif, shadesOf } from "../../frontend/src/appearance/textures";
import { appearanceMaterial, boardUvs } from "../../frontend/src/appearance/three-materials";
import { MATERIALS } from "../../frontend/src/document/materials";
import type { CadDocument } from "../../frontend/src/document/types";
import { validateDocument } from "../../frontend/src/document/validate";

const doc = (bodyInfo: CadDocument["bodyInfo"]): CadDocument => ({ version: 1, units: "mm", features: [], bodyInfo }) as unknown as CadDocument;
const box: [number[], number[]] = [[0, 0, 0], [600, 18, 2000]];

describe("catalogue d'apparences", () => {
  it("a des identifiants uniques, une catégorie connue et des valeurs physiques plausibles", () => {
    const ids = APPEARANCES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(APPEARANCES.length).toBeGreaterThan(80);
    const categories = new Set(CATEGORIES.map((c) => c.id));
    for (const a of APPEARANCES) {
      expect(categories.has(a.category)).toBe(true);
      expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.roughness).toBeGreaterThanOrEqual(0);
      expect(a.roughness).toBeLessThanOrEqual(1);
      if (a.pattern !== "plain") expect(a.color2 ?? a.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // « Mes motifs » holds only the images imported in a project.
    for (const c of CATEGORIES.filter((c) => c.id !== "custom")) expect(APPEARANCES.some((a) => a.category === c.id)).toBe(true);
  });

  it("donne une apparence à chaque matière de l'atelier", () => {
    for (const m of MATERIALS) expect(appearanceById(MATERIAL_APPEARANCE[m.id])).toBeDefined();
  });

  it("cherche sans tenir compte des accents ni des majuscules", () => {
    expect(searchAppearances("chene", null).map((a) => a.id)).toContain("wood-oak");
    expect(searchAppearances("MARBRE noir", null).map((a) => a.id)).toEqual(["marble-marquina"]);
    expect(searchAppearances("", "glass").every((a) => a.category === "glass")).toBe(true);
    expect(searchAppearances("ral 7016", null).map((a) => a.id)).toEqual(["ral-7016"]);
  });
});

describe("apparence d'un corps", () => {
  it("prend celle qu'on lui a donnée, sinon celle de sa matière, sinon le mur pour la pièce, sinon aucune", () => {
    expect(bodyAppearance(doc({ b: { material: "melamine-oak", appearance: "marble-carrara" } }), "b", box)?.appearance.id).toBe("marble-carrara");
    expect(bodyAppearance(doc({ b: { material: "solid-oak" } }), "b", box)?.appearance.id).toBe("wood-oak-varnished");
    expect(bodyAppearance(doc({ b: { room: true } }), "b", box)?.appearance).toBe(WALL_APPEARANCE);
    expect(bodyAppearance(doc({}), "b", box)).toBeNull();
    expect(bodyAppearance(doc({ b: { appearance: "inconnue" } }), "b", box)).toBeNull();
  });

  it("garde la couleur choisie pour une laque, pas pour un bois, et pose le fil dans la longueur ou la largeur", () => {
    expect(bodyAppearance(doc({ b: { appearance: "lacquer-satin", color: "#336699" } }), "b", box)?.color).toBe("#336699");
    expect(bodyAppearance(doc({ b: { appearance: "wood-oak", color: "#336699" } }), "b", box)?.color).toBeUndefined();
    expect(bodyAppearance(doc({ b: { appearance: "wood-oak" } }), "b", box)?.grainAxis).toBe(2);
    expect(bodyAppearance(doc({ b: { appearance: "wood-oak", grain: "width" } }), "b", box)?.grainAxis).toBe(0);
  });

  it("s'enregistre dans le document (et s'en retire), sans toucher à la matière", () => {
    const d = setBodyAppearance(doc({ b: { material: "mdf" } }), ["b"], "ral-5014", "#123456");
    expect(d.bodyInfo?.b).toMatchObject({ material: "mdf", appearance: "ral-5014", color: "#123456" });
    const back = setBodyAppearance(d, ["b"], null);
    expect(back.bodyInfo?.b?.appearance).toBeUndefined();
    expect(back.bodyInfo?.b?.material).toBe("mdf");
    expect(setBodyAppearance(doc({}), ["b"], "wood-walnut", "#123456").bodyInfo?.b?.color).toBeUndefined();
  });

  it("refuse une couleur mal formée dans un document", () => {
    const bad = { version: 1, units: "mm", features: [], bodyInfo: { b: { color: "bleu" } } };
    expect(validateDocument(bad).join(" ")).toMatch(/couleur/);
  });
});

describe("textures calculées", () => {
  it("restent dans leurs bornes et se raccordent pour chaque motif", () => {
    const size = 32;
    for (const pattern of ["wood", "marble", "granite", "terrazzo", "concrete", "fabric", "leather", "brushed", "slate", "cork"] as const) {
      for (const [u, v] of [[0.1, 0.2], [0.7, 0.9]]) {
        const [mix, height, light] = sampleMotif(pattern, u!, v!);
        expect(mix).toBeGreaterThanOrEqual(0);
        expect(mix).toBeLessThanOrEqual(1);
        expect(height).toBeGreaterThanOrEqual(-0.01);
        expect(height).toBeLessThanOrEqual(1.01);
        expect(Math.abs(light)).toBeLessThanOrEqual(1);
      }
      // Tiling: the texel just past the right edge is the first one again.
      const [a] = sampleMotif(pattern, 0, 0.37);
      const [b] = sampleMotif(pattern, 1, 0.37);
      expect(Math.abs(a - b)).toBeLessThan(0.02);
      const appearance = APPEARANCES.find((x) => x.pattern === pattern)!;
      expect(motifMaps(appearance, size).color.length).toBe(size * size * 4);
    }
  });

  it("font une carte de normales plate pour un relief plat", () => {
    const flat = normalMap(new Float32Array(16).fill(0.5), 4, 5);
    expect([flat[0], flat[1], flat[2]]).toEqual([128, 128, 255]);
  });

  it("tirent le veinage de chaque bois d'une photo de vrai bois, dans ses couleurs", () => {
    // Every computed wood has a photo to take its grain from, and the photo is there.
    for (const a of APPEARANCES.filter((x) => x.pattern === "wood" && !x.image)) {
      expect(a.grain, a.id).toMatch(/^\/static\/textures\/bois\/[a-z-]+\.jpg$/);
      expect(existsSync(a.grain!.slice(1)), a.grain).toBe(true);
    }
    // Two texels of a photo, one dark (a ring), one light: the same gaps whatever the photo's contrast.
    const shade = shadesOf([40, 30, 20, 255, 200, 180, 150, 255]);
    expect(shade[0]).toBeCloseTo(-1);
    expect(shade[1]).toBeCloseTo(1);
    expect(shadesOf([10, 10, 10, 255, 90, 90, 90, 255])[0]).toBeCloseTo(-1);
    // The ring in the wood's dark colour side, the rest in its light one; the ring lower in the relief.
    const walnut = appearanceById("wood-walnut")!;
    const { color, height } = grainMaps(new Float32Array([-2, 2, -2, 2]), 2, walnut);
    expect(color[0]!).toBeLessThan(0x6b);
    expect(color[4]).toBe(0x6b);
    expect(height[0]!).toBeLessThan(height[1]!);
  });

  it("suivent la couleur choisie en gardant le motif", () => {
    const linen = appearanceById("fabric-linen")!;
    const red = motifMaps(linen, 16, "#c00000").color;
    expect(red[0]!).toBeGreaterThan(red[1]! * 3);
  });
});

describe("coordonnées et matières three.js", () => {
  it("posent la texture dans le sens du fil sur chaque face", () => {
    const tile: [number, number] = [900, 300];
    const uv = boardUvs([100, 300, 0, 0, 450, 30], [0, 0, 1, 1, 0, 0], 1, tile);
    expect(uv[0]).toBeCloseTo(300 / 900);
    expect(uv[1]).toBeCloseTo(100 / 300);
    expect(uv[2]).toBeCloseTo(450 / 900);
    expect(uv[3]).toBeCloseTo(30 / 300);
  });

  it("posent une photo de bois d'un seul morceau sur tout le panneau, même de 20 m", () => {
    // A board 20 000 long along y, 600 wide along x: its corners go to the corners of the image, nothing repeats.
    const whole = { min: [0, 0, 0], size: [600, 20_000, 19] };
    const uv = boardUvs([0, 0, 19, 600, 20_000, 19, 300, 10_000, 19], [0, 0, 1, 0, 0, 1, 0, 0, 1], 1, [1000, 1000], whole);
    expect([...uv].map((x) => Number(x.toFixed(6)))).toEqual([0, 0, 1, 1, 0.5, 0.5]);
    expect(appearanceById("photo-walnut-crown")?.whole).toBe(true);
  });

  it("laissent passer la lumière par le verre au rendu, et le montrent transparent dans la vue", () => {
    const glass = appearanceById("glass-clear")!;
    expect(appearanceMaterial(glass, undefined, "render").transmission).toBe(1);
    const view = appearanceMaterial(glass, undefined, "view");
    expect(view.transmission).toBe(0);
    expect(view.transparent).toBe(true);
    expect(view.opacity).toBeLessThan(0.5);
    expect(appearanceMaterial(appearanceById("chrome")!, undefined, "view").metalness).toBe(1);
    expect(appearanceMaterial(appearanceById("wood-oak")!, undefined, "render", "lacquer").clearcoat).toBe(1);
    expect(appearanceMaterial(appearanceById("chrome")!, undefined, "render", "matte").roughness).toBeLessThan(0.1);
  });
});
