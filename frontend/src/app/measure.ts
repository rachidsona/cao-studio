/**
 * "Mètre et guides" (as SketchUp's tape measure): click a point, then a second
 * one — the distance appears (and ΔX, ΔY, ΔZ); in guide mode the second click
 * lays a dashed guide line in the document instead. Points snap to the corners
 * and edges of the bodies and to the ends of the guides. Measures stay in the
 * view until cleared (nothing saved); guides are saved with the document and
 * drawn all the time.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DisplayUnit, Guide, Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { aimAt, captureTargets, type LevelTargets } from "./face-strip-view";
import { floatingPanel } from "./workshop-ui";

const BUTTON = "h-8 shrink-0 rounded-md border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const SNAP_PIXELS = 12;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** "1 234 mm (ΔX 1 200 · ΔY 0 · ΔZ 300)", the deltas left out when the line follows one axis. */
export function measureText(a: Vec3, b: Vec3, unit: DisplayUnit): string {
  const d = [0, 1, 2].map((i) => Math.abs((b[i] as number) - (a[i] as number)));
  const axes = d.filter((x) => x > 1e-6).length;
  const total = formatLength(distance(a, b), unit);
  return axes <= 1 ? total : `${total} (ΔX ${formatLength(d[0] as number, unit)} · ΔY ${formatLength(d[1] as number, unit)} · ΔZ ${formatLength(d[2] as number, unit)})`;
}

/** The corners and edges to snap to: those of the bodies and the guides' ends and lines. */
export function snapTargets(viewport: Viewport, guides: Guide[]): LevelTargets {
  const targets = captureTargets(viewport);
  for (const g of guides) {
    targets.corners.push(g.from, g.to);
    targets.segments.push([g.from, g.to]);
  }
  return targets;
}

/** Lines and labels drawn in the scene (measures, guides, the line being laid). */
export class Marks {
  private readonly group = new THREE.Group();

  constructor(private readonly scene: THREE.Scene) {
    this.group.renderOrder = 45;
    scene.add(this.group);
  }

  line(a: Vec3, b: Vec3, color: number, dashed: boolean): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    const material = dashed ? new THREE.LineDashedMaterial({ color, depthTest: false, dashSize: 8, gapSize: 5 }) : new THREE.LineBasicMaterial({ color, depthTest: false });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 45;
    this.group.add(line);
  }

  dot(at: Vec3, color: number): void {
    const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...at)]), new THREE.PointsMaterial({ color, size: 11, sizeAttenuation: false, depthTest: false }));
    dot.renderOrder = 47;
    this.group.add(dot);
  }

  label(at: Vec3, text: string): void {
    const span = document.createElement("span");
    span.className = "cad-measure";
    span.textContent = text;
    const label = new CSS2DObject(span);
    label.position.set(...at);
    this.group.add(label);
  }

  clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      else if (child instanceof THREE.Line || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }
}

