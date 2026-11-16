/**
 * Les assemblages d'un caisson percés tout seuls, d'après son standard de construction (comme les méthodes de
 * construction de Cabinet Vision ou de TopSolid'Wood) : à chaque jonction de ses planches — le chant de l'une contre la
 * face de l'autre : côtés et dessus, dessous, étagères —, les confirmats, tourillons ou excentriques du standard, à son
 * entraxe (la règle de features/assembly-rules.ts). Calculé sur les boîtes du caisson, sans noyau, donc refait à chaque
 * changement de cote ; recopié pour le noyau seulement (`joints`, comme les gorges) et compté au devis. Un caisson déjà
 * assemblé à la main (outil Règles d'assemblage) garde ses usinages et n'en reçoit pas d'autres. Pur.
 */
import { bodyOrigin } from "../document/operations";
import { cabinetStandard, type ConstructionStandard } from "../document/standards";
import { featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument, type MachiningOp, type Vec3 } from "../document/types";
import { ASSEMBLY_RULE, applyRule } from "./assembly-rules";
import { cabinetParts } from "./cabinet-parts";
import { stampInsetSetbacks } from "./inset-setback";

export interface CabinetJoints {
  /** By part (its number among the cabinet's bodies), the holes it takes, in the cabinet's frame before its turn. */
  parts: { part: number; ops: MachiningOp[] }[];
  joint: ConstructionStandard["joint"];
}

/** The joints of a cabinet's boards by this rule. */
export function cabinetJoints(cabinet: CabinetFeature, s: Pick<ConstructionStandard, "joint" | "jointSpacing">): CabinetJoints {
  const boards = cabinetParts(cabinet).map((p, i) => ({ id: String(i), box: [p.from, p.to] as [typeof p.from, typeof p.to] }));
  const { ops } = applyRule(boards, { ...ASSEMBLY_RULE, joint: s.joint, spacing: s.jointSpacing });
  return { parts: [...ops].map(([id, list]) => ({ part: Number(id), ops: list })).sort((a, b) => a.part - b.part), joint: s.joint };
}

/** Whether some of a cabinet's boards were assembled by hand. */
const assembledByHand = (doc: CadDocument, cabinet: string) =>
  doc.features.some((f) => f.type === "machining" && !f.suppressed && (f.kind === "confirmat" || f.kind === "dowel" || f.kind === "minifix") && featureOfBody(bodyOrigin(doc, f.target)) === cabinet);

/** The joints a cabinet gets by itself: its standard drills them, and it was not assembled by hand; else null. */
export function autoJointsOf(doc: CadDocument, cabinet: CabinetFeature): CabinetJoints | null {
  if (cabinet.suppressed) return null;
  const s = cabinetStandard(doc, cabinet);
  if (!s?.autoJoints || assembledByHand(doc, cabinet.id)) return null;
  const joints = cabinetJoints(cabinet, s);
  return joints.parts.length ? joints : null;
}

/** The document with each cabinet carrying the holes of its joints, for the kernel only. */
export function stampCabinetJoints(doc: CadDocument): CadDocument {
  let changed = false;
  const features = doc.features.map((f) => {
    if (f.type !== "cabinet") return f;
    const joints = autoJointsOf(doc, f);
    if (!joints && !f.joints) return f;
    changed = true;
    const { joints: _old, ...rest } = f;
    return joints ? { ...rest, joints: joints.parts } : rest;
  });
  return changed ? { ...doc, features } : doc;
}

/** The holes of the automatic joints of the project, by kind of fastener, as the quote counts them. */
export function autoJointHoles(model: CadDocument): { confirmat: number; dowel: number; cams: number } {
  const out = { confirmat: 0, dowel: 0, cams: 0 };
  // The shelves as the kernel makes them (set back behind inset fronts).
  const doc = stampInsetSetbacks(model);
  for (const f of doc.features) {
    const joints = f.type === "cabinet" ? autoJointsOf(doc, f) : null;
    if (!joints) continue;
    const holes = joints.parts.flatMap((p) => p.ops.filter((op) => op.kind === "hole"));
    if (joints.joint === "confirmat") out.confirmat += holes.length;
    if (joints.joint === "dowel") out.dowel += holes.length;
    if (joints.joint === "minifix") out.cams += holes.filter((op) => op.kind === "hole" && op.diameter >= 14).length;
  }
  return out;
}

/** The holes of the automatic joints of a body of a cabinet, where they are in the model (turned with it). */
export function autoJointOps(doc: CadDocument, bodyId: string): MachiningOp[] {
  const [id, index] = bodyId.split(PART_SEPARATOR);
  const cabinet = doc.features.find((f): f is CabinetFeature => f.id === id && f.type === "cabinet");
  if (!cabinet || index === undefined) return [];
  const ops = autoJointsOf(stampInsetSetbacks(doc), cabinet)?.parts.find((p) => p.part === Number(index))?.ops ?? [];
  const angle = ((cabinet.rotation ?? 0) * Math.PI) / 180;
  if (!angle) return ops;
  const [ox, oy] = cabinet.origin;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const point = (p: Vec3): Vec3 => [ox + (p[0] - ox) * c - (p[1] - oy) * s, oy + (p[0] - ox) * s + (p[1] - oy) * c, p[2]];
  const direction = (d: Vec3): Vec3 => [d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]];
  return ops.map((op) => (op.kind === "hole" ? { ...op, at: point(op.at), dir: direction(op.dir) } : { ...op, from: point(op.from), to: point(op.to) }));
}
