/**
 * « Finitions » sur un meuble qui n'est pas droit — une cuisine en L, en U, avec un îlot : ses corps groupés par
 * linéaire (ceux d'un plan de cuisine), sinon par le sens où regardent leurs caissons, chaque groupe habillé avec sa
 * propre face avant (features/finish-parts.ts). Un corps sans sens connu qui ne touche qu'un groupe (une joue déjà
 * posée au bout d'un linéaire) en fait partie ; s'il en touche plusieurs (un plan de travail d'angle), il ne leur donne
 * que sa hauteur. Un seul groupe : null, le meuble est habillé d'un bloc. Pur.
 */
import { kitchenRunOf } from "./kitchen-floor";
import { findFeature } from "./operations";
import { featureOfBody, type CadDocument } from "./types";
import type { Box, FinishOptions } from "../features/finish-parts";

export interface FinishGroup {
  /** What the boards of this group are named after: « mur B », « vers +X ». */
  label: string;
  front: FinishOptions["front"];
  boxes: Box[];
}

type Turn = 0 | 90 | 180 | 270;
const FRONT: Record<Turn, FinishOptions["front"]> = { 0: { axis: 1, sign: -1 }, 90: { axis: 0, sign: 1 }, 180: { axis: 1, sign: 1 }, 270: { axis: 0, sign: -1 } };
const TOWARDS: Record<Turn, string> = { 0: "vers −Y", 90: "vers +X", 180: "vers +Y", 270: "vers −X" };

/** The way a body's cabinet faces (a cabinet, its fronts, an appliance), or null. */
function turnOf(doc: CadDocument, bodyId: string): Turn | null {
  const f = findFeature(doc, featureOfBody(bodyId));
  if (f?.type === "cabinet" || f?.type === "appliance") return f.rotation ?? 0;
  if (f?.type === "fronts") {
    const cabinet = findFeature(doc, f.cabinet);
    return cabinet?.type === "cabinet" ? (cabinet.rotation ?? 0) : null;
  }
  return null;
}

const overlapXY = (a: Box, b: Box) => Math.min(a[1][0], b[1][0]) - Math.max(a[0][0], b[0][0]) > 0.5 && Math.min(a[1][1], b[1][1]) - Math.max(a[0][1], b[0][1]) > 0.5;
/** Seen from above, within a few millimetres of each other (side by side counts). */
const touchXY = (a: Box, b: Box, gap = 5) => Math.min(a[1][0], b[1][0]) - Math.max(a[0][0], b[0][0]) > -gap && Math.min(a[1][1], b[1][1]) - Math.max(a[0][1], b[0][1]) > -gap;

/** The furniture split by the way it faces, or null when it is all one way (dressed as one block, as before). */
export function finishGroups(doc: CadDocument, bodies: readonly { id: string; box: Box }[]): FinishGroup[] | null {
  const groups = new Map<string, { label: string; turns: Turn[]; boxes: Box[] }>();
  const loose: Box[] = [];
  for (const { id, box } of bodies) {
    const run = kitchenRunOf(doc, featureOfBody(id));
    const turn = turnOf(doc, id);
    const key = run && run.run !== "walls" ? `run:${run.plan}:${run.run}` : turn !== null ? `turn:${turn}` : null;
    if (!key) {
      loose.push(box);
      continue;
    }
    const group = groups.get(key) ?? { label: key.startsWith("run:") ? `mur ${run!.run}` : TOWARDS[turn!], turns: [], boxes: [] };
    if (turn !== null) group.turns.push(turn);
    group.boxes.push(box);
    groups.set(key, group);
  }
  if (groups.size < 2) return null;
  // A body of no known way beside one group only (an end panel already there) is of that group.
  const all = [...groups.values()];
  const shared = loose.filter((b) => {
    const near = all.filter((g) => g.boxes.some((own) => touchXY(b, own)));
    if (near.length !== 1) return true;
    near[0]!.boxes.push(b);
    return false;
  });
  return all.map((g) => {
    // A run faces the way most of its cabinets do.
    const counts = new Map<Turn, number>();
    for (const t of g.turns) counts.set(t, (counts.get(t) ?? 0) + 1);
    const turn = ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0) as Turn;
    // A body of no known way (a worktop drawn on its own) only gives its height to the group it stands over.
    const extra = shared.filter((b) => g.boxes.some((own) => overlapXY(b, own))).map((b): Box => {
      const foot = g.boxes[0]!;
      return [[foot[0][0], foot[0][1], b[0][2]], [foot[1][0], foot[1][1], b[1][2]]];
    });
    return { label: g.label, front: FRONT[turn], boxes: [...g.boxes, ...extra] };
  });
}
