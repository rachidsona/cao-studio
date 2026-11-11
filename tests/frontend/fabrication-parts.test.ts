/**
 * Les pièces à fabriquer viennent du document, pas de la vue (audit d'architecture du 11/11/2026) : un caisson caché
 * par l'œil ou sur un calque masqué reste dans la liste de débit, le devis et la CNC ; murs et quincaillerie en sortent.
 */
import { describe, expect, it } from "vitest";
import { fabricationParts, isFabricated, type ComputedBody } from "../../frontend/src/document/fabrication-parts";
import { cutList } from "../../frontend/src/document/cut-list";
import { setBodyInfo } from "../../frontend/src/document/materials";
import { isBodyHidden } from "../../frontend/src/document/operations";
import { cabinetParts } from "../../frontend/src/features/cabinet-parts";
import type { CabinetFeature, CadDocument } from "../../frontend/src/document/types";

const cabinet = (id: string, x: number): CabinetFeature => ({ id, type: "cabinet", name: `Caisson ${id}`, origin: [x, 0, 0], width: 600, height: 720, depth: 560, thickness: 18, back: "applied", backThickness: 3, shelves: 1, plinth: 0, construction: "sides-through" });
const bodiesOf = (c: CabinetFeature): ComputedBody[] =>
  cabinetParts(c).map((p, i) => ({ bodyId: `${c.id}#${i}`, metrics: { bbox: [p.from, p.to], volume: (p.to[0] - p.from[0]) * (p.to[1] - p.from[1]) * (p.to[2] - p.from[2]) } }));

describe("pièces à fabriquer", () => {
  const a = cabinet("cb1", 0);
  const b = cabinet("cb2", 600);
  // The second cabinet hidden with the eye of the browser, piece by piece.
  const doc: CadDocument = { format: "cao-studio", schemaVersion: 2, units: "mm", parameters: {}, features: [a, b], hiddenBodies: bodiesOf(b).map((x) => x.bodyId) };
  const bodies = [...bodiesOf(a), ...bodiesOf(b)];

  it("un caisson caché par l'œil reste dans la liste de débit", () => {
    expect(isBodyHidden(doc, "cb2#0")).toBe(true);
    const parts = fabricationParts(doc, bodies);
    expect(parts.map((p) => p.id)).toEqual(bodies.map((b) => b.bodyId));
    const count = cutList(doc, parts).rows.reduce((n, r) => n + r.quantity, 0);
    expect(count).toBe(bodies.length);
  });

  it("les murs de la pièce n'en sont pas", () => {
    const withWall = setBodyInfo(doc, ["cb1#0"], { room: true });
    expect(isFabricated(withWall, "cb1#0")).toBe(false);
    expect(fabricationParts(withWall, bodies).map((p) => p.id)).not.toContain("cb1#0");
  });
});
