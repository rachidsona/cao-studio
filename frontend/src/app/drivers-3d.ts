/**
 * Pilotes dans la vue (les « étiquettes de modification » de TopSolid) : quand les pièces d'un seul caisson sont
 * sélectionnées, ses cotes — largeur, hauteur, profondeur, étagères — s'affichent sur lui en étiquettes ; un clic en
 * fait un champ, Entrée reconstruit le caisson (une annulation). Une cote qui suit un paramètre (« largeur ») change
 * le paramètre, et tout ce qui le suit ; une cote faite d'une formule plus longue est laissée à sa formule. Rien ne
 * s'affiche pendant un outil.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { applyExpressions } from "../document/expressions";
import { bodyOrigin, updateFeature } from "../document/operations";
import { featureOfBody, type CabinetFeature, type Vec3 } from "../document/types";
import { cabinetProblem } from "../features/cabinet-parts";
import { formatLength, fromDisplay, toDisplay } from "../measurements/units";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

type Key = "width" | "height" | "depth" | "shelves";
const LABELS: Record<Key, string> = { width: "L", height: "H", depth: "P", shelves: "Étagères" };

/** The cabinet whose parts (or fronts) are all the bodies selected, or null. */
function selectedCabinet(editor: Editor): CabinetFeature | null {
  const doc = editor.doc;
  const ids = editor.picked.selection.bodies;
  if (!ids.length) return null;
  const owners = new Set(
    ids.map((id) => {
      const f = doc.features.find((x) => x.id === featureOfBody(bodyOrigin(doc, id)));
      return f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : "";
    }),
  );
  if (owners.size !== 1) return null;
  const id = [...owners][0];
  return doc.features.find((f): f is CabinetFeature => f.id === id && f.type === "cabinet" && !f.suppressed) ?? null;
}

export function bindDrivers(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const group = new THREE.Group();
  viewport.scene.add(group);
  let shown = "";
  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
    }
    shown = "";
  };

  const set = (cabinet: CabinetFeature, key: Key, value: number) => {
    const next = { ...cabinet, [key]: value };
    const problem = cabinetProblem(next);
    if (problem) return editor.notify(problem, "error");
    const formula = cabinet.expressions?.[key]?.trim();
    if (!formula) return void editor.change(updateFeature(editor.doc, cabinet.id, () => next));
    // Driven by a parameter: the parameter changes (and what follows it); by a longer formula: the formula stays.
    const parameter = editor.doc.parameters[formula];
    if (!parameter || parameter.expression) return editor.notify(`Cette cote suit la formule « ${formula} » : changez-la dans Atelier › Paramètres.`, "info");
    const { doc } = applyExpressions({ ...editor.doc, parameters: { ...editor.doc.parameters, [formula]: { ...parameter, value } } });
    void editor.change(doc);
    editor.notify(`Paramètre « ${formula} » : ${key === "shelves" ? value : formatLength(value, editor.unit)}.`, "success");
  };

  const label = (cabinet: CabinetFeature, key: Key, at: Vec3) => {
    const span = document.createElement("span");
    span.className = "cad-measure cad-driver";
    span.style.pointerEvents = "auto";
    const value = cabinet[key];
    span.textContent = `${LABELS[key]} ${key === "shelves" ? value : formatLength(value, editor.unit)}`;
    span.title = "Cliquez pour changer la cote";
    span.addEventListener("pointerdown", (e) => e.stopPropagation());
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.className = "w-20 bg-white px-1 text-right text-xs text-gray-900";
      input.value = String(key === "shelves" ? value : Number(toDisplay(value, editor.unit).toFixed(3)));
      span.replaceChildren(`${LABELS[key]} `, input);
      input.focus();
      input.select();
      let done = false;
      const finish = (apply: boolean) => {
        if (done) return;
        done = true;
        const v = Number(input.value);
        if (apply && Number.isFinite(v)) set(cabinet, key, key === "shelves" ? Math.max(0, Math.round(v)) : fromDisplay(v, editor.unit));
        else show(true);
      };
      input.addEventListener("keydown", (k) => {
        k.stopPropagation();
        if (k.key === "Enter") finish(true);
        if (k.key === "Escape") finish(false);
      });
      input.addEventListener("blur", () => finish(true));
    });
    const object = new CSS2DObject(span);
    object.position.set(...at);
    group.add(object);
  };

  const show = (force = false) => {
    const cabinet = root.dataset.tool ? null : selectedCabinet(editor);
    if (!cabinet) return clear();
    const key = JSON.stringify(cabinet) + editor.unit;
    if (key === shown && !force) return;
    clear();
    shown = key;
    // The box of its bodies as displayed (turned with it).
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const id of viewport.displayedBodies) {
      if (featureOfBody(bodyOrigin(editor.doc, id)) !== cabinet.id) continue;
      const b = viewport.bodyMesh(id)?.metrics.bbox;
      if (!b) continue;
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i]!, b[0][i]!);
        hi[i] = Math.max(hi[i]!, b[1][i]!);
      }
    }
    if (!Number.isFinite(lo[0])) return;
    const mid = (i: number) => (lo[i]! + hi[i]!) / 2;
    // The front face: −Y at 0°, +X at 90°, +Y at 180°, −X at 270°.
    const rot = cabinet.rotation ?? 0;
    const across = rot === 90 || rot === 270 ? 1 : 0;
    const front: Vec3 = [mid(0), mid(1), mid(2)];
    if (rot === 0) front[1] = lo[1];
    if (rot === 180) front[1] = hi[1];
    if (rot === 90) front[0] = hi[0];
    if (rot === 270) front[0] = lo[0];
    const side = [...front] as Vec3;
    side[across] = lo[across]!;
    label(cabinet, "width", [front[0], front[1], lo[2]]);
    label(cabinet, "height", [side[0], side[1], mid(2)]);
    label(cabinet, "depth", [rot === 90 || rot === 270 ? mid(0) : side[0], rot === 90 || rot === 270 ? side[1] : mid(1), hi[2]]);
    label(cabinet, "shelves", [front[0], front[1], mid(2)]);
  };

  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    show();
  };
}
