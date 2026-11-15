/**
 * « Visite à pied » : se promener dans la pièce à hauteur d'yeux (viewport/walk.ts). On regarde en glissant la souris
 * (ou le doigt), on marche avec les flèches ou Z Q S D (W A S D sur un clavier QWERTY : la touche à la même place), Maj
 * pour aller plus vite, le petit joystick en bas de la vue sur une tablette ; la molette monte ou baisse les yeux. Un
 * clic sur une porte ou un tiroir l'ouvre ou le ferme, un clic au sol y emmène. Les murs et les meubles arrêtent le
 * visiteur. Échap ou « Terminer » rendent la vue d'avant. Le modèle ne change pas.
 */
import { bodyInfo } from "../document/materials";
import { fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { panelFooter, panelHeader } from "../ui/panel-close";
import type { CameraState } from "../viewport/camera-rig";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";
import { atHeight, EYE, eyePoint, lookDirection, obstacles, placedAt, startWalker, turned, walked, type Box, type Walker } from "../viewport/walk";
import type { Editor } from "./editor";

/** A wider view than the modelling one, as the eye sees a room. */
const FOV = 65;
/** A press that moves more than this is a look around, not a click (px). */
const CLICK = 5;

const unionBox = (boxes: Box[]): Box | null =>
  boxes.length ? [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))), [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!)))] as Box : null;

class WalkTool implements PointerHandler {
  private walker: Walker;
  private readonly saved: CameraState;
  private readonly savedFov: number;
  private readonly boxes: Box[];
  private readonly keys = new Set<string>();
  private joystick = { forward: 0, side: 0 };
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private last = performance.now();
  private readonly stopFrame: () => void;
  private readonly panel: HTMLElement;
  private readonly pad: HTMLElement;
  private readonly heightField: HTMLInputElement;

