/**
 * Règles de quincaillerie et d'assemblage, vérifiées avant la fabrication (comme l'anti-collision de Polyboard et le
 * scan des connecteurs d'imos), en calcul pur :
 * - deux planches qui se touchent (le chant de l'une contre la face de l'autre) sans vis, tourillon ni excentrique ;
 * - une porte trop lourde pour ses charnières (le nombre qu'il faudrait, d'après son poids et sa hauteur) ;
 * - une charnière dont l'embase tomberait sur une étagère du caisson (les perçages des façades l'évitent déjà en
 *   décalant la charnière de 32 mm, features/fronts.ts ; reste ce qu'on ne peut pas décaler).
 * Les charges sont des repères courants : la fiche du fabricant fait foi.
 */
import { junctions, type Board } from "../features/assembly-rules";
import { cabinetParts } from "../features/cabinet-parts";
import { frontsParts, hingeCount, hingeHeights } from "../features/fronts-parts";
import { nichePartsIn } from "../features/niche-parts";
import { partMass } from "../features/stability";
import type { Problem } from "./fabrication-check";
import { bodyInfo } from "./materials";
import { bodyLabel } from "./operations";
import { PART_SEPARATOR, type CabinetFeature, type CadDocument, type MachiningOp, type Vec3 } from "./types";

/** What one Ø35 hinge carries, as a common guide (kg). */
export const HINGE_LOAD = 4.5;

/** Hinges a door needs: by its height, and by its weight. */
export function hingesNeeded(height: number, mass: number): number {
  return Math.max(hingeCount(height), Math.ceil(mass / HINGE_LOAD));
}

/** The machining operations a body carries: those of the machining that made it and of every one before. */
export function opsOf(doc: CadDocument, bodyId: string): MachiningOp[] {
  const out: MachiningOp[] = [];
  let id: string | undefined = bodyId;
  for (let guard = 0; id && guard < 200; guard++) {
    const f = doc.features.find((x) => x.id === id);
    if (f?.type !== "machining") break;
    out.push(...f.ops);
    id = f.target;
  }
  return out;
}

const inside = (p: Vec3, lo: Vec3, hi: Vec3, pad: number) => [0, 1, 2].every((i) => p[i]! >= lo[i]! - pad && p[i]! <= hi[i]! + pad);
const crosses = (from: Vec3, to: Vec3, lo: Vec3, hi: Vec3, pad: number) => [0, 1, 2].every((i) => Math.min(from[i]!, to[i]!) <= hi[i]! + pad && Math.max(from[i]!, to[i]!) >= lo[i]! - pad);

/** Junctions of the boards with no fastener at them (no hole near where they touch, no tenon or half-lap). */
export function jointProblems(doc: CadDocument, boards: readonly Board[]): Problem[] {
  const all = junctions([...boards]);
  const loose = all.flatMap((j) => {
    const [lo, hi] = j.contact.overlap;
    // A hole whose mouth is within a board's thickness of the contact belongs to it.
    const pad = 25;
    const fastened = [j.face, j.edge].some((id) => opsOf(doc, id).some((op) => (op.kind === "hole" ? inside(op.at, lo, hi, pad) : crosses(op.from, op.to, lo, hi, 1))));
    if (fastened) return [];
    return [{ kind: "joint" as const, severity: "warning" as const, message: `${bodyLabel(doc, j.edge)} touche ${bodyLabel(doc, j.face)} sans assemblage (ni vis, ni tourillon, ni excentrique) : Menuiserie › Règles d'assemblage.`, bodies: [j.face, j.edge] }];
  });
  // Nothing assembled yet: one line, not one per joint.
  if (loose.length > 3 && loose.length === all.length) {
    return [{ kind: "joint", severity: "warning", message: `Aucune des ${all.length} jonctions n'est assemblée : Menuiserie › Règles d'assemblage les perce toutes d'un coup (confirmat, tourillons ou excentriques).`, bodies: [...new Set(loose.flatMap((p) => p.bodies))] }];
  }
  return loose;
}

/** Doors heavier than their hinges carry, and hinges that cannot keep clear of a shelf. */
export function doorProblems(doc: CadDocument): Problem[] {
  const problems: Problem[] = [];
  const check = (id: string, size: number[], height: number, hinges: number) => {
    const mass = partMass(size[0]! * size[1]! * size[2]!, bodyInfo(doc, id).material);
    const needed = hingesNeeded(height, mass);
    if (hinges < needed) problems.push({ kind: "hardware", severity: "warning", message: `${bodyLabel(doc, id)} pèse ${mass.toFixed(1)} kg pour ${hinges} charnières : il en faudrait ${needed} (≈ ${HINGE_LOAD} kg par charnière).`, bodies: [id] });
  };
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "fronts" && f.hinges) {
      const cabinet = doc.features.find((c): c is CabinetFeature => c.id === f.cabinet && c.type === "cabinet");
      if (!cabinet) continue;
      const shelves = shelfBands(cabinet);
      frontsParts(f, cabinet).forEach((p, i) => {
        if (p.role?.kind !== "door") return;
        const id = `${f.id}${PART_SEPARATOR}${i}`;
        const size = [0, 1, 2].map((k) => Math.abs(p.to[k]! - p.from[k]!));
        const n = hingeCount(size[2]!);
        check(id, size, size[2]!, n);
        const { blocked } = hingeHeights(p.from[2], p.to[2], n, shelves);
        if (blocked.length) problems.push({ kind: "hardware", severity: "warning", message: `${bodyLabel(doc, id)} : ${blocked.length > 1 ? "des charnières tombent" : "une charnière tombe"} sur une étagère, même décalée de 32 mm ; déplacez l'étagère.`, bodies: [id] });
      });
    } else if (f.type === "niche" && (f.fill === "doors" || f.fill === "door")) {
      nichePartsIn(doc.features, f).forEach((p, i) => {
        if (p.role !== "front") return;
        const size = [0, 1, 2].map((k) => Math.abs(p.to[k]! - p.from[k]!));
        check(`${f.id}${PART_SEPARATOR}${i}`, size, size[1]!, hingeCount(size[1]!));
      });
    }
  }
  return problems;
}

/** The heights (absolute z) the shelves of a cabinet take, where a hinge's mounting plate cannot go. */
export function shelfBands(cabinet: CabinetFeature): [number, number][] {
  return cabinetParts(cabinet)
    .filter((p) => p.name.startsWith("Étagère"))
    .map((p) => [Math.min(p.from[2], p.to[2]), Math.max(p.from[2], p.to[2])]);
}
