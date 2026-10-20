/**
 * Interactive extrusion, in the manner of desktop CAD tools: the sketch
 * profiles are highlighted, the user clicks one, then drags an arrow along the
 * sketch normal (or types the distance) while a translucent preview follows;
 * OK creates or updates the extrusion feature in the history.
 *
 * The preview is a Three.js extrusion of the profile polygons (instant); the
 * exact B-rep is computed by the kernel only when the feature is committed.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { addExtrude, findFeature, updateFeature } from "../document/operations";
import type { BooleanOperation, CadDocument, DisplayUnit, ExtrudeFeature, SketchFeature } from "../document/types";
import { UNIT_LABELS, fromDisplay, parseNumber, toDisplay, trim } from "../measurements/units";
import { sketchFrame, toWorld, type SketchFrame, type Vec3 } from "../sketcher/frame";
import { centroid, extractLoops, regions, type Region } from "../sketcher/loops";
import { el } from "../ui/dom";
import { textInputClass } from "../ui/fields";
import { axisParameter, dragStep, roundTo } from "../viewport/axis-drag";
import type { PointerHandler, Viewport } from "../viewport/viewport";

export interface ExtrudeToolHost {
  doc(): CadDocument;
  change(next: CadDocument): void;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** Visible bodies, in history order (join/cut targets). */
  bodies(): { id: string; name: string }[];
  unit(): DisplayUnit;
  closed(featureId: string | null): void;
}

interface Profile {
  sketch: SketchFeature;
  frame: SketchFrame;
  regions: Region[];
  meshes: THREE.Mesh[];
}

const COMPACT_INPUT =
  "h-8 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none " +
  "focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";

const COLORS: Record<BooleanOperation, number> = { new: 0x0ea5e9, join: 0x22c55e, cut: 0xef4444 };
const ARROW_PX = 70;

function frameMatrix(frame: SketchFrame): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal));
  return m.setPosition(new THREE.Vector3(...frame.origin));
}

function toShape(region: Region): THREE.Shape {
  const shape = new THREE.Shape(region.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes = region.holes.map((hole) => new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

function makeArrow(): THREE.Group {
  const arrow = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x0284c7, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), material);
  shaft.position.y = 0.375;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.25, 20), material);
  head.position.y = 0.875;
  // Wide invisible grip: easy to grab with a finger.
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false }),
  );
  grip.position.y = 0.55;
  for (const part of [shaft, head, grip]) part.renderOrder = 20;
  arrow.add(shaft, head, grip);
  return arrow;
}

export class ExtrudeTool implements PointerHandler {
  private root = new THREE.Group();
  private profiles: Profile[] = [];
  private selected: Profile | null = null;
  private preview: THREE.Mesh | null = null;
  private arrow = makeArrow();
  private dialog: HTMLElement;
  private distance = 10;
  private operation: BooleanOperation = "new";
  private target: string | undefined;
  private editing: string | null = null;
  private drag: { tDown: number; start: number } | null = null;
  private hovered: Profile | null = null;
  private stopFrame: () => void;
  private container: HTMLElement;
  private tipLabel: HTMLButtonElement;
  private tip: CSS2DObject;

  constructor(
    private readonly viewport: Viewport,
    private readonly host: ExtrudeToolHost,
    container: HTMLElement,
  ) {
    viewport.scene.add(this.root);
    this.arrow.visible = false;
    viewport.scene.add(this.arrow);
    // Compact panel docked on the right of the view, like desktop CAD tools; bottom strip on phones.
    this.dialog = el("div", {
      class:
        "absolute top-2 right-2 z-30 w-56 space-y-2 rounded-lg border border-gray-200 bg-white/95 p-2.5 text-xs " +
        "shadow-xl backdrop-blur max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto " +
        "dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Extrusion",
    });
    container.append(this.dialog);
    this.container = container;
    // Distance shown at the tip of the arrow; click it to type a value.
    this.tipLabel = el("button", { type: "button", class: "cad-dimension pointer-events-auto" });
    this.tipLabel.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.tipLabel.addEventListener("click", (event) => {
      event.stopPropagation();
      const r = this.tipLabel.getBoundingClientRect();
      openCalculator({
        container: this.container,
        anchor: { x: r.right, y: r.top + r.height / 2 },
        value: Math.abs(this.distance),
        unit: this.host.unit(),
        title: "Distance d'extrusion",
        locked: true,
        allowNegative: true,
        onSubmit: (value) => {
          this.setDistance(value);
          return true;
        },
      });
    });
    this.tip = new CSS2DObject(this.tipLabel);
    this.tip.position.set(0, 1.25, 0);
    this.arrow.add(this.tip);
    this.stopFrame = viewport.onEachFrame(() => this.placeArrow());
  }

