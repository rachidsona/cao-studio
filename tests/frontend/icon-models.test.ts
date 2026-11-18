/**
 * Les modèles d'icônes (static/icons/*.svg, faits par scripts/icon_models.py) : chacun redessine les mêmes outils, tous
 * connus de la page, et ne contient que du dessin — des symboles, un groupe, des tracés, des dégradés —, rien qui
 * s'exécute.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICON_MODELS } from "../../frontend/src/app/icon-models";

const ids = (text: string) => [...text.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]!);
const page = new Set(ids(readFileSync("templates/editor/_icons.html", "utf8")));
const files = ICON_MODELS.map((model) => [model, readFileSync(`static/icons/${model}.svg`, "utf8")] as const);

describe("modèles d'icônes", () => {
  it("les trois modèles redessinent les mêmes outils, tous dans la page", () => {
    const [first, ...others] = files.map(([, text]) => ids(text));
    expect(first!.length).toBeGreaterThanOrEqual(35);
    for (const other of others) expect(other).toEqual(first);
    expect(first!.filter((id) => !page.has(id))).toEqual([]);
  });

  it("rien que du dessin : symboles, groupe, tracés et dégradés, sans script, lien ni style", () => {
    for (const [model, text] of files) {
      const tags = new Set([...text.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]));
      expect([...tags].filter((t) => !["defs", "linearGradient", "stop"].includes(t!)).sort(), model).toEqual(["g", "path", "svg", "symbol"]);
      const attributes = new Set([...text.matchAll(/\s([a-zA-Z:-]+)="/g)].map((m) => m[1]));
      expect([...attributes].filter((a) => !["xmlns", "id", "viewBox", "d", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "x1", "y1", "x2", "y2", "offset", "stop-color"].includes(a!)), model).toEqual([]);
    }
  });

  it("deux modèles ne dessinent pas un outil de la même façon", () => {
    const drawing = (text: string, id: string) => text.match(new RegExp(`<symbol id="${id}"[^>]*>(.*?)</symbol>`))![1]!.replace(/ stroke-(width|linecap|linejoin)="[^"]*"/g, "");
    const [a, b, c] = files.map(([, text]) => text);
    for (const id of ids(a!)) {
      const [x, y, z] = [drawing(a!, id), drawing(b!, id), drawing(c!, id)];
      expect(x === y || y === z || x === z, id).toBe(false);
    }
  });
});
