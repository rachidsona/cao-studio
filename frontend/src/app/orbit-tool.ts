/**
 * « Orbite » (colonne Vue, à droite de la vue ; comme l'outil Orbite de Fusion) : tant qu'il est allumé, glisser
 * tourne la vue autour du centre d'orbite (le point vert) — un clic sur le modèle y met le centre. Orbite libre :
 * un anneau au milieu de la vue ; dedans la boule tourne dans tous les sens, les poignées de gauche et de droite
 * seulement autour de la verticale de l'écran, celles du haut et du bas autour de l'horizontale, et dehors l'anneau
 * la vue roule. Orbite contrainte : le haut reste en haut. Maj + clic milieu tourne aussi, outil éteint, autour du
 * point du modèle sous la souris. Les choix (libre, contrainte, centre au milieu) apparaissent sous le bouton, dans la
 * colonne. La molette zoome et le clic droit déplace comme d'habitude ; Échap finit.
 * Les calculs sont dans viewport/orbit-math.ts.
 */
import * as THREE from "three";
import type { Vec3 } from "../sketcher/frame";
import { cameraState, setCameraState } from "../viewport/camera-rig";
import { constrainedTurn, freeTurn, ringPart, rollTurn, screenAngle, type RingPart } from "../viewport/orbit-math";
import type { Viewport } from "../viewport/viewport";

export type OrbitMode = "free" | "constrained";

const KEY = "cao.orbit-mode";
/** Most a pointer may move (pixels) and still make a click: the click sets the centre. */
const CLICK_PX = 5;
const SVG = "http://www.w3.org/2000/svg";
const CURSORS: Record<RingPart, string> = { inside: "grab", outside: "alias", left: "ew-resize", right: "ew-resize", top: "ns-resize", bottom: "ns-resize" };

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  start: [number, number];
  part: RingPart;
  /** The centre of this drag: the one set, or the point under the pointer (Maj + clic milieu). */
  pivot: Vec3;
  /** Started with the left button while the tool is on (a click then sets the centre). */
  tool: boolean;
}

