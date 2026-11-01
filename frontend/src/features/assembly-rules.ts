/**
 * Règles d'assemblage : au lieu d'usiner chaque jonction à la main, une règle (« confirmat tous les 128 mm »,
 * « tourillons tous les 96 mm ») s'applique à toutes les jonctions d'un meuble d'un coup. Une jonction est le chant
 * d'une planche contre la face d'une autre (un côté et un dessus, une étagère fixe) ; deux planches face contre face
 * ou chant contre chant n'en sont pas ; les panneaux minces (fonds, cloués) et épais (plans de travail, murs) sont
 * laissés de côté.
 */
import type { Axis, MachiningOp } from "../document/types";
import { CONFIRMAT, DOWELS, MINIFIX, confirmats, contactOf, dowels, minifix, type Box, type Contact } from "./joinery";

export interface AssemblyRule {
  joint: "confirmat" | "dowel" | "minifix";
  spacing: number;
  margin: number;
  /** Boards thinner than this (backs) are left out (mm). */
  minThickness: number;
}

export const ASSEMBLY_RULE: AssemblyRule = { joint: "confirmat", spacing: 128, margin: 50, minThickness: 8 };
/** Thicker boards (worktops, walls) are never assembled this way (mm). */
const MAX_THICKNESS = 30;

export interface Board {
  id: string;
  box: Box;
}

/** The edge of `edge` against the face of `face`. */
export interface Junction {
  face: string;
  edge: string;
  contact: Contact;
}

const sizes = (box: Box) => [0, 1, 2].map((i) => (box[1][i] as number) - (box[0][i] as number));
/** The axis of a board's thickness (its smallest side). */
const thicknessAxis = (box: Box): Axis => {
  const s = sizes(box);
  return s.indexOf(Math.min(...s)) as Axis;
};

/** Every junction between the boards. */
export function junctions(boards: Board[], minThickness = ASSEMBLY_RULE.minThickness): Junction[] {
  const usable = boards.filter((b) => Math.min(...sizes(b.box)) >= minThickness && Math.min(...sizes(b.box)) <= MAX_THICKNESS);
  const out: Junction[] = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const [a, b] = [usable[i]!, usable[j]!];
      const touching = contactOf(a.box, b.box);
      if (!touching) continue;
      const aFace = thicknessAxis(a.box) === touching.axis;
      const bFace = thicknessAxis(b.box) === touching.axis;
      if (aFace === bFace) continue;
      const [face, edge] = aFace ? [a, b] : [b, a];
      out.push({ face: face.id, edge: edge.id, contact: contactOf(face.box, edge.box)! });
    }
  }
  return out;
}

/** The operations of the rule on each board, and how many fasteners (screws or dowels) it takes. */
export function applyRule(boards: Board[], rule: AssemblyRule): { ops: Map<string, MachiningOp[]>; junctions: number; fasteners: number } {
  const box = new Map(boards.map((b) => [b.id, b.box]));
  const ops = new Map<string, MachiningOp[]>();
  const add = (id: string, more: MachiningOp[]) => more.length && ops.set(id, [...(ops.get(id) ?? []), ...more]);
  const found = junctions(boards, rule.minThickness);
  let fasteners = 0;
  for (const j of found) {
    const [face, edge] = [box.get(j.face)!, box.get(j.edge)!];
    // A confirmat screw goes through the board whose face is in the joint, into the edge of the other.
    // A Minifix: the bolt in the face board, the bore and the cam in the edge board.
    const joint = rule.joint === "confirmat"
      ? confirmats(face, edge, j.contact, { ...CONFIRMAT, spacing: rule.spacing, margin: rule.margin, through: "a" })
      : rule.joint === "minifix"
        ? minifix(face, edge, j.contact, { ...MINIFIX, spacing: rule.spacing, margin: rule.margin })
        : dowels(face, edge, j.contact, { ...DOWELS, spacing: rule.spacing, margin: rule.margin });
    add(j.face, joint.a);
    add(j.edge, joint.b);
    fasteners += joint.a.length;
  }
  return { ops, junctions: found.length, fasteners };
}
