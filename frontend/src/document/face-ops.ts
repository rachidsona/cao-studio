/**
 * Usinages rangés par face de la pièce (comme les attend une machine : dessus, dessous, et chacun des quatre chants) :
 * les perçages d'une planche, lus dans ses usinages (suivis jusqu'à sa place actuelle, comme le fait le noyau), classés
 * selon la face par où le foret entre. La mise à plat (DXF, G-code, fiches) ne voit que ceux des grandes faces ; ceux
 * des chants — les perçages horizontaux des tourillons, des excentriques — sont donnés ici, pour les fiches et pour
 * prévenir qu'il faut les faire à part. Pur.
 */
import { followed } from "../features/machining-follow";
import type { CadDocument, MachiningOp, Vec3 } from "./types";

type Box = [Vec3, Vec3];

/** Every operation a body carries, in its present place (the machining that made it and every one before it). */
export function currentOps(doc: CadDocument, bodyId: string, box: Box): MachiningOp[] {
  const out: MachiningOp[] = [];
  let id: string | undefined = bodyId;
  for (let guard = 0; id && guard < 200; guard++) {
    const f = doc.features.find((x) => x.id === id);
    if (f?.type !== "machining") break;
    const anchor: [Vec3, Vec3 | undefined] | null = f.anchor ? [f.anchor, f.anchorHigh] : null;
    out.push(...f.ops.map((op) => (anchor ? followed(op, anchor, box) : op)));
    id = f.target;
  }
  return out;
}

export interface EdgeHole {
  /** The edge, named by its length and the side of the model it faces: « chant long côté Y− ». */
  edge: string;
  /** From the low end of the edge, and from the low face of the board (mm). */
  along: number;
  height: number;
  diameter: number;
  depth: number;
}

const AXES = ["X", "Y", "Z"];

/** The holes drilled into the edges of a board (its box), by edge then along it. */
export function edgeHoles(doc: CadDocument, bodyId: string, box: Box): EdgeHole[] {
  const size = [0, 1, 2].map((i) => box[1][i]! - box[0][i]!);
  const order = [0, 1, 2].sort((a, b) => size[b]! - size[a]!);
  const [length, width, thickness] = order as [number, number, number];
  const out: EdgeHole[] = [];
  for (const op of currentOps(doc, bodyId, box)) {
    if (op.kind !== "hole") continue;
    // Into an edge: the drill runs in the board's plane, along its length or its width.
    const axis = [length, width].find((i) => Math.abs(op.dir[i]!) > 0.9);
    if (axis === undefined || Math.abs(op.dir[thickness]!) > 0.1) continue;
    const entersLow = op.dir[axis]! > 0;
    const edgeLong = axis === width;
    const runs = edgeLong ? length : width;
    out.push({
      edge: `chant ${edgeLong ? "long" : "court"} côté ${AXES[axis]}${entersLow ? "−" : "+"}`,
      along: Number((op.at[runs]! - box[0][runs]!).toFixed(1)),
      height: Number((op.at[thickness]! - box[0][thickness]!).toFixed(1)),
      diameter: op.diameter,
      depth: op.depth,
    });
  }
  return out.sort((a, b) => a.edge.localeCompare(b.edge) || a.along - b.along);
}

/** « chant long côté Y− : 3 × Ø8 prof. 34 à 50, 306, 562 (haut. 9) » for each edge. */
export function edgeHolesText(holes: readonly EdgeHole[], num: (mm: number) => string = String): string[] {
  const byEdge = new Map<string, EdgeHole[]>();
  for (const h of holes) byEdge.set(`${h.edge}|${h.diameter}|${h.depth}`, [...(byEdge.get(`${h.edge}|${h.diameter}|${h.depth}`) ?? []), h]);
  return [...byEdge.values()].map((list) => {
    const h = list[0]!;
    const heights = [...new Set(list.map((x) => x.height))];
    return `${h.edge} : ${list.length} × Ø${num(h.diameter)} prof. ${num(h.depth)} à ${list.map((x) => num(x.along)).join(", ")}${heights.length === 1 ? ` (à ${num(heights[0]!)} de la face basse)` : ""}`;
  });
}
