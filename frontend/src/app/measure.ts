/**
 * "Mètre et guides" (as SketchUp's tape measure): click a point, then a second
 * one — the distance appears (and ΔX, ΔY, ΔZ). Or measure between two edges,
 * two faces or two bodies: the shortest distance between them, drawn between
 * their closest points, with the angle of two flat faces or straight edges
 * (measure-shapes.ts, measurements/closest.ts). In guide mode the second click
 * lays a dashed guide line in the document instead. Points snap to the corners
 * and edges of the bodies and to the ends of the guides (with the geometry snapping of the sketch buttons), and to
 * the alignments with the corners and the first point (smart snapping: pink dashed guides). Measures stay in the
 * view until cleared (nothing saved); guides are saved with the document and
 * drawn all the time. A measure between two bodies or two faces opens « Espacement » on them (app/spacing-tool.ts):
 * the space typed moves one of them.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { DisplayUnit, Guide, Vec3 } from "../document/types";
import { angleBetween, closestBetween } from "../measurements/closest";
import { formatLength } from "../measurements/units";
import { bodyLabel } from "../document/operations";
import { el } from "../ui/dom";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { SnapGuides } from "../viewport/snap-guides";
import { bodySnap, facePoint } from "./body-snap";
import { aimAt, captureTargets, type LevelTargets } from "./face-strip-view";
import { bodyPicked, edgePicked, facePicked, type Picked } from "./measure-shapes";
import { floatingPanel } from "./workshop/workshop-ui";

/** What two clicks measure between. */
type Target = "point" | "edge" | "face" | "body";
const TARGETS: [Target, string, string][] = [
  ["point", "Points", "i-filter-vertex"],
  ["edge", "Traits", "i-filter-edge"],
  ["face", "Faces", "i-filter-face"],
  ["body", "Corps", "i-filter-body"],
];
const TARGET_NAMES: Record<Exclude<Target, "point">, [string, string]> = { edge: ["le premier trait", "le second trait"], face: ["la première face", "la seconde face"], body: ["le premier corps", "le second corps"] };

const BUTTON = "h-8 shrink-0 border border-gray-300 px-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const SNAP_PIXELS = 12;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** "1 234 mm (ΔX 1 200 · ΔY 0 · ΔZ 300)", the deltas left out when the line follows one axis. */
export function measureText(a: Vec3, b: Vec3, unit: DisplayUnit): string {
  const d = [0, 1, 2].map((i) => Math.abs((b[i] as number) - (a[i] as number)));
  const axes = d.filter((x) => x > 1e-6).length;
  const total = formatLength(distance(a, b), unit);
  return axes <= 1 ? total : `${total} (ΔX ${formatLength(d[0] as number, unit)} · ΔY ${formatLength(d[1] as number, unit)} · ΔZ ${formatLength(d[2] as number, unit)})`;
}

