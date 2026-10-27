/**
 * Tree of the bodies shown in the browser, like the body folders of desktop
 * CAD tools: the bodies made together by one feature (the pieces of a split,
 * the panels of a skeleton, the parts of a cabinet, the copies of an array or
 * a mirror) are gathered under that feature; each body unfolds into the
 * history that built it (its sketches and operations, oldest first).
 */
import { bodyLabel, bodyOrigin, findFeature } from "./operations";
import { PART_SEPARATOR, consumedBodies, featureInputs, featureOfBody, type CadDocument } from "./types";

export interface BodyLeaf {
  bodyId: string;
  /** Name shown in the tree (inside a group, without the group's name in front). */
  label: string;
  /** Ids of the features that built the body, oldest first (input sketches included). */
  history: string[];
}

export interface BodyGroup {
  /** Feature that made the bodies of the group. */
  id: string;
  name: string;
  bodies: BodyLeaf[];
}

export type BodyNode = { kind: "body"; body: BodyLeaf } | { kind: "group"; group: BodyGroup };

/** The features that built a body, oldest first: its chain back to where it was created, through the split it comes from, with their input sketches. */
export function bodyHistory(doc: CadDocument, bodyId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let id: string | undefined = bodyId;
  while (id && !seen.has(id)) {
    seen.add(id);
    // A piece ("sp1#2") goes on with the feature that made it.
    const feature = findFeature(doc, id.includes(PART_SEPARATOR) ? featureOfBody(id) : id);
    if (!feature) break;
    chain.push(feature.id);
    for (const input of featureInputs(feature)) if (findFeature(doc, input)?.type === "sketch") chain.push(input);
    id = consumedBodies(feature)[0];
  }
  const order = new Map(doc.features.map((f, i) => [f.id, i]));
  return [...new Set(chain)].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Name of the group of the bodies made by one feature: the body that was split, else the feature. */
function groupName(doc: CadDocument, featureId: string): string {
  const feature = findFeature(doc, featureId);
  if (feature?.type === "split") return bodyLabel(doc, feature.target);
  return feature?.name ?? featureId;
}

/** The bodies in their order, those made by the same feature (two or more) gathered into one group where the first of them is. */
export function bodyTree(doc: CadDocument, bodyIds: string[]): BodyNode[] {
  const maker = (bodyId: string): string | null => {
    const origin = bodyOrigin(doc, bodyId);
    return origin.includes(PART_SEPARATOR) ? featureOfBody(origin) : null;
  };
  const count = new Map<string, number>();
  for (const bodyId of bodyIds) {
    const m = maker(bodyId);
    if (m) count.set(m, (count.get(m) ?? 0) + 1);
  }
  const nodes: BodyNode[] = [];
  const groups = new Map<string, BodyGroup>();
  for (const bodyId of bodyIds) {
    const m = maker(bodyId);
    const label = bodyLabel(doc, bodyId);
    if (!m || (count.get(m) ?? 0) < 2) {
      nodes.push({ kind: "body", body: { bodyId, label, history: bodyHistory(doc, bodyId) } });
      continue;
    }
    let group = groups.get(m);
    if (!group) {
      group = { id: m, name: groupName(doc, m), bodies: [] };
      groups.set(m, group);
      nodes.push({ kind: "group", group });
    }
    const prefix = `${group.name} — `;
    group.bodies.push({ bodyId, label: label.startsWith(prefix) ? label.slice(prefix.length) : label, history: bodyHistory(doc, bodyId) });
  }
  return nodes;
}
