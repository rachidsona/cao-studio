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
import { closeCalculator, openCalculator } from "../ui/calculator";
import { addExtrude, findFeature, latestBody, updateFeature } from "../document/operations";
import type { BooleanOperation, CadDocument, DisplayUnit, ExtrudeFeature, SketchFeature } from "../document/types";
import { UNIT_LABELS, fromDisplay, parseNumber, toDisplay, trim } from "../measurements/units";
import { sketchFrame, toWorld, type SketchFrame, type Vec3 } from "../sketcher/frame";
import { centroid, extractLoops, interiorPoint, pointInPolygon, sketchFaces, type Region, type SketchFace } from "../sketcher/loops";
import { el } from "../ui/dom";
import { textInputClass } from "../ui/fields";
import { ArrowHandle } from "../viewport/arrow-handle";
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

/** One bounded area of a sketch: pickable, and extruded when chosen. */
interface Face {
  region: SketchFace;
  /** A point strictly inside the area (stored in the feature to find the area again). */
  probe: [number, number];
  mesh: THREE.Mesh;
}

interface Profile {
  sketch: SketchFeature;
  frame: SketchFrame;
  faces: Face[];
}

const COMPACT_INPUT =
  "h-8 w-full min-w-0 rounded-md border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none " +
  "focus:ring-2 focus:ring-sky-500/30 aria-invalid:border-red-500 dark:border-gray-600 dark:bg-gray-900";

const COLORS: Record<BooleanOperation, number> = { new: 0x0ea5e9, join: 0x22c55e, cut: 0xef4444, intersect: 0xa855f7 };
function frameMatrix(frame: SketchFrame): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal));
  return m.setPosition(new THREE.Vector3(...frame.origin));
}

