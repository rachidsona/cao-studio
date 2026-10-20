/** Labels, icons and state colours of the history features, shared by the navigator, the timeline and the dialog. */
import type { Feature } from "../document/types";
import type { FeatureState } from "../history/recompute";

export const TYPE_LABELS: Record<Feature["type"], string> = {
  sketch: "Esquisse",
  extrude: "Extrusion",
  hole: "Perçage",
  revolve: "Révolution",
  fillet: "Congé",
  chamfer: "Chanfrein",
  combine: "Combinaison",
};

export const TYPE_ICONS: Record<Feature["type"], string> = {
  sketch: "✎",
  extrude: "▣",
  hole: "◎",
  revolve: "⟲",
  fillet: "◜",
  chamfer: "◸",
  combine: "⧉",
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
  type: Feature["type"];
  state: FeatureState;
  /** Regeneration message (error or blocked), if any. */
  message?: string;
  suppressed: boolean;
  hidden: boolean;
  /** A body rather than a feature: `id` is its latest feature, `originId` the feature that created it. */
  body?: { originId: string };
}
