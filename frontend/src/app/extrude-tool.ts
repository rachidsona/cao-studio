/**
 * Interactive extrusion, in the manner of desktop CAD tools: the sketch
 * profiles are highlighted, the user clicks one, then drags an arrow along the
 * sketch normal (or types the distance) while a translucent preview follows;
 * OK creates or updates the extrusion feature in the history.
 *
 * The preview is a Three.js extrusion of the profile polygons (instant); the
 * exact B-rep is computed by the kernel only when the feature is committed.
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import * as THREE from "three";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { addExtrude, findFeature, latestBody, updateFeature } from "../document/operations";
import type { BooleanOperation, CadDocument, DisplayUnit, ExtrudeFeature, SketchFeature } from "../document/types";
import { UNIT_LABELS, formatLength, fromDisplay, parseNumber, toDisplay, trim } from "../measurements/units";
import { frameOf, toWorld, type SketchFrame, type Vec3 } from "../sketcher/frame";
import { centroid, extractLoops, interiorPoint, loopKey, pointInPolygon, sketchFaces, type Region, type SketchFace } from "../sketcher/loops";
import { el } from "../ui/dom";
import { textBox } from "../sketcher/text-outline";
import { textInputClass } from "../ui/fields";
import { ArrowHandle } from "../viewport/arrow-handle";
import { getEdgeTake, referenceDistance, ReferencePicker, setEdgeTake, type EdgeTake, type Reference } from "./reference-measure";
import { ReferenceMarker } from "./reference-marker";
import type { PointerHandler, Viewport } from "../viewport/viewport";
import { operationChoices } from "../ui/feature-meta";
import { placePanel } from "../ui/dock";
import { CLOSE_TITLE } from "../ui/panel-close";

export interface ExtrudeToolHost {
  doc(): CadDocument;
  /** One undo step; `amend`: in place of the last one (the same extrusion, set again). */
  change(next: CadDocument, amend?: boolean): void;
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
  /** What its outline is made of (loopKey): stored too, the area then follows its points when a dimension changes. */
  key?: string;
  mesh: THREE.Mesh;
}

interface Profile {
  sketch: SketchFeature;
  frame: SketchFrame;
  faces: Face[];
}