function toShape(region: Region): THREE.Shape {
  const shape = new THREE.Shape(region.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes = region.holes.map((hole) => new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

export class ExtrudeTool implements PointerHandler {
  private root = new THREE.Group();
  private profiles: Profile[] = [];
  private selected: Profile | null = null;
  /** Areas of the selected sketch that are extruded. */
  private chosen = new Set<Face>();
  /** False while the choice is the default (every material area); the first click then picks one area. */
  private explicit = false;
  private preview: THREE.Mesh | null = null;
  private arrow: ArrowHandle;
  private dialog: HTMLElement;
  private distance = 10;
  private operation: BooleanOperation = "new";
  /** The user picked the operation: stop deriving it from the sketch's support face. */
  private operationChosen = false;
  private target: string | undefined;
  private editing: string | null = null;
  private hovered: Face | null = null;
  private container: HTMLElement;

  constructor(
    private readonly viewport: Viewport,
    private readonly host: ExtrudeToolHost,
    container: HTMLElement,
  ) {
    viewport.scene.add(this.root);
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
    // Arrow along the sketch normal; its value label opens the keypad.
    this.arrow = new ArrowHandle(viewport, (anchor) =>
      openCalculator({
        container: this.container,
        anchor,
        value: Math.abs(this.distance),
        unit: this.host.unit(),
        title: "Distance d'extrusion",
        locked: true,
        allowNegative: true,
        onSubmit: (value) => {
          this.setDistance(value);
          return true;
        },
      }),
    );
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
    if (profile) {
      // An existing extrusion that chose its areas gets them back (found again from their points).
      const saved = existing?.type === "extrude" ? existing.regions : undefined;
      const faces = saved ? new Set(saved.map((p) => faceAt(profile, p)).filter((f): f is Face => f !== undefined)) : null;
      this.select(profile, faces && faces.size > 0 ? [...faces] : undefined);
    }
    else if (this.profiles.length === 0) this.host.notify("Aucune esquisse ne contient de profil fermé à extruder.", "error");
    this.viewport.setPointerHandler(this);
    this.renderDialog();
  }

  // ---- profiles ---------------------------------------------------------------

  private buildProfiles(): void {
    for (const feature of this.host.doc().features) {
      if (feature.type !== "sketch" || feature.suppressed) continue;
      let found: SketchFace[];
      try {
        found = sketchFaces(extractLoops(feature));
      } catch {
        continue; // open or branched profile: not extrudable
      }
      if (found.length === 0) continue;
      const frame = sketchFrame(feature.plane, feature.offset, feature.shift);
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.matrix.copy(frameMatrix(frame));
      const faces = found.map((region): Face => {
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(toShape(region)),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
        );
        mesh.position.z = 0.02;
        mesh.renderOrder = 15;
        group.add(mesh);
        return { region, probe: interiorPoint(region), mesh };
      });
      this.root.add(group);
      this.profiles.push({ sketch: feature, frame, faces });
    }
  }

  private allFaces(): Face[] {
    return this.profiles.flatMap((p) => p.faces);
  }

  /**
   * The area under the pointer. Areas of different sketches can lie in the same plane, on top of each
   * other: among those at the nearest depth, the chosen sketch wins, then the smallest area.
   */
  private faceUnder(event: PointerEvent): { profile: Profile; face: Face } | null {
    const hits = this.viewport.intersect(event, this.allFaces().map((f) => f.mesh));
    const nearest = hits[0]?.distance;
    if (nearest === undefined) return null;
    const found = hits
      .filter((hit) => hit.distance <= nearest + 0.5)
      .flatMap((hit) => {
        const profile = this.profiles.find((p) => p.faces.some((f) => f.mesh === hit.object));
        const face = profile?.faces.find((f) => f.mesh === hit.object);
        return profile && face ? [{ profile, face }] : [];
      });
    const rank = (c: { profile: Profile; face: Face }) => [c.profile === this.selected ? 0 : 1, Math.abs(area(c.face.region.outer))] as const;
    return found.sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])[0] ?? null;
  }

  private paintProfiles(): void {
    for (const p of this.profiles) {
      for (const face of p.faces) {
        const material = face.mesh.material as THREE.MeshBasicMaterial;
        const active = p === this.selected && this.chosen.has(face);
        material.color.set(active ? 0x0284c7 : 0x38bdf8);
        material.opacity = active ? 0.45 : face === this.hovered ? 0.4 : 0.22;
      }
    }
  }

  /** Every area that is material by the even–odd rule: what an extrusion takes unless areas are chosen. */
  private defaultFaces(profile: Profile): Face[] {
    return profile.faces.filter((f) => f.region.depth % 2 === 0);
  }

  private select(profile: Profile, faces?: Face[]): void {
    this.selected = profile;
    this.explicit = faces !== undefined;
    this.chosen = new Set(faces ?? this.defaultFaces(profile));
    // A sketch drawn on a body face adds to that body by default.
    const support = profile.sketch.support;
    if (!this.editing && !this.operationChosen && support) {
      const body = latestBody(this.host.doc(), support);
      if (this.host.bodies().some((b) => b.id === body)) {
        this.operation = "join";
        this.target = body;
      }
    }
    if (!this.editing && this.operation !== "new" && !this.target) this.target = this.host.bodies().at(-1)?.id;
    this.paintProfiles();
    this.updatePreview();
    this.renderDialog();
  }

  /** A click on an area: another sketch starts over; in the same sketch the first click picks that area, the next ones add or remove. */
  private pick(profile: Profile, face: Face): void {
    if (profile !== this.selected) return this.select(profile, [face]);
    if (!this.explicit) this.chosen = new Set([face]);
    else if (this.chosen.has(face)) this.chosen.delete(face);
    else this.chosen.add(face);
    this.explicit = true;
    this.paintProfiles();
    this.updatePreview();
    this.renderDialog();
  }

  // ---- preview and arrow ------------------------------------------------------

  /** Base of the arrow: centroid of the largest chosen area, on the sketch plane. */
  private base(): Vec3 | null {
    const profile = this.selected;
    if (!profile || this.chosen.size === 0) return null;
    const largest = [...this.chosen].reduce((a, b) => (Math.abs(area(b.region.outer)) > Math.abs(area(a.region.outer)) ? b : a));
    const [x, y] = centroid(largest.region.outer);
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
    if (!profile || this.chosen.size === 0) {
      this.arrow.object.visible = false;
      return;
    }
    const geometry = new THREE.ExtrudeGeometry([...this.chosen].map((f) => toShape(f.region)), { depth: Math.abs(this.distance), bevelEnabled: false });
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: COLORS[this.operation], transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.z = Math.min(0, this.distance);
    mesh.renderOrder = 16;
    const holder = (profile.faces[0] as Face).mesh.parent as THREE.Group;
    holder.add(mesh);
    this.preview = mesh;
    this.placeArrow();
  }

  /** Arrow at the extrusion end, pointing outward. */
  private placeArrow(): void {
    const base = this.base();
    if (!base || !this.selected) return;
    const unit = this.host.unit();
    this.arrow.place(base, this.selected.frame.normal, this.distance, `${trim(toDisplay(this.distance, unit), 3)} ${UNIT_LABELS[unit]}`);
  }

  private setDistance(value: number): void {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-3) return;
    this.distance = value;
    this.updatePreview();
    const input = this.dialog.querySelector<HTMLInputElement>("[data-extrude-distance]");
    if (input && document.activeElement !== input) input.value = trim(toDisplay(value, this.host.unit()), 4);
  }

  // ---- pointer ----------------------------------------------------------------

  down(event: PointerEvent): boolean {
    return this.selected !== null && this.arrow.dragStart(event);
  }

  move(event: PointerEvent): void {
    const dragged = this.arrow.dragMove(event);
    if (dragged !== null) {
      this.setDistance(dragged);
      return;
    }
    const hovered = this.faceUnder(event)?.face ?? null;
    const overArrow = this.arrow.hovered(event);
    this.viewport.renderer.domElement.style.cursor = overArrow ? "grab" : hovered ? "pointer" : "";
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      this.paintProfiles();
    }
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) return true;
    if (!isClick) return false;
    const under = this.faceUnder(event);
    if (under) this.pick(under.profile, under.face);
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
    const count = this.chosen.size;
    const profileText = this.selected ? `${this.selected.sketch.name}${this.explicit ? ` — ${count} zone${count > 1 ? "s" : ""}` : ""}` : "Cliquez un profil dans la vue";
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
          ["intersect", "Intersection"],
        ] as const
      ).map(([v, label]) => el("option", { value: v, selected: v === this.operation }, label)),
    );
    operation.addEventListener("change", () => {
      this.operation = operation.value as BooleanOperation;
      this.operationChosen = true;
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
      { type: "button", class: "h-8 flex-1 rounded-md bg-sky-600 font-medium text-white hover:bg-sky-700 disabled:opacity-40", disabled: !this.selected || this.chosen.size === 0 },
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
      this.selected && this.selected.faces.length > 1
        ? el("p", { class: "text-gray-600 dark:text-gray-300" }, this.chosen.size === 0 ? "Cliquez une zone à extruder." : "Cliquez des zones pour choisir ce qui est extrudé ; recliquez pour en retirer.")
        : null,
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
    if (!profile || this.chosen.size === 0) {
      this.host.notify("Sélectionnez d'abord un profil à extruder.", "error");
      return;
    }
    if (this.operation !== "new" && !this.target) {
      this.host.notify("Choisissez le corps cible de l'union ou de la soustraction.", "error");
      return;
    }
    const doc = this.host.doc();
    // Chosen areas are stored only when they differ from the default (every material area).
    const defaults = this.defaultFaces(profile);
    const isDefault = this.chosen.size === defaults.length && defaults.every((f) => this.chosen.has(f));
    const values: Pick<ExtrudeFeature, "sketch" | "distance" | "operation" | "target" | "regions"> = {
      sketch: profile.sketch.id,
      regions: isDefault ? undefined : [...this.chosen].map((f) => f.probe),
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
    this.arrow.dispose();
    this.viewport.setPointerHandler(null);
    this.viewport.renderer.domElement.style.cursor = "";
    for (const object of [this.root]) {
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

/** Smallest area of the sketch that contains the point. */
function faceAt(profile: Profile, p: [number, number]): Face | undefined {
  return profile.faces
    .filter((f) => pointInPolygon(p, f.region.outer))
    .sort((a, b) => Math.abs(area(a.region.outer)) - Math.abs(area(b.region.outer)))[0];
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
