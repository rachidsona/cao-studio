/**
 * La casquette des meubles hauts : un panneau posé à plat sur le haut de la rangée haute
 * d'un linéaire — meubles hauts, sur-hotte, fileurs hauts, meubles d'angle hauts et colonnes —, qui déborde devant les
 * façades et aux bouts libres (au-delà de la joue de finition s'il y en a une). Plate (un panneau épais) ou en caisson
 * (un dessus, un bandeau devant, et un bout aux bouts libres). Elle s'interrompt à la hotte (son conduit monte au plafond),
 * à la place laissée libre et là où la profondeur ou la hauteur du dessus change ; un morceau plus long qu'un panneau brut
 * est coupé au droit d'un côté de meuble. Contre le linéaire qui passe dans un angle, elle s'arrête au bord de sa
 * casquette. Elle prévient : une porte relevante dessous ne se lève plus, un plafond trop bas. Ou en caissons à porte
 * relevante (« sur-meubles ») : sur chaque meuble haut, un caisson de sa largeur et de sa profondeur, de la hauteur
 * choisie, sa porte se levant — posé sur un panneau de finition de l'épaisseur choisie (`capGap`), s'il y en a un, pris
 * sur sa hauteur ; les colonnes et l'habillage de réfrigérateur n'en ont pas, ils montent eux-mêmes jusqu'en
 * haut des caissons (features/kitchen-run-items.ts `itemSize`). Pur.
 */
import { wallCornerSide } from "./kitchen-corners";
import { CAP, capProblem, FRONT, kitchenSizes, type KitchenRun } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan } from "./types";
import { applianceOf, isFiller, itemSize, type RunFill } from "../features/kitchen-run-items";
import type { Band, BoxOf, CabinetOf } from "./kitchen-plan-build";

/** Less than this between it and the ceiling (mm): it cannot be slid in place. */
const TO_CEILING = 5;

/** A stretch of the wall row under the casquette, along the run: its depth off the wall and the height of its top. */
type Under = { from: number; to: number; depth: number; top: number };

/** The casquette of a run, its pieces put by `box`, what it warns of in `notes` (`wallRow`: the run has a wall row). */
export function kitchenCap(p: KitchenFloorPlan, run: KitchenRun, fill: RunFill, wallRow: boolean, ceiling: number, band: Band, box: BoxOf, notes: string[], cabinet?: CabinetOf): void {
  if (!p.cap || capProblem(p)) return;
  if (p.cap === "units") return capUnits(p, run, fill, wallRow, ceiling, notes, band, box, cabinet);
  const s = kitchenSizes(p);
  const overhang = p.capOverhang ?? CAP.overhang;
  const thick = p.cap === "box" ? (p.capHeight ?? CAP.height) : (p.capThickness ?? CAP.thickness);
  // Its depth off the wall set (58 cm, as the columns): the same over every unit, in one piece; else as each unit under it.
  const fixed = p.capDepth ? p.capDepth : null;
  const under: Under[] = [];
  for (const pl of fill.placed) {
    const role = applianceOf(pl.item)?.role;
    const tall = pl.row === "base" && pl.entry.kind === "tall";
    if ((pl.row !== "wall" && !tall) || role === "hood") continue;
    const size = itemSize(p, pl.item, pl.entry);
    under.push({ from: pl.at, to: pl.at + pl.item.width, depth: fixed ?? (isFiller(pl.item) ? p.wallDepth : size.depth), top: size.z + size.height });
    if (pl.row === "wall" && (pl.item.side ?? pl.entry.side) === "top") notes.push(`${pl.entry.name} ${pl.item.width} (${run.id}) : sa porte relevante bute contre la casquette — mettez une porte battante, ou pas de casquette.`);
  }
  // Up in the corners: the wall corner unit, its fronts and fillers.
  for (const side of ["left", "right"] as const) {
    const high = wallRow ? wallCornerSide(p, run, side) : null;
    if (!high) continue;
    for (const [a, b] of [...(high.cabinet ? [high.cabinet] : []), ...high.fronts.map((f): [number, number] => [f.from, f.to])]) under.push({ from: a, to: b, depth: fixed ?? p.wallDepth, top: s.wallTop });
  }
  if (!under.length) return;
  // Stretches of the same depth and top, touching: one casquette each (a corner's front lies over its own cabinet).
  const runs: (Under & { cuts: number[] })[] = [];
  for (const u of [...under].sort((a, b) => a.from - b.from || b.to - a.to)) {
    const last = runs[runs.length - 1];
    if (last && u.from <= last.to + 1 && u.depth === last.depth && Math.abs(u.top - last.top) < 1) {
      if (u.to > last.to + 1) {
        if (u.from > last.from + 1) last.cuts.push(u.from);
        last.to = u.to;
      }
    } else runs.push({ ...u, cuts: [] });
  }
  const [lo, hi] = [Math.min(...runs.map((r) => r.from)), Math.max(...runs.map((r) => r.to))];
  // Beyond the outermost unit at a free end: over its finishing side (when it has one), then the overhang.
  const outer = (side: "left" | "right") => fill.placed.filter((pl) => pl.row === "wall" || pl.entry.kind === "tall").reduce<(typeof fill.placed)[number] | null>((m, pl) => (!m || (side === "left" ? pl.at < m.at : pl.at + pl.item.width > m.at + m.item.width) ? pl : m), null);
  const beyond = (side: "left" | "right") => {
    const last = outer(side);
    return (p.endPanels && last && !isFiller(last.item) ? FRONT : 0) + overhang;
  };
  const passing = p.wallDepth + FRONT + overhang;
  let n = 0;
  for (const r of runs) {
    let [a, b] = [r.from, r.to];
    if (run.left === "free" && a <= lo + 1) a -= beyond("left");
    if (run.right === "free" && b >= hi - 1) b += beyond("right");
    // Against the run that passes in a corner: up to the edge of its casquette.
    if (run.left === "stop") a = Math.max(a, passing);
    if (run.right === "stop") b = Math.min(b, run.length - passing);
    if (b - a < 1) continue;
    const z = r.top;
    if (z + thick > ceiling + 0.5) {
      notes.push(`Casquette ${run.id} : le plafond est à ${Math.round(ceiling - z)} mm au-dessus des meubles, moins que ses ${thick} mm — pas de casquette là.`);
      continue;
    }
    if (ceiling - z - thick < TO_CEILING) notes.push(`Casquette ${run.id} : ${Math.round(ceiling - z - thick)} mm sous le plafond — à poser avant de fixer les meubles, ou en deux morceaux.`);
    // Cut at a unit's side so that no piece is longer than a raw panel.
    const ends = [a];
    while (b - ends[ends.length - 1]! > CAP.panel) {
      const at = ends[ends.length - 1]!;
      const next = r.cuts.filter((c) => c > at + 1 && c - at <= CAP.panel);
      if (!next.length) break;
      ends.push(Math.max(...next));
    }
    ends.push(b);
    const depth = fixed ?? r.depth + FRONT + overhang;
    for (let i = 0; i + 1 < ends.length; i++) {
      const [u0, u1] = [ends[i]!, ends[i + 1]!];
      const tag = `${run.id}${n++ ? n : ""}`;
      if (p.cap !== "box") {
        box(`Casquette ${tag}`, "panel", band(u0, u1, 0, depth, z, z + thick));
        continue;
      }
      // In a caisson: its top, the band in front under it, and a side at each free end.
      const t = CAP.board;
      box(`Casquette ${tag}`, "panel", band(u0, u1, 0, depth, z + thick - t, z + thick));
      box(`Bandeau de casquette ${tag}`, "panel", band(u0, u1, depth - t, depth, z, z + thick - t));
      if (run.left === "free" && u0 < lo) box(`Bout de casquette ${tag} (gauche)`, "panel", band(u0, u0 + t, 0, depth - t, z, z + thick - t));
      if (run.right === "free" && u1 > hi) box(`Bout de casquette ${tag} (droite)`, "panel", band(u1 - t, u1, 0, depth - t, z, z + thick - t));
    }
    if (ends.length > 2) notes.push(`Casquette ${run.id} : plus longue qu'un panneau (${CAP.panel / 10} cm), coupée au droit d'un côté de meuble.`);
  }
}

