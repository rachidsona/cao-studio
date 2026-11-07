/**
 * Ce que la barre contextuelle propose pour ce qui est sélectionné : le sélecteur des boutons du ruban utiles à cette
 * sorte d'élément, le plus courant d'abord. Pur.
 */
import { bodyOrigin, findFeature } from "./operations";
import { featureOfBody, type CadDocument } from "./types";
import { isPartition } from "../sketcher/partition-history";

export interface ContextTools {
  title: string;
  /** Selectors of buttons of the ribbon. */
  tools: string[];
}

const action = (name: string) => `[data-action="${name}"]`;
const workshop = (name: string) => `[data-workshop="${name}"]`;

const PLAN: ContextTools = { title: "Plan de dressing", tools: [workshop("dressing-plan"), workshop("module-palette")] };
const PARTITION: ContextTools = { title: "Répartition", tools: [action("shelves"), action("cloisons"), action("module"), workshop("module-palette"), action("penderie"), action("tiroirs"), action("fronts"), action("lighting")] };
const CABINET: ContextTools = { title: "Caisson", tools: [action("fronts"), workshop("material"), action("move"), action("lighting"), workshop("appearance")] };
const PIECE: ContextTools = { title: "Pièce", tools: [action("move"), workshop("material"), action("add-hole"), action("split")] };

const partitioned = (doc: CadDocument, id: string | undefined) => {
  const sketch = id ? findFeature(doc, id) : undefined;
  return sketch?.type === "sketch" && (sketch.offsets ?? []).some(isPartition);
};

/** The tools for these sketches and bodies; nothing selected: none. */
export function contextTools(doc: CadDocument, sketches: readonly string[], bodies: readonly string[]): ContextTools | null {
  const sketch = sketches[0] ? findFeature(doc, sketches[0]) : undefined;
  if (sketch?.type === "sketch") return sketch.dressingPlan ? PLAN : partitioned(doc, sketch.id) ? PARTITION : null;
  if (!bodies[0]) return null;
  const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, bodies[0])));
  if (feature?.type === "cabinet" || feature?.type === "fronts") return CABINET;
  if (feature?.type === "extrude" && partitioned(doc, feature.sketch)) return PARTITION;
  return PIECE;
}
