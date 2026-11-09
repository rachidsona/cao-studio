/**
 * « Repères des pièces » (colonne Vue, comme les numéros de pièce d'OpenCutList) : un interrupteur qui écrit sur
 * chaque pièce vue son repère de la liste de débit (A, B, C… : les pièces identiques ont le même), au milieu de la
 * pièce. Une pièce cachée par une autre (derrière une porte) n'a pas le sien ; ils suivent la vue quand elle tourne et
 * le modèle quand il change. L'état est gardé dans ce navigateur.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { cutList } from "../document/cut-list";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { partsOf } from "./workshop/workshop";

const KEY = "cao.part-tags";

export function bindPartTags(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>("[data-part-tags]");
  const group = new THREE.Group();
  group.renderOrder = 48;
  viewport.scene.add(group);
  const raycaster = new THREE.Raycaster();
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    // No storage: off.
  }
  let stamp = "";
  let moved = 0;

  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
    }
  };

  /** True when the first thing the eye meets towards this point is this body. */
  const seen = (bodyId: string, p: THREE.Vector3, meshes: THREE.Object3D[]): boolean => {
    const eye = viewport.camera.position;
    raycaster.set(eye, p.clone().sub(eye).normalize());
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return !hit || hit.object.userData.bodyId === bodyId;
  };

  const draw = () => {
    clear();
    if (!on) return;
    const parts = partsOf(viewport, editor.doc);
    const tags = new Map(cutList(editor.doc, parts).rows.flatMap((r) => (r.ids ?? []).map((id) => [id, r.tag ?? ""] as const)));
    const meshes = viewport.bodyMeshes().filter((m) => m.visible);
    for (const part of parts) {
      const [lo, hi] = part.bbox;
      const at = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      const tag = tags.get(part.id);
      if (!tag || !seen(part.id, at, meshes)) continue;
      const span = document.createElement("span");
      span.className = "cad-part-tag";
      span.textContent = tag;
      const label = new CSS2DObject(span);
      label.position.copy(at);
      group.add(label);
    }
  };

  // Drawn again when the view stops turning (what hides what changes) and when the pieces change.
  let frames = 0;
  viewport.onEachFrame(() => {
    if (!on || ++frames % 6) return;
    const c = viewport.camera;
    const now = [...c.position.toArray(), ...c.quaternion.toArray()].map((v) => v.toFixed(3)).join();
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