export function bindOrbit(root: HTMLElement, viewport: Viewport, notify: (message: string) => void): void {
  const canvas = viewport.renderer.domElement;
  const container = canvas.parentElement!;
  const button = root.querySelector<HTMLButtonElement>("[data-orbit]");
  let mode: OrbitMode = "constrained";
  try {
    if (localStorage.getItem(KEY) === "free") mode = "free";
  } catch {
    // No storage: constrained.
  }
  let active = false;
  /** Set by a click on the model; null: the middle of the view (what the camera looks at). */
  let pivot: Vec3 | null = null;
  let drag: Drag | null = null;

  // The ring of the free orbit, its four handles, and the green dot of the centre.
  const ring = document.createElementNS(SVG, "svg");
  ring.setAttribute("class", "pointer-events-none absolute inset-0 z-10 hidden size-full text-gray-500 dark:text-gray-400");
  ring.innerHTML = `<circle fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.8"/>${'<circle r="7" fill="white" stroke="currentColor" stroke-width="1.5"/>'.repeat(4)}`;
  ring.dataset.orbitRing = "";
  const dot = document.createElement("div");
  dot.className = "pointer-events-none absolute z-10 hidden size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500 shadow";
  dot.title = "Centre d'orbite";
  // Libre, contrainte, centre au milieu: under the Orbite button, in the column beside the view (shown while it is on).
  const options = root.querySelector<HTMLElement>("[data-orbit-options]");
  container.append(ring, dot);

  const rect = () => canvas.getBoundingClientRect();
  /** The ring: in the middle of the view, a bit smaller than its shorter side. */
  const ringOf = () => {
    const r = rect();
    return { cx: r.width / 2, cy: r.height / 2, r: Math.min(r.width, r.height) * 0.38 };
  };
  const local = (event: PointerEvent): [number, number] => {
    const r = rect();
    return [event.clientX - r.left, event.clientY - r.top];
  };
  const centre = (): Vec3 => pivot ?? cameraState(viewport.rig).target;

  const show = () => {
    button?.setAttribute("aria-pressed", String(active));
    options?.classList.toggle("hidden", !active);
    options?.classList.toggle("flex", active);
    for (const b of options?.querySelectorAll<HTMLButtonElement>("[data-orbit-mode]") ?? []) b.setAttribute("aria-pressed", String(b.dataset.orbitMode === mode));
    if (!active) canvas.style.cursor = "";
  };
  const setActive = (on: boolean) => {
    active = on && viewport.rig.controls.enableRotate;
    if (!active) pivot = null;
    show();
  };
  const setMode = (value: OrbitMode) => {
    mode = value;
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Kept for this page only.
    }
    show();
  };

  // Each frame: the ring follows the view's size, the dot follows its point; sketch mode turns the tool off.
  viewport.onEachFrame(() => {
    if (active && !viewport.rig.controls.enableRotate) setActive(false);
    const { cx, cy, r } = ringOf();
    ring.classList.toggle("hidden", !(active && mode === "free"));
    if (active && mode === "free") {
      const [circle, ...handles] = Array.from(ring.children);
      circle!.setAttribute("cx", String(cx));
      circle!.setAttribute("cy", String(cy));
      circle!.setAttribute("r", String(r));
      [[cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]].forEach(([x, y], i) => (handles[i]!.setAttribute("cx", String(x)), handles[i]!.setAttribute("cy", String(y))));
    }
    const at = active || drag ? (drag?.pivot ?? centre()) : null;
    const p = at ? new THREE.Vector3(...at).project(viewport.camera) : null;
    const seen = p && p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
    dot.classList.toggle("hidden", !seen);
    if (p && seen) {
      const { width, height } = rect();
      dot.style.left = `${((p.x + 1) / 2) * width}px`;
      dot.style.top = `${((1 - p.y) / 2) * height}px`;
    }
  });

  const stop = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
  };

  // Window, capture phase: before the view's own gestures (tools, selection window, the camera's controls).
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target !== canvas || drag || !viewport.rig.controls.enableRotate) return;
      const tool = active && event.button === 0;
      const shortcut = event.button === 1 && event.shiftKey;
      if (!tool && !shortcut) return;
      stop(event);
      canvas.setPointerCapture(event.pointerId);
      const [x, y] = local(event);
      const { cx, cy, r } = ringOf();
      // Maj + clic milieu: about the point of the model under the pointer, else the centre set.
      const hit = shortcut ? viewport.pickFace(event) : null;
      const around: Vec3 = hit ? [hit.point.x, hit.point.y, hit.point.z] : centre();
      drag = { pointerId: event.pointerId, x, y, start: [x, y], part: mode === "free" ? ringPart(x, y, cx, cy, r) : "inside", pivot: around, tool };
      canvas.style.cursor = "grabbing";
    },
    { capture: true },
  );
  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.target !== canvas) return;
      if (!drag) {
        if (!active) return;
        // Over the view the tool keeps the pointer: no tool hover or pre-selection meanwhile.
        event.stopPropagation();
        const [x, y] = local(event);
        const { cx, cy, r } = ringOf();
        canvas.style.cursor = CURSORS[mode === "free" ? ringPart(x, y, cx, cy, r) : "inside"];
        return;
      }
      if (event.pointerId !== drag.pointerId) return;
      stop(event);
      const [x, y] = local(event);
      const [dx, dy] = [x - drag.x, y - drag.y];
      const view = cameraState(viewport.rig);
      const { cx, cy, r } = ringOf();
      let next = view;
      if (mode === "constrained") {
        const k = (2 * Math.PI) / Math.max(rect().height, 1);
        next = constrainedTurn(view, drag.pivot, -dx * k, dy * k);
      } else {
        // Across the whole ring: half a turn.
        const k = Math.PI / (2 * Math.max(r, 1));
        const part = drag.part;
        if (part === "outside") next = rollTurn(view, drag.pivot, screenAngle(drag.x, drag.y, x, y, cx, cy));
        else next = freeTurn(view, drag.pivot, part === "top" || part === "bottom" ? 0 : dx * k, part === "left" || part === "right" ? 0 : dy * k);
      }
      setCameraState(viewport.rig, next);
      [drag.x, drag.y] = [x, y];
    },
    { capture: true },
  );
  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    stop(event);
    const done = drag;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.style.cursor = active ? "grab" : "";
    const [x, y] = local(event);
    if (event.type !== "pointerup" || !done.tool || Math.hypot(x - done.start[0], y - done.start[1]) > CLICK_PX) return;
    // A click: the point of the model there becomes the centre.
    const hit = viewport.pickFace(event);
    if (!hit) return notify("Cliquez un point du modèle pour en faire le centre d'orbite.");
    pivot = [hit.point.x, hit.point.y, hit.point.z];
    notify("Centre d'orbite placé sur le point cliqué.");
  };
  window.addEventListener("pointerup", end, { capture: true });
  window.addEventListener("pointercancel", end, { capture: true });
  // The middle button must not open the browser's scrolling.
  window.addEventListener("auxclick", (event) => event.target === canvas && event.button === 1 && event.preventDefault(), { capture: true });
  window.addEventListener(
    "keydown",
    (event) => {
      if (!active || event.key !== "Escape") return;
      // Échap ends the orbit only: the tool open and the selection stay.
      event.stopImmediatePropagation();
      setActive(false);
    },
    { capture: true },
  );

  button?.addEventListener("click", () => {
    setActive(!active);
    if (active) notify("Orbite : glissez pour tourner, cliquez le modèle pour y mettre le centre ; Échap pour finir.");
  });
  options?.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!target) return;
    if (target.dataset.orbitMode) setMode(target.dataset.orbitMode as OrbitMode);
    else if (target.hasAttribute("data-orbit-center")) {
      pivot = null;
      notify("Centre d'orbite au milieu de la vue.");
    }
  });
  show();
}