/** Angle at `apex` between the arms towards `a` and `b`, in degrees ("37,5°"). */
export function angleText(apex: Vec3, a: Vec3, b: Vec3): string {
  const u = [0, 1, 2].map((i) => (a[i] as number) - (apex[i] as number));
  const v = [0, 1, 2].map((i) => (b[i] as number) - (apex[i] as number));
  const cos = (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / ((Math.hypot(...u) || 1) * (Math.hypot(...v) || 1));
  const degrees = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  return `${degrees.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}°`;
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

let crossMap: THREE.CanvasTexture | null = null;
/** A white cross on a transparent square, tinted by the material's colour (made once, shared). */
function crossTexture(): THREE.CanvasTexture {
  if (crossMap) return crossMap;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.strokeStyle = "#fff";
  g.lineWidth = 9;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(10, 10);
  g.lineTo(54, 54);
  g.moveTo(54, 10);
  g.lineTo(10, 54);
  g.stroke();
  crossMap = new THREE.CanvasTexture(canvas);
  return crossMap;
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
    // Transparent, so they are drawn after the bodies (which are see-through in some looks) and stay on top.
    const material = dashed ? new THREE.LineDashedMaterial({ color, depthTest: false, transparent: true, dashSize: 8, gapSize: 5 }) : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    const line = new THREE.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 45;
    this.group.add(line);
  }

  dot(at: Vec3, color: number): void {
    const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...at)]), new THREE.PointsMaterial({ color, size: 11, sizeAttenuation: false, depthTest: false, transparent: true }));
    dot.renderOrder = 47;
    this.group.add(dot);
  }

  /** A cross (×) of constant size on screen, to mark a point that can be snapped to. */
  cross(at: Vec3, color: number, size = 14): void {
    const material = new THREE.PointsMaterial({ color, size, map: crossTexture(), alphaTest: 0.2, sizeAttenuation: false, depthTest: false, transparent: true });
    const cross = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...at)]), material);
    cross.renderOrder = 48;
    this.group.add(cross);
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
  const smartGuides = new SnapGuides(viewport.scene);
  const measures: [Vec3, Vec3][] = [];
  /** Protractor: angles measured (apex, first arm, second arm). */
  const angles: [Vec3, Vec3, Vec3][] = [];
  let second: Vec3 | null = null;
  let panel: { body: HTMLElement; close: () => void } | null = null;
  let active: PointerHandler | null = null;
  let mode: "measure" | "guide" | "angle" = "measure";
  let first: Vec3 | null = null;
  let targets: LevelTargets | null = null;
  let last = "";
  let target: Target = "point";
  /** The edge, face or body picked first, and the one under the pointer (edges are drawn while hovered). */
  let firstPick: (Picked & { name: string; bodyId: string }) | null = null;
  /** The two bodies of the last measure between bodies or faces: « Changer cet espace » opens Espacement on them. */
  let lastPair: [string, string] | null = null;
  let hovered: Picked | null = null;

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
    if (hovered && hovered !== firstPick) for (const [a, b] of hovered.outline) liveMarks.line(a, b, 0xfdba74, false);
    if (firstPick) for (const [a, b] of firstPick.outline) liveMarks.line(a, b, 0xf97316, false);
    for (const [a, b] of measures) {
      liveMarks.line(a, b, 0xf97316, false);
      liveMarks.label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], measureText(a, b, editor.unit));
    }
    for (const [o, a, b] of angles) {
      liveMarks.line(o, a, 0x8b5cf6, false);
      liveMarks.line(o, b, 0x8b5cf6, false);
      liveMarks.label(o, angleText(o, a, b));
    }
    if (first && mode === "angle") {
      liveMarks.dot(first, 0x8b5cf6);
      if (second) liveMarks.line(first, second, 0x8b5cf6, false);
      if (cursor) {
        liveMarks.line(first, cursor, 0x8b5cf6, true);
        if (second) liveMarks.label(first, angleText(first, second, cursor));
      }
    } else if (first) {
      liveMarks.dot(first, 0xf97316);
      if (cursor) {
        liveMarks.line(first, cursor, mode === "guide" ? 0x06b6d4 : 0xdc2626, mode === "guide");
        liveMarks.label([(first[0] + cursor[0]) / 2, (first[1] + cursor[1]) / 2, (first[2] + cursor[2]) / 2], measureText(first, cursor, editor.unit));
      }
    }
  };

  /**
   * The point under the pointer: a corner, an edge or a guide within a few pixels (geometry snapping), else the
   * surface — in line with a corner or the first point when the smart snapping finds one.
   */
  const pointAt = (event: PointerEvent): Vec3 | null => {
    targets ??= snapTargets(viewport, guides());
    const snapped = bodySnap.geometry ? aimAt(viewport, event, SNAP_PIXELS, targets) : null;
    const face = snapped ? null : facePoint(viewport, event, { anchors: first ? [first] : [] });
    smartGuides.show(face?.guides ?? [], viewport);
    return snapped ?? face?.point ?? null;
  };

  /** The edge, face or body under the pointer, for the measure between elements. */
  const pickAt = (event: PointerEvent): (Picked & { name: string; bodyId: string }) | null => {
    if (target === "edge") {
      const edge = viewport.pickEdge(event);
      const mesh = edge && viewport.bodyMesh(edge.bodyId);
      const picked = mesh && edge ? edgePicked(mesh, edge.edgeIndex) : null;
      return picked && edge ? { ...picked, name: `arête de ${bodyLabel(editor.doc, edge.bodyId)}`, bodyId: edge.bodyId } : null;
    }
    const face = viewport.pickFace(event);
    const mesh = face && viewport.bodyMesh(face.bodyId);
    if (!face || !mesh) return null;
    if (target === "body") return { ...bodyPicked(mesh), name: bodyLabel(editor.doc, face.bodyId), bodyId: face.bodyId };
    const picked = facePicked(mesh, face.faceIndex);
    return picked ? { ...picked, name: `face de ${bodyLabel(editor.doc, face.bodyId)}`, bodyId: face.bodyId } : null;
  };

  /** The shortest distance between the two elements, and how they stand to each other. */
  const measureBetween = (a: Picked & { name: string; bodyId: string }, b: Picked & { name: string; bodyId: string }): void => {
    const near = closestBetween(a.shape, b.shape);
    lastPair = target !== "edge" && a.bodyId !== b.bodyId ? [a.bodyId, b.bodyId] : null;
    measures.push([near.from, near.to]);
    const parts = [near.distance === 0 ? "0 (en contact)" : measureText(near.from, near.to, editor.unit)];
    if (a.direction && b.direction) {
      const angle = angleBetween(a.direction, b.direction);
      const what = target === "face" ? "faces" : "traits";
      parts.push(angle < 0.01 ? `${what} parallèles` : angle > 89.99 ? `${what} perpendiculaires` : `angle ${angle.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}°`);
    }
    last = `${a.name} → ${b.name} : ${parts.join(" · ")}`;
  };

  const resetPick = (): void => {
    firstPick = null;
    hovered = null;
    viewport.setHoverHighlight(null);
  };

  const render = (): void => {
    if (!panel) return;
    const modes = (["measure", "guide", "angle"] as const).map((m) => {
      const b = el("button", { type: "button", class: `${BUTTON} flex-1 ${mode === m ? "btn-accent" : ""}`, "aria-pressed": String(mode === m) }, m === "measure" ? "Mesurer" : m === "guide" ? "Guide" : "Angle");
      b.addEventListener("click", () => {
        mode = m;
        first = null;
        second = null;
        resetPick();
        drawLive(null);
        render();
      });
      return b;
    });
    const between = TARGETS.map(([t, name, icon]) => {
      const b = el("button", { type: "button", class: `flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 border border-gray-300 text-2xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800 ${target === t ? "border-sky-600 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : ""}`, "aria-pressed": String(target === t), title: `Mesurer entre deux ${name.toLowerCase()}` });
      b.innerHTML = `<svg class="size-6 shrink-0" aria-hidden="true"><use href="#${icon}"/></svg><span>${name}</span>`;
      b.addEventListener("click", () => {
        target = t;
        first = null;
        resetPick();
        drawLive(null);
        render();
      });
      return b;
    });
    const asked = target === "point" ? null : TARGET_NAMES[target];
    const clear = el("button", { type: "button", class: BUTTON }, "Effacer les mesures");
    clear.addEventListener("click", () => {
      measures.length = 0;
      angles.length = 0;
      first = null;
      last = "";
      lastPair = null;
      drawLive(null);
      render();
    });
    const spacing = el("button", { type: "button", class: `${BUTTON} btn-accent` }, "Changer cet espace…");
    spacing.addEventListener("click", () => {
      const pair = lastPair;
      if (!pair) return;
      stop();
      viewport.selectLevel({ bodies: pair }, false);
      root.querySelector<HTMLButtonElement>('[data-action="spacing"]')?.click();
    });
    const list = guides().map((g, i) => {
      const remove = el("button", { type: "button", class: `${BUTTON} w-8`, "aria-label": `Supprimer le guide ${i + 1}` }, "✕");
      remove.addEventListener("click", () => void editor.change({ ...editor.doc, guides: guides().filter((_, k) => k !== i) }));
      return el("div", { class: "grid grid-cols-[1fr_auto] items-center gap-1" }, el("span", {}, `Guide ${i + 1} : ${formatLength(distance(g.from, g.to), editor.unit)}`), remove);
    });
    const rows: (HTMLElement | null)[] = [
      el("div", { class: "flex gap-1" }, ...modes),
      mode === "measure" ? el("div", { class: "grid grid-cols-4 gap-1", role: "group", "aria-label": "Mesurer entre" }, ...between) : null,
      el(
        "p",
        { class: "text-gray-600 dark:text-gray-300" },
        mode === "angle"
          ? !first ? "Rapporteur : cliquez le sommet de l'angle." : !second ? "Cliquez un point du premier côté." : "Cliquez un point du second côté (Échap : annuler)."
          : mode === "measure" && asked
            ? firstPick ? `${firstPick.name} choisi(e). Cliquez ${asked[1]} (Échap : annuler).` : `Cliquez ${asked[0]}, puis ${asked[1]} : la plus courte distance entre eux.`
            : first ? "Cliquez le second point (Échap : annuler)." : mode === "guide" ? "Cliquez deux points : une ligne de guide est posée." : "Cliquez deux points pour mesurer.",
      ),
      last ? el("p", { class: "font-mono" }, last) : null,
      lastPair && mode === "measure" ? spacing : null,
      ...list,
      measures.length || angles.length ? clear : null,
      el("p", { class: "text-2xs text-gray-500" }, "Les points s'accrochent aux coins, arêtes et guides, et s'alignent sur les coins (boutons d'accrochage de l'esquisse). Les guides sont enregistrés ; les mesures disparaissent quand on quitte."),
    ];
    panel.body.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  };

  const stop = (): void => {
    if (active) viewport.setPointerHandler(null);
    active = null;
    first = null;
    targets = null;
    window.removeEventListener("keydown", onKey, true);
    resetPick();
    liveMarks.clear();
    smartGuides.clear();
    measures.length = 0;
    angles.length = 0;
    second = null;
    lastPair = null;
    last = "";
    panel?.close();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    if (first || firstPick) {
      first = null;
      second = null;
      resetPick();
      drawLive(null);
      render();
    } else stop();
  };

  const handler: PointerHandler = {
    down: () => false,
    move: (event) => {
      if (mode === "measure" && target !== "point") {
        if (target === "edge") hovered = pickAt(event);
        else {
          const face = viewport.pickFace(event);
          viewport.setHoverHighlight(face ? (target === "body" ? { bodies: [face.bodyId] } : { face }) : null);
        }
        drawLive(null);
        return;
      }
      // The point (and its guides) is followed before the first click too.
      const p = pointAt(event);
      if (first) drawLive(p);
    },
    up: (event, isClick) => {
      if (!isClick) return false;
      if (mode === "measure" && target !== "point") {
        const picked = pickAt(event);
        if (!picked) return true;
        if (!firstPick) firstPick = picked;
        else {
          measureBetween(firstPick, picked);
          resetPick();
        }
        drawLive(null);
        render();
        return true;
      }
      const p = pointAt(event);
      if (!p) return true;
      if (mode === "angle") {
        if (!first) first = p;
        else if (!second) {
          if (distance(first, p) > 1e-6) second = p;
        } else if (distance(first, p) > 1e-6) {
          angles.push([first, second, p]);
          last = `Angle : ${angleText(first, second, p)}`;
          first = null;
          second = null;
          targets = null;
        }
      } else if (!first) first = p;
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
  editor.afterRender(() => {
    targets = null;
    drawGuides();
    render();
  });
  drawGuides();
}
