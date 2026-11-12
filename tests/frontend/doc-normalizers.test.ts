/**
 * Les règles qui gardent le plan de cuisine et ses appareils d'accord avec la 3D sont celles du document (audit
 * d'architecture du 11/11/2026) : elles s'appliquent sans qu'aucun écran ne les ait enregistrées.
 */
import { describe, expect, it } from "vitest";
import { normalizeDoc } from "../../frontend/src/document/doc-normalizers";
import { createReferencePlate } from "../../frontend/src/document/types";

describe("règles du document à chaque changement", () => {
  it("un document sans cuisine passe tel quel", () => {
    const before = createReferencePlate();
    const after = { ...before, units: "mm" as const };
    expect(normalizeDoc(before, after)).toEqual(after);
  });
});
