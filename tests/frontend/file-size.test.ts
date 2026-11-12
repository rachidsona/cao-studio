/**
 * La règle du projet : un fichier source de 500 lignes au plus (audit d'architecture du 11/11/2026). Les fichiers qui
 * la dépassaient déjà sont listés ici, à découper ; aucun autre ne peut la dépasser. Un fichier découpé sous 500 lignes
 * se retire de la liste.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LIMIT = 500;
/** Already over the limit on 12/11/2026: to be split (document/types.ts by family, viewport.ts…). */
const KNOWN = new Set([
  "frontend/src/document/types.ts",
  "frontend/src/viewport/viewport.ts",
  "frontend/src/app/extrude-tool.ts",
  "frontend/src/app/move-tool.ts",
  "frontend/src/sketcher/mode.ts",
  "frontend/src/app/editor.ts",
  "frontend/src/app/sketch-controller.ts",
]);

function sources(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "migrations" && name !== "__pycache__") sources(path, ext, out);
    } else if (ext.test(name)) out.push(path);
  }
  return out;
}

const lines = (path: string) => readFileSync(path, "utf8").split("\n").length - 1;

describe("taille des fichiers source", () => {
  const files = [...sources("frontend/src", /\.ts$/), ...sources("apps", /\.py$/), ...sources("config", /\.py$/)];

  it("aucun nouveau fichier ne dépasse 500 lignes", () => {
    const over = files.filter((f) => !KNOWN.has(f) && lines(f) > LIMIT).map((f) => `${f} (${lines(f)} lignes)`);
    expect(over).toEqual([]);
  });

  it("la liste des fichiers à découper ne garde que ceux qui dépassent encore", () => {
    const done = [...KNOWN].filter((f) => files.includes(f) && lines(f) <= LIMIT);
    expect(done, "découpés sous 500 lignes : à retirer de la liste").toEqual([]);
  });
});
