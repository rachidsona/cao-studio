/**
 * Remplacer partout (le « Modify Style » de Polyboard) : une matière par une autre dans tout le projet, ou une
 * épaisseur de chant par une autre — les corps, et les standards de construction du projet qui la nommaient. Pur.
 */
import type { CadDocument } from "./types";

export interface Replacement {
  /** Material ids (document/materials.ts): `from` becomes `to`. */
  material?: [string, string];
  /** Edge band thickness (mm). */
  band?: [number, number];
}

/** The document with the replacement made, and how many bodies changed. */
export function replaceEverywhere(doc: CadDocument, r: Replacement): { doc: CadDocument; bodies: number } {
  let bodies = 0;
  const info = Object.fromEntries(
    Object.entries(doc.bodyInfo ?? {}).map(([id, i]) => {
      const material = r.material && i.material === r.material[0] ? r.material[1] : i.material;
      const banded = !!i.edges && Object.values(i.edges).some(Boolean);
      const band = r.band && banded && (i.band ?? 1) === r.band[0] ? r.band[1] : i.band;
      if (material === i.material && band === i.band) return [id, i];
      bodies++;
      return [id, { ...i, ...(material !== undefined ? { material } : {}), ...(band !== undefined ? { band } : {}) }];
    }),
  );
  const standards = doc.standards?.map((s) => ({
    ...s,
    ...(r.material ? Object.fromEntries((["carcass", "fronts", "backs"] as const).filter((k) => s[k] === r.material![0]).map((k) => [k, r.material![1]])) : {}),
    ...(r.band && s.band === r.band[0] ? { band: r.band[1] } : {}),
  }));
  return { doc: { ...doc, ...(doc.bodyInfo ? { bodyInfo: info } : {}), ...(standards ? { standards } : {}) }, bodies };
}

/** The materials used in the project and how many bodies use each. */
export function materialsUsed(doc: CadDocument): Map<string, number> {
  const used = new Map<string, number>();
  for (const i of Object.values(doc.bodyInfo ?? {})) if (i.material) used.set(i.material, (used.get(i.material) ?? 0) + 1);
  return used;
}