  constructor(
    private readonly viewport: Viewport,
    private readonly editor: Editor,
    private readonly closed: () => void,
  ) {
    const doc = editor.doc;
    const shown = viewport.displayedBodies.map((id) => ({ id, mesh: viewport.bodyMesh(id) })).filter((b) => b.mesh);
    const box = (b: (typeof shown)[number]): Box => [[...b.mesh!.metrics.bbox[0]] as [number, number, number], [...b.mesh!.metrics.bbox[1]] as [number, number, number]];
    // The room: the bodies of the room that rise like walls; the model: the rest.
    const walls = shown.filter((b) => bodyInfo(doc, b.id).room && b.mesh!.metrics.bbox[1][2] - b.mesh!.metrics.bbox[0][2] >= 1800);
    const rest = shown.filter((b) => !bodyInfo(doc, b.id).room);
    this.walker = startWalker(unionBox(rest.map(box)), unionBox(walls.map(box)));
    this.boxes = shown.map(box);
    this.saved = viewport.cameraState();
    this.savedFov = viewport.camera.fov;
    viewport.camera.fov = FOV;
    viewport.camera.updateProjectionMatrix();
    viewport.rig.controls.enabled = false;
    viewport.setPointerHandler(this);
    this.stopFrame = viewport.onEachFrame(this.frame);
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("blur", this.onBlur);
    viewport.renderer.domElement.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
    viewport.renderer.domElement.style.cursor = "grab";
    // The joystick, for a finger (a mouse may use it too).
    const knob = el("div", { class: "absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600/80 shadow" });
    this.pad = el("div", { class: "absolute bottom-4 left-4 z-30 size-28 touch-none rounded-full border-2 border-white/60 bg-black/25 select-none", "data-walk-pad": "", "aria-label": "Marcher (joystick)", role: "application" }, knob);
    this.bindPad(knob);
    viewport.renderer.domElement.parentElement?.append(this.pad);
    // The panel: what does what, the height of the eyes, Terminer.
    const unit = editor.unit;
    this.heightField = el("input", { type: "text", inputmode: "decimal", class: "h-8 w-full border border-gray-300 bg-white px-2 text-right font-mono text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Hauteur des yeux" });
    this.heightField.addEventListener("change", () => {
      const v = parseNumber(this.heightField.value);
      if (v !== null && v > 0) this.walker = atHeight(this.walker, fromDisplay(v, unit));
      this.showHeight();
    });
    this.heightField.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") this.heightField.blur();
    });
    this.panel = el(
      "div",
      { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Visite à pied" },
      panelHeader("Visite à pied", () => this.close()),
      el("ul", { class: "list-disc space-y-0.5 pl-4 text-gray-600 dark:text-gray-300" },
        el("li", {}, "Glissez dans la vue pour regarder autour de vous."),
        el("li", {}, "Flèches ou Z Q S D pour marcher, Maj pour aller plus vite ; sur une tablette, le joystick en bas à gauche."),
        el("li", {}, "Molette : yeux plus haut ou plus bas."),
        el("li", {}, "Un clic sur une porte, un tiroir ou un accessoire l'ouvre ; un clic au sol vous y emmène."),
        el("li", {}, "Échap ou « Terminer » : retour à la vue d'avant."),
      ),
      el("label", { class: "grid grid-cols-[7rem_1fr] items-center gap-1.5" }, `Hauteur des yeux (${UNIT_LABELS[unit]})`, this.heightField),
      el("p", { class: "text-[11px] text-gray-500" }, `De ${trim(toDisplay(EYE.low, unit), 2)} à ${trim(toDisplay(EYE.high, unit), 2)} ${UNIT_LABELS[unit]}. Les murs et les meubles vous arrêtent ; le modèle ne change pas.`),
      panelFooter(() => this.close(), null),
    );
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    this.showHeight();
    this.place();
    document.body.dataset.walking = "";
  }

  /** Where the visitor is, for the tests and the panel. */
  get state(): Walker {
    return this.walker;
  }

  private showHeight(): void {
    if (document.activeElement !== this.heightField) this.heightField.value = trim(toDisplay(this.walker.eye, this.editor.unit), 3);
    this.pad.dataset.eye = String(Math.round(this.walker.eye));
  }

  /** The camera at the eyes, looking where the visitor looks. */
  private place(): void {
    const eye = eyePoint(this.walker);
    const dir = lookDirection(this.walker);
    const { camera, controls } = this.viewport.rig;
    camera.position.set(...eye);
    // The target a metre ahead keeps the near plane close (the viewport sets it from that distance).
    controls.target.set(eye[0] + dir[0] * 1000, eye[1] + dir[1] * 1000, eye[2] + dir[2] * 1000);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    this.viewport.invalidate();
    const at = this.pad.dataset;
    at.x = String(Math.round(this.walker.x));
    at.y = String(Math.round(this.walker.y));
    at.yaw = String(Math.round((this.walker.yaw * 180) / Math.PI));
  }

  private readonly frame = (): void => {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const forward = (has("ArrowUp", "KeyW") ? 1 : 0) - (has("ArrowDown", "KeyS") ? 1 : 0) + this.joystick.forward;
    const side = (has("ArrowRight", "KeyD") ? 1 : 0) - (has("ArrowLeft", "KeyA") ? 1 : 0) + this.joystick.side;
    const before = this.walker;
    this.walker = walked(this.walker, { forward, side, run: has("ShiftLeft", "ShiftRight") }, dt, obstacles(this.boxes, this.walker.floor, this.walker.eye));
    // Every frame: the orbit of the view must not take the camera back.
    this.place();
    if (before !== this.walker) this.showHeight();
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return this.close();
    }
    // By the place of the key (event.code): Z Q S D on an AZERTY keyboard are W A S D on a QWERTY one.
    if (/^(Arrow(Up|Down|Left|Right)|Key[WASD]|Shift(Left|Right))$/.test(event.code) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.keys.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => this.keys.clear();

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.walker = atHeight(this.walker, this.walker.eye - Math.sign(event.deltaY) * 50);
    this.showHeight();
  };

  private bindPad(knob: HTMLElement): void {
    let held: number | null = null;
    const set = (event: PointerEvent) => {
      const r = this.pad.getBoundingClientRect();
      const [cx, cy, radius] = [r.left + r.width / 2, r.top + r.height / 2, r.width / 2];
      let [dx, dy] = [(event.clientX - cx) / radius, (event.clientY - cy) / radius];
      const length = Math.hypot(dx, dy);
      if (length > 1) [dx, dy] = [dx / length, dy / length];
      this.joystick = { forward: -dy, side: dx };
      knob.style.transform = `translate(calc(-50% + ${dx * radius * 0.6}px), calc(-50% + ${dy * radius * 0.6}px))`;
    };
    const release = () => {
      held = null;
      this.joystick = { forward: 0, side: 0 };
      knob.style.transform = "";
    };
    this.pad.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      held = event.pointerId;
      this.pad.setPointerCapture(event.pointerId);
      set(event);
    });
    this.pad.addEventListener("pointermove", (event) => event.pointerId === held && set(event));
    this.pad.addEventListener("pointerup", release);
    this.pad.addEventListener("pointercancel", release);
  }

  // ---- the view: look around, click a door or the floor ------------------------------------

  down(event: PointerEvent): boolean {
    if (event.button !== 0) return false;
    this.drag = { x: event.clientX, y: event.clientY, moved: false };
    this.viewport.renderer.domElement.style.cursor = "grabbing";
    return true;
  }

  move(event: PointerEvent): void {
    if (!this.drag) return;
    const [dx, dy] = [event.clientX - this.drag.x, event.clientY - this.drag.y];
    if (!this.drag.moved && Math.hypot(dx, dy) <= CLICK) return;
    this.drag.moved = true;
    this.walker = turned(this.walker, dx, dy);
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
  }

  up(event: PointerEvent): boolean {
    const drag = this.drag;
    this.drag = null;
    this.viewport.renderer.domElement.style.cursor = "grab";
    if (!drag || drag.moved) return true;
    // A door or a drawer clicked: opened or closed, as in the view (app/drawer-toggle.ts).
    const face = this.viewport.pickFace(event);
    if (face && !bodyInfo(this.editor.doc, face.bodyId).room) {
      document.dispatchEvent(new CustomEvent("cad:toggle-door", { detail: face.bodyId }));
      return true;
    }
    // The floor clicked (or the foot of a wall): the visitor goes there.
    const { origin, direction } = this.viewport.rayFromEvent(event);
    if (direction[2] < -1e-6) {
      const t = (this.walker.floor - origin[2]) / direction[2];
      const placed = placedAt(this.walker, origin[0] + direction[0] * t, origin[1] + direction[1] * t, obstacles(this.boxes, this.walker.floor, this.walker.eye));
      if (placed) this.walker = placed;
      else this.editor.notify("Quelque chose se trouve là : cliquez un endroit libre du sol.", "info");
    }
    return true;
  }

  cancel(): void {
    this.drag = null;
  }

  close(): void {
    this.stopFrame();
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onBlur);
    this.viewport.renderer.domElement.removeEventListener("wheel", this.onWheel, { capture: true });
    this.viewport.renderer.domElement.style.cursor = "";
    this.viewport.setPointerHandler(null);
    const { camera, controls } = this.viewport.rig;
    camera.fov = this.savedFov;
    camera.updateProjectionMatrix();
    controls.enabled = true;
    this.viewport.setCameraState(this.saved);
    this.viewport.invalidate();
    this.panel.remove();
    this.pad.remove();
    delete document.body.dataset.walking;
    this.closed();
  }
}

let tool: WalkTool | null = null;

export function openWalk(viewport: Viewport, editor: Editor): void {
  if (tool) return;
  editor.sketches.cancelJoinery();
  tool = new WalkTool(viewport, editor, () => (tool = null));
}

export function bindWalk(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="walk"]')?.addEventListener("click", () => (tool ? tool.close() : openWalk(viewport, editor)));
}
