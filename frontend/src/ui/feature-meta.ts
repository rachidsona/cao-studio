/** Labels, icons and state colours of the history features, shared by the navigator, the timeline and the dialog. */
import type { Feature } from "../document/types";
import type { FeatureState } from "../history/recompute";

/** Feature types, plus the offsets made inside sketches. */
export type NavType = Feature["type"] | "offset";

export const TYPE_LABELS: Record<NavType, string> = {
  sketch: "Esquisse",
  extrude: "Extrusion",
  hole: "Perçage",
  revolve: "Révolution",
  fillet: "Congé",
  chamfer: "Chanfrein",
  combine: "Combinaison",
  offset: "Décalage",
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
};

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