/**
 * The casquette in caissons: over each wall unit and each arm of a wall corner unit (not the hood, a filler; not a
 * column: it rises to their top itself), a caisson of its width, 58 cm deep unless set (`capDepth`), its lift-up door;
 * with a gap (`capGap`), set on a finishing panel that thick, as wide as it, out to the face of its door — taken from its
 * height: its top stays where it was (under a ceiling it just fits under, the columns as high as before).
 */
function capUnits(p: KitchenFloorPlan, run: KitchenRun, fill: RunFill, wallRow: boolean, ceiling: number, notes: string[], band: Band, box: BoxOf, cabinet?: CabinetOf): void {
  if (!cabinet) return;
  const [h, gap] = [p.capHeight ?? CAP.unit, p.capGap ?? 0];
  const deep = p.capDepth ?? CAP.unitDepth;
  /** The caisson over `u`…`u + w` from `z`, `d` deep: on its finishing panel when there is a gap. */
  const put = (name: string, u: number, w: number, d: number, z: number) => {
    if (gap > 0) box(`Panneau sous ${name}`, "panel", band(u, u + w, 0, d + FRONT, z, z + gap));
    cabinet(name, u, w, d, z + gap, h - gap, { plinth: 0, shelves: 0, layout: "door", side: "top" });
  };
  let n = 0;
  // Up in the corners: over the wall corner unit's arm along this run (the run that passes carries the corner itself).
  // shortcut: the corner's caisson keeps the wall units' depth (deeper, it would run into the other run's); one lift-up door across the whole arm, the part behind the other run's caisson included; a door over
  // the open part alone would come with a front of its own.
  const top = kitchenSizes(p).wallTop;
  for (const side of ["left", "right"] as const) {
    const arm = wallRow ? wallCornerSide(p, run, side)?.cabinet : null;
    if (!arm) continue;
    if (top + h > ceiling + 0.5) {
      notes.push(`Casquette ${run.id} : ${Math.round(ceiling - top)} mm entre le meuble haut d'angle et le plafond, moins que les ${h} mm d'un caisson — pas de caisson là.`);
      continue;
    }
    put(`Casquette d'angle ${Math.round(arm[1] - arm[0])} (${run.id}${side === "right" ? " droite" : ""})`, arm[0], arm[1] - arm[0], p.wallDepth, top);
  }
  for (const pl of fill.placed) {
    if (pl.row !== "wall" || applianceOf(pl.item)?.role === "hood" || isFiller(pl.item) || pl.entry.round) continue;
    const size = itemSize(p, pl.item, pl.entry);
    const z = size.z + size.height;
    if (z + h > ceiling + 0.5) {
      notes.push(`Casquette ${run.id} : ${Math.round(ceiling - z)} mm entre ${pl.entry.name} ${pl.item.width} et le plafond, moins que les ${h} mm d'un caisson — pas de caisson là.`);
      continue;
    }
    put(`Casquette ${pl.item.width} (${run.id}${++n})`, pl.at, pl.item.width, deep, z);
  }
}

