/**
 * Porte vitrée : un cadre en profilé d'aluminium (20 mm de large par défaut, de l'épaisseur de la porte) autour d'un
 * panneau de verre trempé de 4 mm, au milieu de l'épaisseur, engagé de 5 mm dans la rainure du profilé. Le cadre
 * pivote comme une porte et le verre avec lui. Ni l'un ni l'autre ne se scie à l'atelier : ils sortent de la liste de
 * débit et vont au devis, le verre au m², le profilé au mètre (tour de chaque porte). Le verre (clair, extra-clair,
 * dépoli, fumé, bronze, noir) et le cadre (aluminium brossé ou noir) prennent leur apparence de la bibliothèque. Pur.
 */
import type { GlassKind, ProfileFinish, Vec3 } from "../document/types";
import { decorChange } from "./door-decor";

export type { GlassKind, ProfileFinish };
export type DoorStyle = "flat" | "frame" | "glass" | "fluted" | "slats";

/** Width of the aluminium frame (mm) when none is set; the glass and how deep it sits in the profile's groove. */
export const GLASS_FRAME = 20;
export const GLASS_THICKNESS = 4;
export const GLASS_GROOVE = 5;
/** The narrowest frame that holds the glass, the smallest glass left inside it, the thinnest door (mm). */
export const MIN_GLASS_FRAME = 10;
const MIN_GLASS = 40;
const MIN_THICKNESS = GLASS_THICKNESS + 4;

export const GLASS_KINDS: readonly [GlassKind, string][] = [
  ["clear", "Clair"],
  ["extra-clear", "Extra-clair"],
  ["frosted", "Dépoli (satiné)"],
  ["smoked", "Fumé gris"],
  ["bronze", "Bronze"],
  ["black", "Noir"],
];
export const PROFILE_FINISHES: readonly [ProfileFinish, string][] = [
  ["brushed", "Aluminium brossé"],
  ["black", "Aluminium noir"],
];

/** The appearance (appearance/library.ts) of each glass and of each frame. */
export const GLASS_APPEARANCE: Record<GlassKind, string> = { clear: "glass-clear", "extra-clear": "glass-extra-clear", frosted: "glass-frosted", smoked: "glass-smoked", bronze: "glass-bronze", black: "glass-black" };
export const PROFILE_APPEARANCE: Record<ProfileFinish, string> = { brushed: "aluminium-brushed", black: "aluminium-black" };

/** Names of the bought items, in the quote and the buying list. */
const GLASS_WORDS: Record<GlassKind, string> = { clear: "clair", "extra-clear": "extra-clair", frosted: "dépoli", smoked: "fumé", bronze: "bronze", black: "noir" };
export const glassItem = (kind: GlassKind = "clear") => `Verre trempé 4 mm ${GLASS_WORDS[kind]} (m²)`;
export const profileItem = (finish: ProfileFinish = "brushed") => `Profilé alu de porte ${finish === "black" ? "noir" : "brossé"} (m)`;
export const ALU_HINGE = "Charnière pour cadre alu";

/** Indicative prices (MAD HT): the glass per m², the profile per metre, a hinge for an aluminium frame. */
export const GLASS_RATES: Record<string, number> = {
  [glassItem("clear")]: 320,
  [glassItem("extra-clear")]: 480,
  [glassItem("frosted")]: 420,
  [glassItem("smoked")]: 400,
  [glassItem("bronze")]: 400,
  [glassItem("black")]: 450,
  [profileItem("brushed")]: 75,
  [profileItem("black")]: 90,
  [ALU_HINGE]: 45,
};

/** The glass settings of a door (what the document keeps). */
export interface GlassSettings {
  style?: DoorStyle;
  frameWidth?: number;
  glass?: GlassKind;
  profile?: ProfileFinish;
}

export const isGlass = (f: Pick<GlassSettings, "style">) => f.style === "glass";
export const glassFrame = (f: Pick<GlassSettings, "frameWidth">) => f.frameWidth ?? GLASS_FRAME;

/**
 * What a change of style sets: a frame door its routed frame (70 mm, a panel 6 mm back), a glass door its aluminium
 * frame (20 mm), clear glass and brushed aluminium unless already chosen.
 */
export function styleChange(style: DoorStyle, current: GlassSettings & { frameDepth?: number; pitch?: number }): GlassSettings & { frameDepth?: number; pitch?: number } {
  if (style === "fluted" || style === "slats") return decorChange(style, current);
  // Each style its own frame and depth: a groove's depth is not a panel's set-back.
  if (style === "frame") return { style, frameWidth: current.style === "frame" ? (current.frameWidth ?? 70) : 70, frameDepth: current.style === "frame" ? (current.frameDepth ?? 6) : 6 };
  if (style === "glass") return { style, frameWidth: current.style === "glass" ? glassFrame(current) : GLASS_FRAME, glass: current.glass ?? "clear", profile: current.profile ?? "brushed" };
  return { style };
}