const COMPACT_INPUT =
  "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none " +
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
  /** Corners, edges and faces of the bodies, to take a distance from (a click that is not on a profile). */
  private reference: ReferencePicker;
  /** Lights up the corner, edge or face a click would take as the stop. */
  private marker: ReferenceMarker;
  private dialog: HTMLElement;
  private distance = 10;
  /** Fusion's "Start": from the sketch plane, or this far from it along its normal (mm). */
  private startOffset: number | null = null;
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
        "absolute top-2 right-2 z-30 w-56 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs " +
        "shadow-xl backdrop-blur max-sm:top-auto max-sm:right-2 max-sm:bottom-2 max-sm:left-2 max-sm:w-auto " +
        "dark:border-gray-700 dark:bg-gray-900/95",
      role: "dialog",
      "aria-label": "Extrusion",
    });
    placePanel(container, this.dialog);
    this.container = container;
    this.reference = new ReferencePicker(viewport);
    this.marker = new ReferenceMarker(viewport);
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
      this.startOffset = existing.startOffset ? existing.startOffset : null;
      this.operation = existing.operation;
      this.target = existing.target;
    }
    this.reference.capture();
    this.buildProfiles();
    const sketchId = existing?.type === "extrude" ? existing.sketch : options.sketchId;
    const profile = this.profiles.find((p) => p.sketch.id === sketchId) ?? (this.profiles.length === 1 ? this.profiles[0] : undefined);
    if (profile) {
      // An existing extrusion that chose its areas gets them back (found again from their points).
      const saved = existing?.type === "extrude" ? existing.regions : undefined;
      const keys = existing?.type === "extrude" ? existing.regionKeys : undefined;
      const found = (p: [number, number], i: number) => (keys?.[i] ? profile.faces.find((f) => f.key === keys[i]) : undefined) ?? faceAt(profile, p);
      const faces = saved ? new Set(saved.map(found).filter((f): f is Face => f !== undefined)) : null;
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
      let loops: ReturnType<typeof extractLoops> = [];
      try {
        loops = extractLoops(feature);
        found = sketchFaces(loops);
      } catch {
        found = []; // open or branched profile: only its texts can be extruded
      }
      // The texts of the sketch are picked through the box around their letters (they are extruded with the profile).
      const boxes = (feature.texts ?? []).map(textBox);
      if (boxes.length) {
        const [x0, y0] = [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))];
        const [x1, y1] = [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))];
        found.push({ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [], loop: -1, depth: 0, children: [] });
      }
      if (found.length === 0) continue;
      const frame = frameOf(feature);
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
        const loop = loops[region.loop];
        return { region, probe: interiorPoint(region), ...(loop ? { key: loopKey(loop, feature) } : {}), mesh };
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
    // Several areas: none is chosen until one is clicked, and the arrow comes on that one (as in Shapr3D).
    // A single area, or an extrusion being edited, starts with them all.
    const defaults = this.defaultFaces(profile);
    this.chosen = new Set(faces ?? (defaults.length > 1 && !this.editing ? [] : defaults));
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

  /** Base of the arrow: centroid of the largest chosen area, on the sketch plane (moved by the start offset). */
  private base(): Vec3 | null {
    const profile = this.selected;
    if (!profile || this.chosen.size === 0) return null;
    const largest = [...this.chosen].reduce((a, b) => (Math.abs(area(b.region.outer)) > Math.abs(area(a.region.outer)) ? b : a));
    const [x, y] = centroid(largest.region.outer);
    const p = toWorld(profile.frame, x, y);
    const n = profile.frame.normal;
    const o = this.startOffset ?? 0;
    return [p[0] + n[0] * o, p[1] + n[1] * o, p[2] + n[2] * o];
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
    mesh.position.z = Math.min(0, this.distance) + (this.startOffset ?? 0);
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
    // What a click would take as the stop is lit up (a corner, an edge, a face), so that it is easy to aim at.
    const stop = overArrow ? null : this.stopAt(event, hovered !== null);
    this.marker.show(stop);
    this.viewport.renderer.domElement.style.cursor = overArrow ? "grab" : stop ? THIN_CROSSHAIR : hovered ? "pointer" : "";
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      this.paintProfiles();
    }
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) return true;
    if (!isClick) return false;
    const under = this.faceUnder(event);
    const stop = this.stopAt(event, under !== null);
    if (stop) this.takeReference(stop);
    else if (under) this.pick(under.profile, under.face);
    return true;
  }

  /**
   * The stop a click would take: a corner or an edge near the pointer — even over an area of the sketch, unless it is at
   * the level of the profile itself (then the click picks the area) — else, off the areas, the face under the pointer.
   */
  private stopAt(event: PointerEvent, overArea: boolean): Reference | null {
    const base = this.base();
    if (!base || !this.selected) return null;
    const normal = this.selected.frame.normal;
    const near = this.reference.near(event);
    if (near && referenceDistance(near, base, normal, getEdgeTake())) return near;
    return overArea ? null : this.reference.find(event);
  }

  /** A click on a corner, an edge or a face of a body: its measure becomes the distance. */
  private takeReference(reference: Reference): void {
    const base = this.base();
    if (!base || !this.selected) return;
    const taken = referenceDistance(reference, base, this.selected.frame.normal, getEdgeTake());
    if (!taken) return this.host.notify("Ce point est au niveau du profil : la distance serait nulle.", "info");
    this.setDistance(taken.value);
    this.host.notify(`Distance prise : ${formatLength(Math.abs(taken.value), this.host.unit())} (${taken.what}).`, "info");
  }

  handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape") {
      this.cancel();
      return true;
    }
    // Entrée: stored now, and the tool closes.
    if (event.key === "Enter") {
      this.confirm();
      if (this.whole()) this.cancel();
      return true;
    }
    return false;
  }

  // ---- dialog -----------------------------------------------------------------

  /** What this extrusion stored: the document before it, and the one it made (to set it again in place). */
  private stored: { base: CadDocument; doc: CadDocument; id: string } | null = null;
  private storeTimer: number | undefined;

  /** The document the extrusion works on: the one before it stored anything, while what it stored still stands. */
  private docBefore(): CadDocument {
    return this.stored && this.host.doc() === this.stored.doc ? this.stored.base : this.host.doc();
  }

  /** Whole: a profile, an area, a target when it joins, cuts or intersects. */
  private whole(): boolean {
    return !!this.selected && this.chosen.size > 0 && (this.operation === "new" || !!this.target);
  }

  private renderDialog(): void {
    // Each setting, once whole, is stored a moment later (no « OK »): the tool stays open.
    window.clearTimeout(this.storeTimer);
    if (this.whole()) this.storeTimer = window.setTimeout(() => ((this.storeTimer = undefined), this.store()), 400);
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
        if (this.whole()) this.cancel();
      }
    });
    const flip = el(
      "button",
      { type: "button", class: "size-8 shrink-0 border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: "Inverser le sens", "aria-label": "Inverser le sens" },
      "⇅",
    );
    flip.addEventListener("click", () => this.setDistance(-this.distance));

    const start = el(
      "select",
      { class: COMPACT_INPUT, "aria-label": "Départ de l'extrusion" },
      el("option", { value: "profile", selected: this.startOffset === null }, "Plan du profil"),
      el("option", { value: "offset", selected: this.startOffset !== null }, "Décalé"),
    );
    start.addEventListener("change", () => {
      this.startOffset = start.value === "offset" ? (this.startOffset ?? 0) : null;
      this.updatePreview();
      this.renderDialog();
    });
    const offset = el("input", { type: "text", inputmode: "decimal", class: `${COMPACT_INPUT} text-right font-mono`, value: trim(toDisplay(this.startOffset ?? 0, unit), 4), "aria-label": `Décalage du départ (${UNIT_LABELS[unit]})` });
    offset.addEventListener("input", () => {
      const value = parseNumber(offset.value);
      offset.setAttribute("aria-invalid", String(value === null));
      if (value === null) return;
      this.startOffset = fromDisplay(value, unit);
      this.updatePreview();
    });
    offset.addEventListener("keydown", (event) => event.stopPropagation());

    const operation = el(
      "select",
      { class: COMPACT_INPUT, "aria-label": "Opération" },
      ...operationChoices("new", "join", "cut", "intersect").map(([v, label]) => el("option", { value: v, selected: v === this.operation }, label)),
    );
    operation.addEventListener("change", () => {
      this.operation = operation.value as BooleanOperation;
      this.operationChosen = true;
      if (this.operation !== "new" && !this.target) this.target = this.host.bodies().at(-1)?.id;
      this.updatePreview();
      this.renderDialog();
    });

    const edgeTake = el(
      "select",
      { class: COMPACT_INPUT, "aria-label": "Mesure prise sur une arête" },
      el("option", { value: "level", selected: getEdgeTake() === "level" }, "Son niveau"),
      el("option", { value: "length", selected: getEdgeTake() === "length" }, "Sa longueur"),
    );
    edgeTake.addEventListener("change", () => setEdgeTake(edgeTake.value as EdgeTake));

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

    const cross = el("button", { type: "button", class: "size-7 shrink-0 border border-gray-300 text-sm leading-none hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", title: CLOSE_TITLE, "aria-label": "Fermer", "data-panel-close": "" }, "✕");
    cross.addEventListener("click", () => this.cancel());

    const children: (HTMLElement | null)[] = [
      el(
        "div",
        { class: "flex items-center justify-between" },
        el("h2", { class: "panel-title" }, this.editing ? "Modifier l'extrusion" : "Extrusion"),
        el("span", { class: `min-w-0 flex-1 truncate pl-2 ${this.selected ? "text-sky-700 dark:text-sky-300" : "text-amber-700 dark:text-amber-300"}` }, this.selected ? profileText : "Cliquez un profil"),
        cross,
      ),
      this.selected && this.selected.faces.length > 1
        ? el("p", { class: "text-gray-600 dark:text-gray-300" }, this.chosen.size === 0 ? "Cliquez une zone à extruder." : "Cliquez des zones pour choisir ce qui est extrudé ; recliquez pour en retirer.")
        : null,
      el("label", { class: "grid grid-cols-[4.5rem_1fr] items-center gap-1.5" }, "Départ", start),
      this.startOffset !== null ? el("label", { class: "grid grid-cols-[4.5rem_1fr] items-center gap-1.5" }, "Décalage", offset) : null,
      el("label", { class: "grid grid-cols-[4.5rem_1fr_auto] items-center gap-1.5" }, `Distance`, distance, flip),
      this.selected
        ? el("p", { class: "text-gray-600 dark:text-gray-300" }, "Ou cliquez un point, une arête ou une face d'un corps : sa mesure devient la distance.")
        : null,
      this.selected ? el("label", { class: "grid grid-cols-[4.5rem_1fr] items-center gap-1.5" }, "Arête", edgeTake) : null,
      el("label", { class: "grid grid-cols-[4.5rem_1fr] items-center gap-1.5" }, "Opération", operation),
      target,
    ];
    this.dialog.replaceChildren(...children.filter((c): c is HTMLElement => c !== null));
  }

  // ---- commit -----------------------------------------------------------------

  /** Stores it now (Entrée, or a moment after each whole setting), the tool staying open. */
  confirm(): void {
    this.store(true);
  }

  private store(loud = false): void {
    const profile = this.selected;
    if (!profile || this.chosen.size === 0) {
      if (loud) this.host.notify("Sélectionnez d'abord un profil à extruder.", "error");
      return;
    }
    if (this.operation !== "new" && !this.target) {
      if (loud) this.host.notify("Choisissez le corps cible (Joindre, Couper ou Intersection).", "error");
      return;
    }
    const doc = this.docBefore();
    // Chosen areas are stored only when they differ from the default (every material area).
    const defaults = this.defaultFaces(profile);
    const isDefault = this.chosen.size === defaults.length && defaults.every((f) => this.chosen.has(f));
    const chosen = [...this.chosen];
    const values: Pick<ExtrudeFeature, "sketch" | "distance" | "startOffset" | "operation" | "target" | "regions" | "regionKeys"> = {
      sketch: profile.sketch.id,
      regions: isDefault ? undefined : chosen.map((f) => f.probe),
      regionKeys: isDefault || !chosen.some((f) => f.key) ? undefined : chosen.map((f) => f.key ?? ""),
      distance: this.distance,
      startOffset: this.startOffset ? this.startOffset : undefined,
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
    const now = this.host.doc();
    if (JSON.stringify(next) === JSON.stringify(now)) return;
    const amend = !!this.stored && now === this.stored.doc;
    const base = amend ? this.stored!.base : now;
    this.host.change(next, amend);
    this.stored = { base, doc: this.host.doc(), id };
  }

  /** The cross, or Échap: closes; a setting still waiting is stored first, nothing done is taken back. */
  cancel(): void {
    if (this.storeTimer !== undefined) {
      window.clearTimeout(this.storeTimer);
      this.storeTimer = undefined;
      this.store();
    }
    this.close();
    this.host.closed(this.stored?.id ?? null);
  }

  private close(): void {
    window.clearTimeout(this.storeTimer);
    closeCalculator();
    this.arrow.dispose();
    this.marker.dispose();
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
