/**
 * Un projet s'ouvre toujours (audit d'architecture du 11/11/2026) : une opération que l'éditeur ne sait pas utiliser
 * est désactivée et signalée, pas le projet entier refusé ; seule une faute du document lui-même l'empêche d'ouvrir.
 */
import { describe, expect, it } from "vitest";
import { createReferencePlate } from "../../frontend/src/document/types";
import { openDocument, validateDocument } from "../../frontend/src/document/validate";

const plate = () => createReferencePlate();

describe("ouverture d'un projet", () => {
  it("un document valide s'ouvre tel quel, sans problème", () => {
    const { doc, problems } = openDocument(plate());
    expect(problems).toEqual([]);
    expect(doc.features.map((f) => f.id)).toEqual(plate().features.map((f) => f.id));
  });

  it("une opération invalide est désactivée et dite ; les autres restent", () => {
    const broken = plate();
    const hole = broken.features.find((f) => f.type === "hole")!;
    (hole as unknown as { diameter: unknown }).diameter = "large";
    const { doc, problems } = openDocument(broken);
    expect(doc.features).toHaveLength(plate().features.length);
    expect(doc.features.find((f) => f.id === hole.id)?.suppressed).toBe(true);
    expect(doc.features.filter((f) => f.suppressed)).toHaveLength(1);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/désactivée/);
  });

  it("une opération sans identifiant est retirée", () => {
    const broken = plate();
    (broken.features as unknown[]).push({ type: "hole", name: "Perçage perdu" });
    const { doc, problems } = openDocument(broken);
    expect(doc.features).toHaveLength(plate().features.length);
    expect(problems[0]).toMatch(/« Perçage perdu » est retirée/);
  });

  it("une faute du document lui-même l'empêche toujours d'ouvrir", () => {
    expect(() => openDocument({ ...plate(), format: "autre" })).toThrow(/Document invalide/);
    expect(validateDocument({ ...plate(), format: "autre" }).length).toBeGreaterThan(0);
  });
});