/** The two axes of a door's face (the third, `depth`, runs through its thickness). */
const faceAxes = (depth: 0 | 1 | 2) => [0, 1, 2].filter((i) => i !== depth) as [number, number];

/** A box inset by `inset` on the face's axes, and from `a` to `b` through the thickness. */
function insetBox(from: Vec3, to: Vec3, depth: 0 | 1 | 2, inset: number, [a, b]: [number, number]): [Vec3, Vec3] {
  const lo = [...from] as Vec3;
  const hi = [...to] as Vec3;
  for (const i of faceAxes(depth)) {
    lo[i] = Math.min(from[i]!, to[i]!) + inset;
    hi[i] = Math.max(from[i]!, to[i]!) - inset;
  }
  [lo[depth], hi[depth]] = [a, b];
  return [lo, hi];
}

/** The glass of a door (its box `from`–`to`, `depth` the axis through it): in the middle of its thickness, in the groove. */
export function glassPane(from: Vec3, to: Vec3, depth: 0 | 1 | 2, frameWidth: number): [Vec3, Vec3] {
  const mid = (from[depth]! + to[depth]!) / 2;
  return insetBox(from, to, depth, frameWidth - GLASS_GROOVE, [mid - GLASS_THICKNESS / 2, mid + GLASS_THICKNESS / 2]);
}

/** The opening inside the frame, through the door (a little beyond both faces, to cut it clean). */
export function glassOpening(from: Vec3, to: Vec3, depth: 0 | 1 | 2, frameWidth: number): [Vec3, Vec3] {
  const [a, b] = [Math.min(from[depth]!, to[depth]!), Math.max(from[depth]!, to[depth]!)];
  return insetBox(from, to, depth, frameWidth, [a - 1, b + 1]);
}

/** How far in from the door's edge its handle goes: on the frame of a glass door, else 40 mm. */
export const handleInset = (f: GlassSettings) => (isGlass(f) ? glassFrame(f) / 2 : 40);

/** Why a glass door of this size (`width` × `height`, `thickness`) cannot be made, or null. */
export function glassProblem(f: GlassSettings, doors: readonly { width: number; height: number }[], thickness: number): string | null {
  if (!isGlass(f)) return null;
  const w = glassFrame(f);
  if (!(w >= MIN_GLASS_FRAME)) return `Le cadre alu doit faire au moins ${MIN_GLASS_FRAME} mm de large pour tenir le verre.`;
  if (doors.some((d) => Math.min(d.width, d.height) - 2 * w < MIN_GLASS)) return "Le cadre alu est trop large pour ces portes.";
  if (!(thickness >= MIN_THICKNESS)) return `Une porte vitrée doit faire au moins ${MIN_THICKNESS} mm d'épaisseur (verre de ${GLASS_THICKNESS} mm dans le profilé).`;
  return null;
}

/** The bought parts of glass doors (each its box and the axis through it): glass in m², profile in metres. */
export function glassHardware(f: GlassSettings, doors: readonly { from: Vec3; to: Vec3; depth: 0 | 1 | 2 }[]): { name: string; quantity: number; unit: string }[] {
  if (!isGlass(f) || !doors.length) return [];
  const w = glassFrame(f);
  let area = 0;
  let metres = 0;
  for (const d of doors) {
    const [i, j] = faceAxes(d.depth);
    const [a, b] = [Math.abs(d.to[i]! - d.from[i]!), Math.abs(d.to[j]! - d.from[j]!)];
    area += (a - 2 * (w - GLASS_GROOVE)) * (b - 2 * (w - GLASS_GROOVE));
    metres += 2 * (a + b);
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return [
    { name: glassItem(f.glass), quantity: round(area / 1e6), unit: "m²" },
    { name: profileItem(f.profile), quantity: round(metres / 1000), unit: "m" },
  ];
}

/** The fields of a glass door in a document, checked: why they are wrong, or null. */
export function glassFieldsProblem(f: Record<string, unknown>, styles: readonly string[]): string | null {
  if (f.style !== undefined && !styles.includes(f.style as string)) return "style de porte inconnu.";
  if (f.glass !== undefined && !GLASS_KINDS.some(([k]) => k === f.glass)) return "verre inconnu.";
  if (f.profile !== undefined && !PROFILE_FINISHES.some(([k]) => k === f.profile)) return "finition du cadre alu inconnue.";
  if (f.frameWidth !== undefined && !(typeof f.frameWidth === "number" && Number.isFinite(f.frameWidth) && f.frameWidth >= 0)) return "« frameWidth » doit être un nombre positif ou nul.";
  if (f.pitch !== undefined && !(typeof f.pitch === "number" && Number.isFinite(f.pitch) && f.pitch > 0)) return "« pitch » doit être un nombre positif.";
  return null;
}
