/**
 * Tirer une étagère ou une cloison : quand une seule est sélectionnée, une poignée s'affiche dessus. On la tire dans la
 * vue, les deux niches voisines s'affichent en direct, la position s'accroche au pas de 32 mm (Alt : librement). Le
 * document ne change qu'au lâcher, une annulation ; les autres étagères restent en place.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { shelfTravel, withShelfMoved } from "../../document/niche-size";
import { bodyOrigin, findFeature } from "../../document/operations";
import { stepOfBody } from "../../document/sketch-extrusion";
import type { SketchFeature } from "../../document/types";
import { formatLength } from "../../measurements/units";
import { frameOf, rayToSketch, toWorld } from "../../sketcher/frame";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";

const PITCH = 32;

export function bindShelfDrag(viewport: Viewport, editor: Editor): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cad-shelf-handle";
  button.title = "Tirer pour déplacer (Alt : sans le pas de 32 mm)";
  button.style.pointerEvents = "auto";
  button.dataset.shelfHandle = "";
  const handle = new CSS2DObject(button);
  handle.visible = false;
  viewport.scene.add(handle);
  let target: { sketch: SketchFeature; record: string; index: number } | null = null;

  const place = () => {
    const travel = target && shelfTravel(target.sketch, target.record, target.index);
    if (!target || !travel) {
      handle.visible = false;
      return;
    }
    show(travel.position);
    button.textContent = "⇕";
    button.dataset.axis = travel.vertical ? "x" : "y";
    handle.visible = true;
  };
  const show = (position: number) => {
    if (!target) return;
    const travel = shelfTravel(target.sketch, target.record, target.index);
    if (!travel) return;
    const middle = (travel.across[0] + travel.across[1]) / 2;
    const frame = frameOf(target.sketch);
    const depth = target.sketch.offsets?.find((r) => r.id === target?.record)?.step;
    const front = depth && "depth" in depth ? (depth.depth ?? 0) : 0;
    handle.position.copy(new THREE.Vector3(...(travel.vertical ? toWorld(frame, position, middle) : toWorld(frame, middle, position)))).addScaledVector(new THREE.Vector3(...frame.normal), front);
  };

  const selected = viewport.onSelectionChange;
  viewport.onSelectionChange = (selection) => {
    selected(selection);
    target = null;
    if (selection.bodies.length === 1 && !viewport.inSketch) {
      const origin = bodyOrigin(editor.doc, selection.bodies[0] as string);
      const step = stepOfBody(editor.doc, origin);
      const sketch = step?.kind === "shelves" ? (findFeature(editor.doc, step.sketch) as SketchFeature) : null;
      const index = sketch?.offsets?.find((r) => r.id === step?.offset)?.bodies?.indexOf(origin) ?? -1;
      if (step && sketch && index >= 0) target = { sketch, record: step.offset, index };
    }
    place();
  };

  button.addEventListener("pointerdown", (event) => {
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    button.setPointerCapture(event.pointerId);
    const held = target;
    const travel = shelfTravel(held.sketch, held.record, held.index);
    if (!travel) return;
    const frame = frameOf(held.sketch);
    let position = travel.position;
    const move = (e: PointerEvent) => {
      const { origin, direction } = viewport.rayFromEvent(e);
      const p = rayToSketch(frame, origin, direction);
      if (!p) return;
      const raw = travel.vertical ? p[0] : p[1];
      const pitched = e.altKey ? raw : travel.low + Math.round((raw - travel.low) / PITCH) * PITCH;
      position = Math.min(Math.max(pitched, travel.low + 1), travel.high - 1);
      show(position);
      button.textContent = `${formatLength(position - travel.low, editor.unit)} / ${formatLength(travel.high - position, editor.unit)}`;
    };
    const up = () => {
      button.removeEventListener("pointermove", move);
      button.removeEventListener("pointerup", up);
      button.removeEventListener("pointercancel", up);
      if (Math.abs(position - travel.position) < 0.5) return place();
      const made = withShelfMoved(editor.doc, held.sketch.id, held.record, held.index, position);
      if (typeof made === "string") {
        editor.notify(made, "error");
        return place();
      }
      target = null;
      handle.visible = false;
      void editor.change(made);
    };
    button.addEventListener("pointermove", move);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
  });
}