  /** Opens the tool: on a given sketch, on an existing extrusion, or waiting for a profile click. */
  start(options: { sketchId?: string; featureId?: string } = {}): void {
    const existing = options.featureId ? findFeature(this.host.doc(), options.featureId) : undefined;
    if (existing?.type === "extrude") {
      this.editing = existing.id;
      this.distance = existing.distance;
      this.operation = existing.operation;
      this.target = existing.target;
    }
    this.buildProfiles();
    const sketchId = existing?.type === "extrude" ? existing.sketch : options.sketchId;
    const profile = this.profiles.find((p) => p.sketch.id === sketchId) ?? (this.profiles.length === 1 ? this.profiles[0] : undefined);
    if (profile) this.select(profile);
    else if (this.profiles.length === 0) this.host.notify("Aucune esquisse ne contient de profil fermé à extruder.", "error");
    this.viewport.setPointerHandler(this);
    this.renderDialog();
  }

  // ---- profiles ---------------------------------------------------------------

  private buildProfiles(): void {
    for (const feature of this.host.doc().features) {
      if (feature.type !== "sketch" || feature.suppressed) continue;
      let found: Region[];
      try {
        found = regions(extractLoops(feature));
      } catch {
        continue; // open or branched profile: not extrudable
      }
      if (found.length === 0) continue;
      const frame = sketchFrame(feature.plane, feature.offset);
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.matrix.copy(frameMatrix(frame));
      const meshes = found.map((region) => {
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(toShape(region)),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
        );
        mesh.position.z = 0.02;
        mesh.renderOrder = 15;
        group.add(mesh);
        return mesh;
      });
      this.root.add(group);
      this.profiles.push({ sketch: feature, frame, regions: found, meshes });
    }
  }

  private paintProfiles(): void {
    for (const p of this.profiles) {
      for (const mesh of p.meshes) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        const active = p === this.selected;
        material.color.set(active ? 0x0284c7 : 0x38bdf8);
        material.opacity = active ? 0.45 : p === this.hovered ? 0.4 : 0.22;
      }
    }
  }

  private select(profile: Profile): void {
    this.selected = profile;
    if (!this.editing && this.operation !== "new" && !this.target) this.target = this.host.bodies().at(-1)?.id;
    this.paintProfiles();
    this.updatePreview();
    this.renderDialog();
  }

  // ---- preview and arrow ------------------------------------------------------

  /** Base of the arrow: centroid of the largest region, on the sketch plane. */
  private base(): Vec3 | null {
    const profile = this.selected;
    if (!profile) return null;
    const largest = profile.regions.reduce((a, b) => (Math.abs(area(b.outer)) > Math.abs(area(a.outer)) ? b : a));
    const [x, y] = centroid(largest.outer);
    return toWorld(profile.frame, x, y);
  }

  private updatePreview(): void {
    if (this.preview) {
      this.preview.parent?.remove(this.preview);
      this.preview.geometry.dispose();
      (this.preview.material as THREE.Material).dispose();
      this.preview = null;
    }
    const profile = this.selected;
    if (!profile) {
      this.arrow.visible = false;
      return;
    }
    const geometry = new THREE.ExtrudeGeometry(profile.regions.map(toShape), { depth: Math.abs(this.distance), bevelEnabled: false });
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: COLORS[this.operation], transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.z = Math.min(0, this.distance);
    mesh.renderOrder = 16;
    const holder = (profile.meshes[0] as THREE.Mesh).parent as THREE.Group;
    holder.add(mesh);
    this.preview = mesh;
    this.arrow.visible = true;
    this.placeArrow();
  }

  /** Keeps the arrow at the extrusion end, pointing outward, at a constant size on screen. */
  private placeArrow(): void {
    const base = this.base();
    if (!base || !this.selected) return;
    const n = new THREE.Vector3(...this.selected.frame.normal);
    const direction = n.clone().multiplyScalar(this.distance < 0 ? -1 : 1);
    this.arrow.position.copy(new THREE.Vector3(...base).addScaledVector(n, this.distance));
    this.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.arrow.scale.setScalar(ARROW_PX * this.viewport.worldPerPixel());
    this.tipLabel.textContent = `${trim(toDisplay(this.distance, this.host.unit()), 3)} ${UNIT_LABELS[this.host.unit()]}`;
  }

  private setDistance(value: number): void {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-3) return;
    this.distance = value;
    this.updatePreview();
    const input = this.dialog.querySelector<HTMLInputElement>("[data-extrude-distance]");
    if (input && document.activeElement !== input) input.value = trim(toDisplay(value, this.host.unit()), 4);
  }

  // ---- pointer ----------------------------------------------------------------

  private axisT(event: PointerEvent): number | null {
    const base = this.base();
    if (!base || !this.selected) return null;
    const { origin, direction } = this.viewport.rayFromEvent(event);
    return axisParameter(base, this.selected.frame.normal, origin, direction);
  }

  down(event: PointerEvent): boolean {
    if (!this.arrow.visible || this.viewport.intersect(event, [this.arrow]).length === 0) return false;
    const t = this.axisT(event);
    if (t === null) return false;
    this.drag = { tDown: t, start: this.distance };
    return true;
  }

  move(event: PointerEvent): void {
    if (this.drag) {
      const t = this.axisT(event);
      if (t === null) return;
      const step = dragStep(this.viewport.worldPerPixel());
      this.setDistance(roundTo(this.drag.start + t - this.drag.tDown, step));
      return;
    }
    const hit = this.viewport.intersect(event, this.profiles.flatMap((p) => p.meshes))[0];
    const hovered = hit ? (this.profiles.find((p) => p.meshes.includes(hit.object as THREE.Mesh)) ?? null) : null;
    const overArrow = this.arrow.visible && this.viewport.intersect(event, [this.arrow]).length > 0;
    this.viewport.renderer.domElement.style.cursor = overArrow ? "grab" : hovered ? "pointer" : "";
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      this.paintProfiles();
    }
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (this.drag) {
      this.drag = null;
      return true;
    }
    if (!isClick) return false;
    const hit = this.viewport.intersect(event, this.profiles.flatMap((p) => p.meshes))[0];
    const profile = hit ? this.profiles.find((p) => p.meshes.includes(hit.object as THREE.Mesh)) : undefined;
    if (profile) this.select(profile);
    return true;
  }

  handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
      this.cancel();
      return true;
    }
    if (event.key === "Enter") {
      this.confirm();
      return true;
    }
    return false;
  }

  // ---- dialog -----------------------------------------------------------------

  private renderDialog(): void {
    const unit = this.host.unit();
    const profileText = this.selected ? this.selected.sketch.name : "Cliquez un profil dans la vue";
    const distance = el("input", {
      type: "text",
      inputmode: "decimal",
      class: `${COMPACT_INPUT} text-right font-mono`,
      value: trim(toDisplay(this.distance, unit), 4),
      "aria-label": `Distance (${UNIT_LABELS[unit]})`,
      "data-extrude-distance": "true",
    });
    const commitDistance = () => {
      const value = parseNumber(distance.value);
      if (value === null || Math.abs(value) < 1e-6) {
        distance.setAttribute("aria-invalid", "true");
        return;
      }
      distance.setAttribute("aria-invalid", "false");
      this.setDistance(fromDisplay(value, unit));
    };
    distance.addEventListener("input", commitDistance);
    distance.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitDistance();
        this.confirm();
      }
    });
    const flip = el(
      "button",
      { type: "button", class: "size-8 shrink-0 rounded-md border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Inverser le sens", "aria-label": "Inverser le sens" },
      "⇅",
    );
    flip.addEventListener("click", () => this.setDistance(-this.distance));

    const operation = el(
      "select",
      { class: COMPACT_INPUT, "aria-label": "Opération" },
      ...(
        [
          ["new", "Nouveau corps"],
          ["join", "Union"],
          ["cut", "Soustraction"],
        ] as const
      ).map(([v, label]) => el("option", { value: v, selected: v === this.operation }, label)),
    );
    operation.addEventListener("change", () => {
      this.operation = operation.value as BooleanOperation;
      if (this.operation !== "new" && !this.target) this.target = this.host.bodies().at(-1)?.id;
      this.updatePreview();
      this.renderDialog();
    });

    const bodies = this.host.bodies().filter((b) => b.id !== this.editing);
    const target =
      this.operation === "new"
        ? null
        : el(
            "label",
            { class: "grid grid-cols-[4.5rem_1fr] items-center gap-1.5" },
            "Cible",
            (() => {
              const select = el(
                "select",
                { class: COMPACT_INPUT, "aria-label": "Corps cible" },
                ...bodies.map((b) => el("option", { value: b.id, selected: b.id === this.target }, b.name)),
              );
              select.addEventListener("change", () => (this.target = select.value));
              return select;
            })(),
          );

    const cancel = el(
      "button",
      { type: "button", class: "h-8 flex-1 rounded-md border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" },
      "Annuler",
    );
    cancel.addEventListener("click", () => this.cancel());
    const ok = el(
      "button",
      { type: "button", class: "h-8 flex-1 rounded-md bg-sky-600 font-medium text-white hover:bg-sky-700 disabled:opacity-40", disabled: !this.selected },
      "OK",
    );
    ok.addEventListener("click", () => this.confirm());

    const children: (HTMLElement | null)[] = [
      el(
        "div",
        { class: "flex items-center justify-between" },
        el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, this.editing ? "Modifier l'extrusion" : "Extrusion"),
        el("span", { class: `truncate pl-2 ${this.selected ? "text-sky-700 dark:text-sky-300" : "text-amber-700 dark:text-amber-300"}` }, this.selected ? profileText : "Cliquez un profil"),
      ),
      el("label", { class: "grid grid-cols-[4.5rem_1fr_auto] items-center gap-1.5" }, `Distance`, distance, flip),
      el("label", { class: "grid grid-cols-[4.5rem_1fr] items-center gap-1.5" }, "Opération", operation),
      target,
      el("div", { class: "flex gap-1.5 pt-0.5" }, cancel, ok),
    ];
    this.dialog.replaceChildren(...children.filter((c): c is HTMLElement => c !== null));
  }

  // ---- commit -----------------------------------------------------------------

  confirm(): void {
    const profile = this.selected;
    if (!profile) {
      this.host.notify("Sélectionnez d'abord un profil à extruder.", "error");
      return;
    }
    if (this.operation !== "new" && !this.target) {
      this.host.notify("Choisissez le corps cible de l'union ou de la soustraction.", "error");
      return;
    }
    const doc = this.host.doc();
    const values: Pick<ExtrudeFeature, "sketch" | "distance" | "operation" | "target"> = {
      sketch: profile.sketch.id,
      distance: this.distance,
      operation: this.operation,
      target: this.operation === "new" ? undefined : this.target,
    };
    let next: CadDocument;
    let id: string;
    if (this.editing) {
      id = this.editing;
      next = updateFeature(doc, id, (f) => (f.type === "extrude" ? { ...f, ...values } : f));
    } else {
      next = addExtrude(doc, profile.sketch.id, this.distance);
      id = next.features[next.features.length - 1]?.id as string;
      next = updateFeature(next, id, (f) => (f.type === "extrude" ? { ...f, ...values } : f));
    }
    this.close();
    this.host.change(next);
    this.host.closed(id);
  }

  cancel(): void {
    this.close();
    this.host.closed(null);
  }

  private close(): void {
    closeCalculator();
    this.tipLabel.remove();
    this.stopFrame();
    this.viewport.setPointerHandler(null);
    this.viewport.renderer.domElement.style.cursor = "";
    for (const object of [this.root, this.arrow]) {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.viewport.scene.remove(object);
    }
    this.dialog.remove();
  }
}

function area(polygon: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i] as [number, number];
    const [x2, y2] = polygon[(i + 1) % polygon.length] as [number, number];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
