/** Labels, icons and state colours of the history features, shared by the navigator, the timeline and the dialog. */
import type { BooleanOperation, Feature } from "../document/types";
import type { FeatureState } from "../history/recompute";

/** Feature types, plus the offsets made inside sketches. */
export type NavType = Feature["type"] | "offset" | "partition" | "shelves" | "cloisons";

export const TYPE_LABELS: Record<NavType, string> = {
  sketch: "Esquisse",
  extrude: "Extrusion",
  hole: "Perçage",
  revolve: "Révolution",
  fillet: "Congé",
  chamfer: "Chanfrein",
  combine: "Combinaison",
  offset: "Décalage",
  partition: "Répartition",
  shelves: "Étagères",
  cloisons: "Cloisons",
  split: "Scission",
  move: "Déplacement",
  panels: "Panneaux",
  cabinet: "Caisson",
  mirror: "Symétrie",
  align: "Alignement",
  stretch: "Étirement",
  array: "Réseau",
  rotate: "Rotation",
  machining: "Usinage",
  sweep: "Suivre-moi",
  shell: "Coque",
  paneling: "Panneaux sur faces",
  loft: "Lissage",
  modifier: "Modificateur",
  fronts: "Façades",
  niche: "Équipement de niche",
  trim: "Finitions",
  room: "Pièce",
};

export const TYPE_ICONS: Record<NavType, string> = {
  sketch: "✎",
  extrude: "▣",
  hole: "◎",
  revolve: "⟲",
  fillet: "◜",
  chamfer: "◸",
  combine: "⧉",
  offset: "⇉",
  partition: "▥",
  shelves: "☰",
  cloisons: "▯",
  split: "✂",
  move: "✥",
  panels: "▤",
  cabinet: "▥",
  mirror: "⇋",
  align: "⫼",
  stretch: "⟷",
  array: "⁞",
  rotate: "↻",
  machining: "⛭",
  sweep: "⤳",
  shell: "◫",
  paneling: "⬡",
  loft: "⏢",
  modifier: "≈",
  fronts: "▯",
  niche: "⌒",
  trim: "▭",
  room: "⌂",
};

/** The toolbar icon (sprite id, templates/editor/_icons.html) of each type: the history shows these instead of names. */
export const TYPE_SPRITES: Record<NavType, string> = {
  sketch: "i-sketch",
  extrude: "i-extrude",
  hole: "i-hole",
  revolve: "i-revolve",
  fillet: "i-fillet",
  chamfer: "i-chamfer",
  combine: "i-combine",
  offset: "i-offset",
  partition: "i-partition",
  shelves: "i-shelves",
  cloisons: "i-cloisons",
  split: "i-split",
  move: "i-move-3d",
  panels: "i-panels",
  cabinet: "i-cabinet",
  mirror: "i-mirror",
  align: "i-align",
  stretch: "i-stretch",
  array: "i-array",
  rotate: "i-rotate",
  machining: "i-machining",
  sweep: "i-sweep",
  shell: "i-shell",
  paneling: "i-paneling",
  loft: "i-loft",
  modifier: "i-modifier",
  fronts: "i-fronts",
  niche: "i-rod",
  trim: "i-finishing",
  room: "i-room",
};

/** Names of the boolean operations, the same everywhere in the interface (Fusion's words). */
export const OPERATION_LABELS: Record<BooleanOperation, string> = {
  new: "Nouveau corps",
  join: "Joindre",
  cut: "Couper",
  intersect: "Intersection",
};

/** Choices of an operation menu, in this order. */
export function operationChoices<T extends BooleanOperation>(...operations: T[]): [T, string][] {
  return operations.map((op) => [op, OPERATION_LABELS[op]]);
}

export const STATE_BADGES: Record<FeatureState, { label: string; dot: string }> = {
  ok: { label: "OK", dot: "bg-emerald-500" },
  error: { label: "Erreur", dot: "bg-red-500" },
  blocked: { label: "Bloquée", dot: "bg-amber-500" },
  suppressed: { label: "Désactivée", dot: "bg-gray-400" },
};

/** What the navigator, timeline and dialog need to know about one feature. */
export interface NavItem {
  id: string;
  name: string;
  type: NavType;
  state: FeatureState;
  /** Regeneration message (error or blocked), if any. */
  message?: string;
  suppressed: boolean;
  hidden: boolean;
  /** A body rather than a feature: `id` is its latest feature, `originId` the feature that created it. */
  body?: { originId: string };
  /** An offset of a sketch (shown in the timeline), not a feature of its own. */
  offset?: { sketchId: string };
}
