/**
 * Les cotes d'un linéaire de cuisine vu de face, comme celles d'une Répartition de dressing : en bas, la chaîne des
 * largeurs — chaque meuble bas, colonne, fileur, place libre et angle, de gauche à droite — puis la longueur du mur ;
 * en haut, la chaîne des meubles hauts ; à gauche, la hauteur du plan de travail, la rangée haute et le plafond. En
 * coordonnées du linéaire : `u` le long de lui depuis sa gauche, `z` la hauteur (mm). Chaque cote dit ce qu'elle change
 * quand on la tape (document/kitchen-dim-edit.ts) : la largeur d'un meuble, la porte ou le côté d'un meuble d'angle, la
 * longueur du mur, la hauteur du plan de travail ou du plafond ; un fileur, une place libre, la rangée haute, non. Pur.
 */
import { cornerSide, wallCornerSide } from "./kitchen-corners";
import { CORNER_WALL_GAP, jointOf, kitchenSizes, wallCorner, type Joint, type KitchenRun, type RunGeometry } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan } from "./types";
import type { RunFill } from "../features/kitchen-run-items";

/** What typing a dimension changes: a unit's width; a corner's size (the value less `less`); a size of the plan. */
export type DimEdit =
  | { kind: "item"; item: string }
  | { kind: "corner"; joint: Joint; key: "door" | "arm" | "wallDoor" | "wallArm"; less: number }
  | { kind: "plan"; key: "lengthA" | "lengthB" | "lengthC" | "lengthD" | "islandLength" | "worktopHeight" | "height" };

/** A dimension: along the run (`u`, at the height `at`) or up it (`z`, at `at` along it), from `a` to `b`. */
export interface RunDim {
  axis: "u" | "z";
  a: number;
  b: number;
  at: number;
  edit?: DimEdit;
}

type Piece = { span: [number, number]; edit?: DimEdit };

/** Pieces side by side, sorted, the smaller ones (a filler inside a corner unit's span) left out where they overlap. */
function chain(pieces: Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const piece of [...pieces].filter(({ span: [a, b] }) => b - a >= 1).sort((x, y) => x.span[0] - y.span[0] || y.span[1] - x.span[1])) {
    const last = out.at(-1);
    if (last && piece.span[0] < last.span[1] - 1) continue;
    out.push(piece);
  }
  return out;
}

/** The size of the plan a run's length is. */
function lengthKey(run: KitchenRun): Extract<DimEdit, { kind: "plan" }>["key"] {
  if (run.id === "I") return "islandLength";
  if (run.id === "P" || run.id === "D") return "lengthD";
  return run.id === "B" ? "lengthB" : run.id === "C" ? "lengthC" : "lengthA";
}

/** The dimensions of the run as it is filled. */
export function runDims(p: KitchenFloorPlan, run: KitchenRun, g: RunGeometry, fill: RunFill): RunDim[] {
  const s = kitchenSizes(p);
  const out: RunDim[] = [];
  const unit = (row: "base" | "wall") => fill.placed.filter((pl) => pl.row === row).map((pl): Piece => ({ span: [pl.at, pl.at + pl.item.width], edit: { kind: "item", item: pl.item.id } }));
  const plain = (spans: [number, number][]) => spans.map((span): Piece => ({ span }));
  const low: Piece[] = [...unit("base"), ...plain(fill.fillers), ...plain(fill.free)];
  const high: Piece[] = [...unit("wall"), ...plain(fill.wallFree)];
  (["left", "right"] as const).forEach((side, i) => {
    const joint = jointOf(run, side);
    const pass = run[side] === "pass";
    const corner = cornerSide(p, run, side, fill.walls[i]);
    if (corner) {
      // A blind corner unit: its door is its width less its fixed part (the corner less its gap to the wall); an L: its side, from the wall.
      if (corner.cabinet) low.push({ span: corner.cabinet, edit: corner.kind === "l" || corner.kind === "carousel" ? { kind: "corner", joint, key: "arm", less: pass ? 0 : -s.cabinet } : { kind: "corner", joint, key: "door", less: s.corner - CORNER_WALL_GAP } });
      low.push(...plain(corner.fronts.filter((f) => f.kind === "filler").map((f): [number, number] => [f.from, f.to])), ...plain(corner.gap ? [corner.gap] : []));
    }
    const up = g.wall ? wallCornerSide(p, run, side) : null;
    if (up) {
      if (up.cabinet) high.push({ span: up.cabinet, edit: up.kind === "l" ? { kind: "corner", joint, key: "wallArm", less: pass ? 0 : -p.wallDepth } : { kind: "corner", joint, key: "wallDoor", less: wallCorner(p) } });
      high.push(...plain(up.fronts.filter((f) => f.kind === "filler").map((f): [number, number] => [f.from, f.to])));
    }
  });
  for (const { span: [a, b], edit } of chain(low)) out.push({ axis: "u", a, b, at: -150, ...(edit ? { edit } : {}) });
  // The wall's length and the ceiling come from the room when the plan stands in one.
  const own = (key: Extract<DimEdit, { kind: "plan" }>["key"]): { edit?: DimEdit } => (p.room && key !== "lengthD" && key !== "islandLength" && key !== "worktopHeight" ? {} : { edit: { kind: "plan", key } });
  out.push({ axis: "u", a: 0, b: run.length, at: -330, ...own(lengthKey(run)) });
  if (g.wall) for (const { span: [a, b], edit } of chain(high)) out.push({ axis: "u", a, b, at: s.wallTop + 150, ...(edit ? { edit } : {}) });
  out.push({ axis: "z", a: 0, b: p.worktopHeight, at: -180, ...own("worktopHeight") });
  if (g.wall && high.length) out.push({ axis: "z", a: s.wallBottom, b: s.wallTop, at: -180 });
  if (run.wall) out.push({ axis: "z", a: 0, b: p.height, at: -380, ...own("height") });
  return out;
}
