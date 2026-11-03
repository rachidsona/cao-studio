/**
 * Le Contrôle d'implantation (document/layout-check.ts) lu dans le modèle affiché : chaque caisson (ses pièces
 * réunies en une boîte, son rôle d'après son nom : colonne réfrigérateur, four), l'électroménager (le calque
 * « Électroménager » ou le nom : hotte, plaque, four, lave-vaisselle), les plans de travail et l'évier découpé
 * dedans, les murs (ceux de la Pièce relevée, ceux d'une implantation) et les tringles des penderies.
 */
import { bodyFamily } from "../document/display-families";
import { roleOf, type LayoutInput, type PlacedItem } from "../document/layout-check";
import { bodyLabel, bodyOrigin } from "../document/operations";
import { featureOfBody, type CadDocument, type RoomFeature, type Vec3 } from "../document/types";
import { wallFrames, type P2 } from "../features/room-plan";
import type { Viewport } from "../viewport/viewport";

type Box = [Vec3, Vec3];

const union = (boxes: Box[]): Box => [
  [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k]!))) as Vec3,
  [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k]!))) as Vec3,
];

/** What the displayed model puts in the room, and the inside of the surveyed room. */
export function layoutOf(viewport: Viewport, doc: CadDocument): LayoutInput {
  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };
  const items: PlacedItem[] = [];
  const cabinets = new Map<string, { ids: string[]; boxes: Box[] }>();
  for (const id of viewport.displayedBodies) {
    const box = boxOf(id);
    if (!box) continue;
    const feature = doc.features.find((f) => f.id === featureOfBody(bodyOrigin(doc, id)));
    if (feature?.type === "cabinet") {
      const c = cabinets.get(feature.id) ?? { ids: [], boxes: [] };
      c.ids.push(id);
      c.boxes.push(box);
      cabinets.set(feature.id, c);
      continue;
    }
    const label = bodyLabel(doc, id);
    const part = label.includes(" — ") ? label.slice(label.lastIndexOf(" — ") + 3) : label;
    const family = bodyFamily(doc, id);
    if (family === "room") items.push({ ids: [id], name: label, box, kind: "wall" });
    else if (feature?.type === "niche" && feature.fill === "rod" && /^tringle/i.test(part)) items.push({ ids: [id], name: feature.name, box, kind: "cabinet", role: "rail" });
    else if (/^plan de travail/i.test(part)) items.push({ ids: [id], name: label, box, kind: "worktop" });
    else if (family === "appliances" || roleOf(part)) {
      const role = roleOf(part);
      if (role && role !== "rail") items.push({ ids: [id], name: label, box, kind: "appliance", role });
    }
  }
  for (const [featureId, c] of cabinets) {
    const f = doc.features.find((x) => x.id === featureId);
    if (f?.type !== "cabinet") continue;
    const rotation = f.rotation ?? 0;
    const front: P2 = rotation === 0 ? [0, -1] : rotation === 90 ? [1, 0] : rotation === 180 ? [0, 1] : [-1, 0];
    items.push({ ids: c.ids, name: f.name, box: union(c.boxes), kind: "cabinet", role: roleOf(f.name), front });
  }
  // The sink: the cut-out of a worktop, along its length from its low end.
  for (const m of doc.features) {
    if (m.type !== "machining" || m.suppressed || m.kind !== "cutout") continue;
    const wt = boxOf(m.target);
    if (!wt) continue;
    const along = wt[1][0] - wt[0][0] >= wt[1][1] - wt[0][1] ? 0 : 1;
    for (const c of m.cutouts ?? []) {
      if (!c.appliance.startsWith("sink")) continue;
      const at: Vec3 = [(wt[0][0] + wt[1][0]) / 2, (wt[0][1] + wt[1][1]) / 2, wt[1][2]];
      at[along] = wt[0][along]! + c.along;
      items.push({ ids: [m.target], name: "Évier", box: [[at[0] - 250, at[1] - 200, at[2]], [at[0] + 250, at[1] + 200, at[2] + 5]], kind: "appliance", role: "sink" });
    }
  }
  const room = doc.features.find((f): f is RoomFeature => f.type === "room" && !f.suppressed);
  return { items, ...(room ? { room: wallFrames(room).map((w) => w.start) } : {}) };
}
