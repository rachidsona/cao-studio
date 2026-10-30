/** Historique : chaque type d'opération a son icône (celle de son outil) et son nom. */
import { describe, expect, it } from "vitest";
import { TYPE_ICONS, TYPE_LABELS, TYPE_SPRITES } from "../../frontend/src/ui/feature-meta";
import { readFileSync } from "node:fs";

const sprites = new Set([...readFileSync("templates/editor/_icons.html", "utf8").matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));

describe("icônes de l'historique", () => {
  it("couvrent tous les types d'opérations, avec une icône qui existe dans la palette", () => {
    for (const type of Object.keys(TYPE_LABELS)) {
      expect(TYPE_SPRITES[type as keyof typeof TYPE_SPRITES], type).toBeDefined();
      expect(TYPE_ICONS[type as keyof typeof TYPE_ICONS], type).toBeDefined();
    }
    for (const [type, id] of Object.entries(TYPE_SPRITES)) expect(sprites.has(id), `${type} → ${id}`).toBe(true);
  });

  it("a les icônes de la fenêtre d'une opération (modifier, désactiver, réactiver, supprimer)", () => {
    for (const id of ["i-op-edit", "i-op-suppress", "i-op-restore", "i-op-trash"]) expect(sprites.has(id), id).toBe(true);
  });

  it("a une icône 2D propre au Réseau d'esquisse, distincte de celle du Réseau 3D du modèle", () => {
    expect(sprites.has("i-sketch-array")).toBe(true);
    const page = readFileSync("templates/editor/editor.html", "utf8");
    expect(page).toMatch(/data-sketch-tool="array"[^>]*><svg[^>]*><use href="#i-sketch-array"/);
    expect(page).toMatch(/data-action="rect-array"[^>]*><svg[^>]*><use href="#i-rect-array"/);
  });
});
