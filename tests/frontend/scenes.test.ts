/** Scenes (saved views), tape measure text and guides in the document. */
import { describe, expect, it } from "vitest";
import { measureText } from "../../frontend/src/app/measure";
import { freshSceneName } from "../../frontend/src/app/workshop/scenes";
import type { CadDocument } from "../../frontend/src/document/types";
import { parseDocument } from "../../frontend/src/document/validate";

const base: CadDocument = {
  format: "cao-studio",
  schemaVersion: 2,
  units: "mm",
  parameters: {},
  features: [],
  views: [{ name: "Vue iso", position: [100, -200, 150], target: [0, 0, 0], up: [0, 0, 1] }],
  guides: [{ from: [0, 0, 0], to: [0, 0, 720] }],
};

describe("scènes et guides dans le document", () => {
  it("les vues et les guides font l'aller-retour", () => {
    expect(parseDocument(JSON.parse(JSON.stringify(base)))).toEqual(base);
  });

  it("une vue ou un guide mal formé est refusé", () => {
    const bad = JSON.parse(JSON.stringify(base));
    bad.guides = [{ from: [0, 0], to: [1, 1, 1] }];
    expect(() => parseDocument(bad)).toThrow(/guides/);
    const worse = JSON.parse(JSON.stringify(base));
    worse.views[0].up = "z";
    expect(() => parseDocument(worse)).toThrow(/views/);
  });

  it("nom de scène : le premier « Scène n » libre", () => {
    expect(freshSceneName([])).toBe("Scène 1");
    expect(freshSceneName([{ ...base.views![0]!, name: "Scène 2" }])).toBe("Scène 3");
    expect(freshSceneName([{ ...base.views![0]!, name: "Scène 2" }, { ...base.views![0]!, name: "Scène 3" }])).toBe("Scène 4");
  });
});

describe("mètre", () => {
  it("une ligne le long d'un axe : la longueur seule ; en biais : avec ΔX, ΔY, ΔZ", () => {
    expect(measureText([0, 0, 0], [0, 0, 720], "mm")).toBe("720 mm");
    expect(measureText([0, 0, 0], [300, 0, 400], "mm")).toBe("500 mm (ΔX 300 mm · ΔY 0 mm · ΔZ 400 mm)");
    expect(measureText([10, 0, 0], [10, 50, 0], "cm")).toBe("5 cm");
  });
});
