/**
 * Un appareil posé à la main (Électroménager) ôté du projet, avec la découpe du plan de travail faite pour lui : celle
 * qui porte son nom et se trouve sous lui. Le plan de travail redevient plein à cet endroit. Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { deleteFeatures, findFeature } from "./operations";
import type { CadDocument, MachiningOp } from "./types";

/** Around the appliance, where its cut is (mm). */
const AROUND = 60;

const middle = (op: MachiningOp): [number, number] => (op.kind === "hole" ? [op.at[0], op.at[1]] : [(op.from[0] + op.to[0]) / 2, (op.from[1] + op.to[1]) / 2]);

/** The document without this appliance and its cut; itself when it is no appliance. */
export function withApplianceRemoved(doc: CadDocument, id: string): CadDocument {
  const a = findFeature(doc, id);
  if (a?.type !== "appliance") return doc;
  const { along, back } = cabinetAxes(a.rotation ?? 0);
  const xs = [0, a.width].flatMap((u) => [0, a.depth].map((v) => a.origin[0] + along[0] * u + back[0] * v));
  const ys = [0, a.width].flatMap((u) => [0, a.depth].map((v) => a.origin[1] + along[1] * u + back[1] * v));
  const under = ([x, y]: [number, number]) => x >= Math.min(...xs) - AROUND && x <= Math.max(...xs) + AROUND && y >= Math.min(...ys) - AROUND && y <= Math.max(...ys) + AROUND;
  const cuts = doc.features.filter((f) => f.type === "machining" && f.name === `Découpe ${a.name}` && f.ops.some((op) => under(middle(op)))).map((f) => f.id);
  return deleteFeatures(doc, [id, ...cuts]).next;
}
