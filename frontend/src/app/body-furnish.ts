/**
 * « Aménager ce corps » (clic droit sur un corps creux qui n'est pas déjà un meuble) : son ouverture reçoit une
 * Répartition dont les côtés sont ses parois (document/body-opening.ts). Étagères, Cloisons, Niche, Tiroirs, Penderie
 * et Portes y marchent alors par le clic droit dans l'ouverture ; « Étagères… », « Cloisons… », « Tiroirs… » et
 * « Porte… » du même menu font les deux d'un coup.
 */
import * as THREE from "three";
import { furnishedBodies, openingOf, withBodyFurnished, type BodyMesh } from "../document/body-opening";
import { bodyLabel } from "../document/operations";
import type { Vec3 } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import { nicheAt, type PickedNiche } from "./dressing/niche-pick";
import type { Editor } from "./editor";

/** Whether this body can be furnished so (a body of its own, not already furniture). */
export const canFurnishBody = (editor: Editor, bodyId: string): boolean => furnishedBodies(editor.doc, bodyId, [bodyId]) !== null;

/** The opening of this body (and of those made with it) furnished; the Répartition's sketch, or null (said why). */
/** The bodies furnished from this one: the frame it is a side of, and the outermost one when that is another. */
export function furnishChoices(editor: Editor, bodyId: string): { near: string[]; all: string[] | null } | null {
  const shown = (editor.result?.bodies ?? []).map((b) => b.bodyId);
  const near = furnishedBodies(editor.doc, bodyId, shown, "near");
  if (!near) return null;
  const all = furnishedBodies(editor.doc, bodyId, shown, "all");
  return { near, all: all && all.length > near.length ? all : null };
}

export async function furnishBody(editor: Editor, viewport: Viewport, bodyId: string, quiet = false, level: "near" | "all" = "near"): Promise<string | null> {
  // Hidden ones are skipped by the meshes below (none shown).
  const shown = (editor.result?.bodies ?? []).map((b) => b.bodyId);
  const picked = editor.picked.selection.bodies;
  // Several bodies selected with it: those; else the ones made with it.
  const ids = picked.length > 1 && picked.includes(bodyId) ? [...picked] : furnishedBodies(editor.doc, bodyId, shown, level);
  if (!ids?.length) return (editor.notify("Ce corps est déjà un meuble : clic droit dans une de ses niches pour l'aménager.", "info"), null);
  const meshes: BodyMesh[] = [];
  const boxes: [Vec3, Vec3][] = [];
  for (const id of ids) {
    const mesh = viewport.bodyMesh(id);
    if (!mesh) continue;
    meshes.push(mesh);
    boxes.push(mesh.metrics.bbox);
  }
  if (!boxes.length) return null;
  const outer: [Vec3, Vec3] = [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3];
  const camera = viewport.camera;
  const eye = camera.getWorldDirection(new THREE.Vector3()).toArray() as Vec3;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).toArray() as Vec3;
  const opening = openingOf(meshes, outer, eye, up);
  if (typeof opening === "string") return (editor.notify(opening, "info"), null);
  const name = bodyLabel(editor.doc, ids[0]!).replace(/\s+—\s+côté \d+$/, "");
  const made = withBodyFurnished(editor.doc, opening, `Aménagement — ${name}`, ids);
  if (typeof made === "string") return (editor.notify(made, "info"), null);
  await editor.change(made.doc);
  if (!quiet) editor.notify(`« ${name} » est prêt à aménager : clic droit dans son ouverture pour Étagères, Cloisons, Niche, Tiroirs, Penderie ou Porte.`, "success");
  return made.sketch;
}

/** The body furnished, then `run` on its niche at `at` (a point of the model clicked). */
export async function openInBody(editor: Editor, viewport: Viewport, bodyId: string, at: Vec3, run: (niche: PickedNiche) => void, level: "near" | "all" = "near"): Promise<void> {
  const sketch = await furnishBody(editor, viewport, bodyId, true, level);
  const niche = sketch ? nicheAt(editor.doc, sketch, at) : null;
  if (niche) run(niche);
}
