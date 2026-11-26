/**
 * La cuisine vue « de l'intérieur de sa pièce », comme on la verrait debout dans la pièce : quand le plan a sa pièce
 * (document/kitchen-plan-shell.ts), la vue se tourne vers le coin de ses linéaires, l'œil un peu au-dessus des yeux et
 * plus bas que le plafond, toute la cuisine dans le cadre, sur son sol ; les murs passés derrière l'œil s'effacent
 * d'eux-mêmes (app/wall-cutaway.ts). Sans pièce : tout ce qui est affiché cadré, la vue gardée. La vue seulement.
 */
import * as THREE from "three";
import { kitchenPlanIn, kitchenPlanOf } from "../../document/kitchen-floor";
import { ROOM_MADE, roomLook } from "../../document/kitchen-plan-shell";
import type { CadDocument } from "../../document/types";
import { placePoint, turn } from "../../features/room-runs";
import type { Viewport } from "../../viewport/viewport";

/** The view on the kitchen of this plan (the document's last when none is named); `always`: even when all of it is seen already. */
export function frameKitchen(viewport: Viewport, doc: CadDocument, planId = kitchenPlanOf(doc)?.id, always = true): void {
  const plan = planId ? kitchenPlanIn(doc, planId) : undefined;
  if (plan?.made?.[ROOM_MADE]?.length) {
    const place = plan.place ?? { quarter: 0 as const, origin: [0, 0] as [number, number] };
    const look = roomLook(plan);
    const [target, way] = [placePoint(place, look.target), turn(place, look.way)];
    const box = new THREE.Box3().setFromPoints(look.box.map((p) => new THREE.Vector3(...placePoint(place, p))));
    if (!always && viewport.boxVisible(box, 0.95)) return;
    viewport.setCameraState({ position: [target[0] + way[0] * 1000, target[1] + way[1] * 1000, target[2] + way[2] * 1000], target, up: [0, 0, 1] });
    return viewport.fitBox(box, 0.8);
  }
  const box = new THREE.Box3();
  for (const id of viewport.displayedBodies) {
    const m = viewport.bodyMesh(id)?.metrics.bbox;
    if (m) box.expandByPoint(new THREE.Vector3(...m[0])).expandByPoint(new THREE.Vector3(...m[1]));
  }
  if (!box.isEmpty() && !viewport.boxVisible(box, 0.8)) viewport.fitBox(box, 1.2);
}
