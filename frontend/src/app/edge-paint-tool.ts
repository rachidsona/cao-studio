/**
 * « Peindre les chants » : les chants posés se voient en vert sur les pièces, le survol montre le bord visé, un clic pose
 * ou retire son chant. Les 4 chants d'un coup, ou la pipette : un clic prend les chants d'une pièce, les clics suivants
 * les reportent sur d'autres. Chaque clic est une annulation.
 */
import * as THREE from "three";
import { edgeLine, nearestEdge, type EdgeKey, type Edges } from "../document/edge-paint";
import { bodyInfo, EDGE_BANDS, setBodyInfo } from "../document/materials";
import { el } from "../ui/dom";
import { panelHeader } from "../ui/panel-close";
import { placePanel } from "../ui/dock";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

const NO_EDGES: Edges = { length1: false, length2: false, width1: false, width2: false };
const ALL: EdgeKey[] = ["length1", "length2", "width1", "width2"];

type Mode = "one" | "all" | "sample";

class EdgePaintTool implements PointerHandler {
  private readonly panel: HTMLElement;
  private readonly lines = new THREE.Group();
  private readonly hovered = new THREE.Group();
  private readonly painted = new THREE.LineBasicMaterial({ color: 0x63df0f, depthTest: false });
  private readonly hover = new THREE.LineBasicMaterial({ color: 0xf97316, depthTest: false });
  private mode: Mode = "one";
  private band = 1;
  /** The bands taken with the pipette. */
  private copied: { edges: Edges; band: number } | null = null;
  private readonly text = el("p", { class: "text-gray-600 dark:text-gray-300", "data-edge-state": "" });
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    this.close();
  };
  /** Stops redrawing the edges after each render (Editor.afterRender). */
  private readonly unhook: () => void;

  constructor(private readonly viewport: Viewport, private readonly editor: Editor, private readonly closed: () => void) {
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Peindre les chants" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    const mode = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Au clic" }, ...([["one", "Un chant"], ["all", "Les 4 chants"], ["sample", "Pipette : reprendre ceux d'une pièce"]] as const).map(([value, label]) => el("option", { value }, label)));
    mode.addEventListener("change", () => {
      this.mode = mode.value as Mode;
      this.copied = null;
      this.say();
    });
    const band = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Épaisseur du chant" }, ...EDGE_BANDS.map((b) => el("option", { value: String(b), selected: b === this.band }, `Chant ${b} mm`)));
    band.addEventListener("change", () => (this.band = Number(band.value)));
    this.panel.append(panelHeader("Peindre les chants", () => this.close()), this.text, mode, band);
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    this.lines.renderOrder = this.hovered.renderOrder = 60;
    viewport.scene.add(this.lines, this.hovered);
    window.addEventListener("keydown", this.onKey, true);
    viewport.setPointerHandler(this);
    this.unhook = editor.afterRender(() => this.draw());
    this.draw();
    this.say();
  }

  private say(): void {
    this.text.textContent = this.mode === "sample" ? (this.copied ? "Cliquez les pièces qui prennent ces chants." : "Cliquez la pièce dont vous reprenez les chants.") : "Cliquez le bord d'une pièce : le chant se pose, ou s'enlève s'il y est.";
  }

  private segments(group: THREE.Group, material: THREE.LineBasicMaterial, points: number[]): void {
    for (const child of [...group.children]) {
      group.remove(child);
      (child as THREE.LineSegments).geometry.dispose();
    }
    if (!points.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = 60;
    group.add(line);
  }

  private boxOf(id: string) {
    return this.viewport.bodyMesh(id)?.metrics.bbox;
  }

  /** The bands laid, in green on the pieces in sight. */
  private draw(): void {
    const seen = new Set(this.viewport.bodyMeshes().filter((m) => m.visible).map((m) => m.userData.bodyId as string));
    const points = [...seen].flatMap((id) => {
      const box = this.boxOf(id);
      const edges = bodyInfo(this.editor.doc, id).edges;
      return box && edges ? ALL.filter((k) => edges[k]).flatMap((k) => edgeLine(box, k).flat()) : [];
    });
    this.segments(this.lines, this.painted, points);
  }

  down(): boolean {
    return false;
  }

  move(event: PointerEvent): void {
    const face = this.mode === "one" ? this.viewport.pickFace(event) : null;
    const box = face ? this.boxOf(face.bodyId) : null;
    this.segments(this.hovered, this.hover, face && box ? edgeLine(box, nearestEdge(box, face.point.toArray())).flat() : []);
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick) return false;
    const face = this.viewport.pickFace(event);
    const box = face ? this.boxOf(face.bodyId) : null;
    if (!face || !box) return true;
    const doc = this.editor.doc;
    const info = bodyInfo(doc, face.bodyId);
    if (this.mode === "sample" && !this.copied) {
      this.copied = { edges: { ...NO_EDGES, ...info.edges }, band: info.band ?? this.band };
      this.say();
      return true;
    }
    const edges: Edges = this.mode === "sample" ? (this.copied as { edges: Edges }).edges : this.mode === "all" ? { length1: true, length2: true, width1: true, width2: true } : (() => {
      const key = nearestEdge(box, face.point.toArray());
      const now = { ...NO_EDGES, ...info.edges };
      return { ...now, [key]: !now[key] };
    })();
    void this.editor.change(setBodyInfo(doc, [face.bodyId], { edges, band: this.copied?.band ?? this.band }));
    return true;
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.segments(this.lines, this.painted, []);
    this.segments(this.hovered, this.hover, []);
    this.viewport.scene.remove(this.lines, this.hovered);
    this.unhook();
    this.panel.remove();
    this.viewport.setPointerHandler(null);
    this.closed();
  }
}

export function bindEdgePaint(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  let tool: EdgePaintTool | null = null;
  root.querySelector('[data-workshop="edge-paint"]')?.addEventListener("click", () => {
    tool?.close();
    editor.sketches.cancelJoinery();
    tool = new EdgePaintTool(viewport, editor, () => (tool = null));
  });
}