export function bindMeasure(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="measure"]');
  const container = viewport.renderer.domElement.parentElement as HTMLElement;
  const guideMarks = new Marks(viewport.scene);
  const liveMarks = new Marks(viewport.scene);
  const measures: [Vec3, Vec3][] = [];
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let active: PointerHandler | null = null;
  let mode: "measure" | "guide" = "measure";
  let first: Vec3 | null = null;
  let targets: LevelTargets | null = null;
  let last = "";

  const guides = () => editor.doc.guides ?? [];

  const drawGuides = (): void => {
    guideMarks.clear();
    for (const g of guides()) {
      guideMarks.line(g.from, g.to, 0x06b6d4, true);
      guideMarks.dot(g.from, 0x06b6d4);
      guideMarks.dot(g.to, 0x06b6d4);
    }
  };

  const drawLive = (cursor: Vec3 | null): void => {
    liveMarks.clear();
    for (const [a, b] of measures) {
      liveMarks.line(a, b, 0xf97316, false);
      liveMarks.label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], measureText(a, b, editor.unit));
    }
    if (first) {
      liveMarks.dot(first, 0xf97316);
      if (cursor) {
        liveMarks.line(first, cursor, mode === "guide" ? 0x06b6d4 : 0xdc2626, mode === "guide");
        liveMarks.label([(first[0] + cursor[0]) / 2, (first[1] + cursor[1]) / 2, (first[2] + cursor[2]) / 2], measureText(first, cursor, editor.unit));
      }
    }
  };

  /** The point under the pointer: a corner, an edge or a guide within a few pixels, else the surface. */
  const pointAt = (event: PointerEvent): Vec3 | null => {
    targets ??= snapTargets(viewport, guides());
    const snapped = aimAt(viewport, event, SNAP_PIXELS, targets);
    if (snapped) return snapped;
    const face = viewport.pickFace(event);
    return face ? [face.point.x, face.point.y, face.point.z] : null;
  };

  const render = (): void => {
    if (!panel) return;
    const modes = (["measure", "guide"] as const).map((m) => {
      const b = el("button", { type: "button", class: `${BUTTON} flex-1 ${mode === m ? "bg-sky-600 text-white hover:bg-sky-700" : ""}`, "aria-pressed": String(mode === m) }, m === "measure" ? "Mesurer" : "Guide");
      b.addEventListener("click", () => {
        mode = m;
        first = null;
        drawLive(null);
        render();
      });
      return b;
    });
    const clear = el("button", { type: "button", class: BUTTON }, "Effacer les mesures");
    clear.addEventListener("click", () => {
      measures.length = 0;
      first = null;
      last = "";
      drawLive(null);
      render();
    });
    const list = guides().map((g, i) => {
      const remove = el("button", { type: "button", class: `${BUTTON} w-8`, "aria-label": `Supprimer le guide ${i + 1}` }, "✕");
      remove.addEventListener("click", () => void editor.change({ ...editor.doc, guides: guides().filter((_, k) => k !== i) }));
      return el("div", { class: "grid grid-cols-[1fr_auto] items-center gap-1" }, el("span", {}, `Guide ${i + 1} : ${formatLength(distance(g.from, g.to), editor.unit)}`), remove);
    });
    const rows: (HTMLElement | null)[] = [
      el("div", { class: "flex gap-1" }, ...modes),
      el("p", { class: "text-gray-600 dark:text-gray-300" }, first ? "Cliquez le second point (Échap : annuler)." : mode === "guide" ? "Cliquez deux points : une ligne de guide est posée." : "Cliquez deux points pour mesurer."),
      last ? el("p", { class: "font-mono" }, last) : null,
      ...list,
      measures.length ? clear : null,
      el("p", { class: "text-[11px] text-gray-500" }, "Les points s'accrochent aux coins, arêtes et guides. Les guides sont enregistrés ; les mesures disparaissent quand on quitte."),
    ];
    panel.body.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  };

  const stop = (): void => {
    if (active) viewport.setPointerHandler(null);
    active = null;
    first = null;
    targets = null;
    window.removeEventListener("keydown", onKey, true);
    liveMarks.clear();
    measures.length = 0;
    panel?.close();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    if (first) {
      first = null;
      drawLive(null);
      render();
    } else stop();
  };

  const handler: PointerHandler = {
    down: () => false,
    move: (event) => {
      if (first) drawLive(pointAt(event));
    },
    up: (event, isClick) => {
      if (!isClick) return false;
      const p = pointAt(event);
      if (!p) return true;
      if (!first) first = p;
      else if (distance(first, p) > 1e-6) {
        if (mode === "guide") void editor.change({ ...editor.doc, guides: [...guides(), { from: first, to: p }] });
        else {
          measures.push([first, p]);
          last = measureText(first, p, editor.unit);
        }
        first = null;
        targets = null;
      }
      drawLive(null);
      render();
      return true;
    },
  };

  const start = (): void => {
    if (panel) return stop();
    panel = floatingPanel(container, "Mètre et guides", () => {
      panel = null;
      button?.setAttribute("aria-pressed", "false");
      if (active) stop();
    });
    button?.setAttribute("aria-pressed", "true");
    active = handler;
    viewport.setPointerHandler(handler);
    window.addEventListener("keydown", onKey, true);
    render();
  };

  button?.addEventListener("click", start);
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    targets = null;
    drawGuides();
    render();
  };
  drawGuides();
}
