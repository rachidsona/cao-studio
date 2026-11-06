/** « Voir ce mur » : la vue de face sur une zone du plan, le reste caché. La vue seulement : rien ne change dans le projet. */
import * as THREE from "three";
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type DressingPlan, type SketchFeature } from "../document/types";
import { frameOf } from "../sketcher/frame";
import type { Viewport } from "../viewport/viewport";

/** Shows every body again. */
export function showAll(viewport: Viewport): void {
  for (const id of viewport.displayedBodies) viewport.setBodyVisible(id, true);
}

/** Faces this zone's front, its bodies alone in sight. */
export function viewZone(viewport: Viewport, doc: Parameters<typeof bodyOrigin>[0], plan: DressingPlan, zoneId: string): void {
  const sketchId = plan.made?.[zoneId];
  const sketch = sketchId ? (findFeature(doc, sketchId) as SketchFeature | undefined) : undefined;
  if (!sketch) return;
  const boards = new Set(plan.boards?.[zoneId] ?? []);
  const box = new THREE.Box3();
  for (const id of viewport.displayedBodies) {
    const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    const mine = !!feature && (boards.has(feature.id) || ((feature.type === "extrude" || feature.type === "niche") && feature.sketch === sketch.id));
    viewport.setBodyVisible(id, mine);
    const corners = mine ? viewport.bodyMesh(id)?.metrics.bbox : null;
    if (corners) box.expandByPoint(new THREE.Vector3(...corners[0])).expandByPoint(new THREE.Vector3(...corners[1]));
  }
  if (box.isEmpty()) return;
  const frame = frameOf(sketch);
  const { camera, controls } = viewport.rig;
  const center = box.getCenter(new THREE.Vector3());
  camera.up.set(0, 0, 1);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(new THREE.Vector3(...frame.normal), 1000);
  viewport.fitBox(box, 1.15);
}
