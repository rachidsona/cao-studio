/**
 * Contrôle avant fabrication, en géométrie pure : ce qui gâcherait du panneau ou bloquerait le montage, trouvé avant
 * de lancer la découpe —
 * - deux pièces qui se chevauchent (exact pour des panneaux droits, « peut-être » pour une pièce façonnée) ;
 * - une pièce plus grande que le panneau brut de sa matière (le fil respecté) ;
 * - une pièce sans matière ;
 * - un perçage qui déborde du bord ou en mord un autre ;
 * - une porte ou un tiroir qui heurte quelque chose en s'ouvrant (calculé dans l'application, app/fabrication-check.ts) ;
 * - un meuble qui entre dans un mur, une retombée ou un rampant de la pièce relevée, ou qui cache une prise ;
 * - l'implantation d'une cuisine ou d'un dressing (document/layout-check.ts, porté de poly_3D).
 */
import { roomClashes, type RoomInput } from "../features/room-plan";
import type { FlatEdge, FlatPart } from "../io/dxf";
import type { CutRow } from "./cut-list";
import type { Vec3 } from "./types";

export type ProblemKind = "overlap" | "room" | "layout" | "sheet" | "material" | "hole" | "joint" | "hardware" | "sag" | "opening" | "stability";

export interface Problem {
  kind: ProblemKind;
  /** An error spoils the work; a warning is to look at. */
  severity: "error" | "warning";
  message: string;
  /** The bodies concerned (to select them). */
  bodies: string[];
}

export interface CheckedPart {
  id: string;
  name: string;
  box: [Vec3, Vec3];
  /** A plain board: its box is its shape (else the overlap is only possible). */
  boxLike: boolean;
  /** Parts cut against one another by one operation (the panels of « Panneaux sur faces »): they cannot overlap. */
  together?: string;
}

const f = (v: number) => Number(v.toFixed(1)).toLocaleString("fr-FR");

/** The pairs of parts whose boxes overlap by more than `tolerance` mm on all three axes. */
export function overlapProblems(parts: readonly CheckedPart[], tolerance = 0.1): Problem[] {
  const problems: Problem[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const [a, b] = [parts[i]!, parts[j]!];
      if (a.together && a.together === b.together) continue;
      const depth = [0, 1, 2].map((k) => Math.min(a.box[1][k]!, b.box[1][k]!) - Math.max(a.box[0][k]!, b.box[0][k]!));
      if (depth.some((d) => d <= tolerance)) continue;
      const exact = a.boxLike && b.boxLike;
      problems.push({
        kind: "overlap",
        severity: exact ? "error" : "warning",
        message: `${a.name} et ${b.name} ${exact ? "se chevauchent" : "se chevauchent peut-être (pièce façonnée)"} : ${depth.map(f).join(" × ")} mm en commun.`,
        bodies: [a.id, b.id],
      });
    }
  }
  return problems;
}

/** Does a part fit on a sheet, its grain along the sheet's length (or either way without grain)? */
export function fitsSheet(row: Pick<CutRow, "cutLength" | "cutWidth" | "grain">, sheet: [number, number]): boolean {
  const [L, W] = sheet;
  const along = row.cutLength <= L && row.cutWidth <= W;
  const across = row.cutWidth <= L && row.cutLength <= W;
  return row.grain === "length" ? along : row.grain === "width" ? across : along || across;
}

/** The rows too big for the sheet of their material, and the rows without a material. */
export function rowProblems(rows: readonly (CutRow & { ids: string[] })[], sheetOf: (material: string) => [number, number] | null): Problem[] {
  const problems: Problem[] = [];
  for (const row of rows) {
    const names = row.names.join(", ");
    const sheet = sheetOf(row.material);
    if (!sheet) {
      problems.push({ kind: "material", severity: "warning", message: `${names} : aucune matière choisie (Atelier › Matière et chants) ; ni panneau brut ni prix pour elle.`, bodies: row.ids });
      continue;
    }
    if (!fitsSheet(row, sheet)) {
      const grain = row.grain === "none" ? "" : " dans le sens du fil";
      problems.push({ kind: "sheet", severity: "error", message: `${names} : ${f(row.cutLength)} × ${f(row.cutWidth)} mm ne tient pas sur un panneau ${row.material} de ${f(sheet[0])} × ${f(sheet[1])} mm${grain}.`, bodies: row.ids });
    }
  }
  return problems;
}

type Circle = Extract<FlatEdge, { kind: "circle" }>;

/**
 * Holes of a flat part that break out of its edge or leave less than `wall` mm of material to it (on a rectangular
 * part), and holes that run into each other.
 */
export function holeProblems(part: FlatPart, id: string, wall = 1): Problem[] {
  if (part.edges.length === 1) return [];
  const holes = part.edges.filter((e): e is Circle => e.kind === "circle");
  const rectangular = part.edges.filter((e) => e.kind === "line").length === 4 && part.edges.every((e) => e.kind !== "arc");
  const problems: Problem[] = [];
  const name = (h: Circle) => `Ø${f(h.radius * 2)} à (${f(h.center[0])} ; ${f(h.center[1])})`;
  if (rectangular) {
    for (const h of holes) {
      const room = Math.min(h.center[0], part.width - h.center[0], h.center[1], part.height - h.center[1]) - h.radius;
      if (room < -0.01) problems.push({ kind: "hole", severity: "error", message: `${part.name} : le perçage ${name(h)} déborde du bord.`, bodies: [id] });
      else if (room < wall) problems.push({ kind: "hole", severity: "warning", message: `${part.name} : le perçage ${name(h)} laisse ${f(room)} mm jusqu'au bord.`, bodies: [id] });
    }
  }
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const [a, b] = [holes[i]!, holes[j]!];
      const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
      // Two circles of the same centre are one stepped hole (a counterbore), not a clash.
      if (d > 0.01 && d < a.radius + b.radius - 0.01) problems.push({ kind: "hole", severity: "error", message: `${part.name} : les perçages ${name(a)} et ${name(b)} se mordent.`, bodies: [id] });
    }
  }
  return problems;
}

/** The furniture's parts that run into the surveyed room, and the sockets they hide. */
export function roomProblems(rooms: readonly RoomInput[], parts: readonly CheckedPart[]): Problem[] {
  const problems: Problem[] = [];
  for (const room of rooms) {
    for (const p of parts) {
      const { hits, hidden } = roomClashes(room, p.box);
      if (hits.length) problems.push({ kind: "room", severity: "error", message: `${p.name} entre dans ${hits.join(", ")}.`, bodies: [p.id] });
      if (hidden.length) problems.push({ kind: "room", severity: "warning", message: `${p.name} cache ${hidden.join(", ")} : à déplacer ou à percer.`, bodies: [p.id] });
    }
  }
  return problems;
}

export const PROBLEM_TITLES: Record<ProblemKind, string> = {
  overlap: "Pièces qui se chevauchent",
  room: "Meuble et pièce (murs, retombées, rampants, prises)",
  layout: "Implantation (cuisine, dressing : hotte, évier et plaque, dégagements, tringles)",
  sheet: "Pièces plus grandes que le panneau brut",
  material: "Pièces sans matière",
  hole: "Perçages",
  joint: "Jonctions sans assemblage",
  hardware: "Charnières (poids des portes, étagères)",
  sag: "Étagères qui fléchissent (15 kg par mètre, portée / 200)",
  opening: "Portes et tiroirs qui heurtent en s'ouvrant",
  stability: "Stabilité (tiroirs sortis, 15 kg chacun)",
};
