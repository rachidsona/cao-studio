/**
 * « Cotes des pièces » (colonne Vue, à droite de la vue) : un interrupteur qui écrit sur chaque pièce vue de face sa
 * largeur et sa hauteur, en rouge (features/piece-dims.ts). L'élément sélectionné — un caisson avec ses façades, une
 * répartition… — n'a que les siennes, et les garde pendant qu'un outil travaille dessus ; sans sélection, toutes les
 * pièces en vue. Seules les cotes qu'on voit s'écrivent (une porte cache le caisson derrière) ; elles suivent la vue
 * quand elle tourne et le modèle quand il change. Éteint, plus rien ; l'état est gardé dans ce navigateur.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type Vec3 } from "../document/types";
import { pieceDims, viewAxes, type Box } from "../features/piece-dims";
import { formatLength } from "../measurements/units";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

const KEY = "cao.piece-dims";
const COLOR = 0xdc2626;
/** More pieces than this in view: only the nearest are written. */
const MAX_PIECES = 300;

export function bindPieceDims(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>("[data-piece-dims]");
  const group = new THREE.Group();
  group.renderOrder = 47;
  viewport.scene.add(group);
  const material = new THREE.LineBasicMaterial({ color: COLOR });
  const raycaster = new THREE.Raycaster();
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    // No storage: off.
  }
  /** The features of the element worked on (kept while a tool has emptied the selection). */
  let element: Set<string> | null = null;
  let stamp = "";
  let moved = 0;

  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child instanceof THREE.LineSegments) child.geometry.dispose();
    }
  };

  /** The features of the selected bodies, a cabinet with its fronts. */
  const selectedElement = (): Set<string> | null => {
    const doc = editor.doc;
    const ids = new Set<string>();
    for (const body of editor.picked.selection.bodies) {
      const f = findFeature(doc, featureOfBody(bodyOrigin(doc, body)));
      if (!f) continue;
      ids.add(f.type === "fronts" ? f.cabinet : f.id);
    }
    if (!ids.size) return null;
    for (const f of doc.features) if (f.type === "fronts" && ids.has(f.cabinet)) ids.add(f.id);
    return ids;
  };

  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };

  /** True when nothing stands between the eye and this point of this body. */
  const seen = (bodyId: string, p: Vec3, meshes: THREE.Object3D[]): boolean => {
    const eye = viewport.camera.position;
    const target = new THREE.Vector3(...p);
    const direction = target.clone().sub(eye);
    const distance = direction.length();
    raycaster.set(eye, direction.normalize());
    raycaster.far = distance + 1;
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return !hit || hit.object.userData.bodyId === bodyId || hit.distance >= distance - 2;
  };

  const draw = () => {
    clear();
    if (!on) return;
    const picked = selectedElement();
    if (picked) element = picked;
    else if (!root.dataset.tool) element = null;
    const doc = editor.doc;
    const bodies = viewport.displayedBodies.filter((id) => !element || element.has(featureOfBody(bodyOrigin(doc, id))));
    const eye = viewport.camera.position;
    const toEye = viewport.camera.getWorldDirection(new THREE.Vector3()).negate();
    const up = viewport.camera.up.clone().applyQuaternion(viewport.camera.quaternion);
    const axes = viewAxes([toEye.x, toEye.y, toEye.z], [up.x, up.y, up.z]);
    const meshes = viewport.bodyMeshes();
    const nearest = bodies
      .map((id) => ({ id, box: boxOf(id) }))
      .filter((b): b is { id: string; box: Box } => !!b.box)
      .sort((a, b) => eye.distanceTo(center(a.box)) - eye.distanceTo(center(b.box)))
      .slice(0, MAX_PIECES);
    const points: number[] = [];
    for (const { id, box } of nearest) {
      for (const d of pieceDims(box, axes)) {
        // Seen along most of its line (not only through the gap between two doors).
        const looks = [0.25, 0.5, 0.75].map((t) => d.from.map((v, i) => v + (d.to[i]! - v) * t) as Vec3);
        if (looks.filter((p) => seen(id, p, meshes)).length < 2) continue;
        // The line and a short tick across each end.
        const tick = Math.min(d.length / 8, 25);
        const along = d.from.findIndex((v, i) => Math.abs(v - d.to[i]!) > 1e-6);
        const across = along === axes.up ? axes.across : axes.up;
        points.push(...d.from, ...d.to);
        for (const end of [d.from, d.to]) {
          const a = [...end] as Vec3;
          const b = [...end] as Vec3;
          a[across] = end[across]! - tick;
          b[across] = end[across]! + tick;
          points.push(...a, ...b);
        }
        const span = document.createElement("span");
        span.className = "cad-piece-dim";
        span.textContent = formatLength(d.length, editor.unit).replace(/\s*[a-zµ]+$/i, "");
        const label = new CSS2DObject(span);
        label.position.set(...d.at);
        group.add(label);
      }
    }
    if (points.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      group.add(new THREE.LineSegments(geometry, material));
    }
  };

  // Drawn again when the view stops turning (the axes and what hides what change) and when the pieces change.
  const look = () => {
    const c = viewport.camera;
    return [...c.position.toArray(), ...c.quaternion.toArray()].map((v) => v.toFixed(3)).join();
  };
  let frames = 0;
  viewport.onEachFrame(() => {
    if (!on || ++frames % 6) return;
    const now = look() + viewport.displayedBodies.map((id) => viewport.bodyMesh(id)?.metrics.bbox.join()).join("|");
    if (now !== stamp) {
      stamp = now;
      moved = performance.now();
      clear();
    } else if (moved && performance.now() - moved > 120) {
      moved = 0;
      draw();
    }
  });

  const set = (value: boolean) => {
    on = value;
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
    button?.setAttribute("aria-pressed", String(on));
    stamp = "";
    draw();
  };
  button?.addEventListener("click", () => set(!on));
  button?.setAttribute("aria-pressed", String(on));

  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    if (on) draw();
  };
}

const center = (b: Box) => new THREE.Vector3((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2);
