/**
 * Three.js viewport: displays tessellated bodies sent by the geometry worker,
 * with a Z-up CAD camera, adaptive grid, axes, navigation gizmo, standard
 * views and face picking. It never computes geometry itself.
 *
 * Parts in their own modules: body-layer, sketch-layer, camera-rig, pointer-input, click-candidates,
 * window-pick, model-selector, hover-highlight.
 */
import * as THREE from "three";
import { Redraw, wakeOnInput } from "./redraw";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SketchFrame, Vec3 } from "../sketcher/frame";
import type { BodyMesh } from "../geometry/protocol";
import { BodyLayer, drawnEdgeAt, type BodyAppearance, type DrawnEdges, type FaceAppearance } from "./body-layer";
import type { Point3 } from "./body-points";
import * as rig from "./camera-rig";
import { clickCandidates } from "./click-candidates";
import { edgeAtVertex, pixelDistanceToSegment } from "./edge-geometry";
import { AdaptiveGrid, type GridArea } from "./grid";
import { HoverHighlight } from "./hover-highlight";
import { Preselection } from "./preselection";
import { THIN_CROSSHAIR } from "../ui/cursor";
import { setFatLineResolution } from "./fat-lines";
import { ModelSelector } from "./model-selector";
import { bindPointerInput, type PointerHandler } from "./pointer-input";
import type { EdgePick, FacePick, ModelSelection, SelectionFilter, SketchPick, VertexPick } from "./selection-layer";
import { SketchLayer, type PointerRays, type SketchDrawing } from "./sketch-layer";
import { windowPick } from "./window-pick";
import { WindowOverlay, type ScreenPoint } from "./window-select";

/** A finger rather than a mouse (an iPad, a phone): lighter drawing. */
const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

export type { EdgePick, FacePick, ModelSelection, SelectionFilter, SketchPick, VertexPick } from "./selection-layer";
export type { BodyAppearance } from "./body-layer";
export type { StandardView } from "./camera-rig";
export type { PointerHandler } from "./pointer-input";

type HoverTarget = { kind: "sketch"; id: string } | { kind: "body"; id: string; face: FacePick };

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private labels = new CSS2DRenderer();
  private pointerHandler: PointerHandler | null = null;
  private frameListeners = new Set<() => void>();
  private savedCamera: rig.CameraState | null = null;
  private controls: OrbitControls;
  private viewHelper: ViewHelper;
  private grid = new AdaptiveGrid();
  /** What the grid covers on the floor, outside a sketch. */
  gridArea: GridArea | null = null;
  private sketches: SketchLayer;
  private layer: BodyLayer;
  private hover: HoverHighlight;
  /** What a click would select, lit under the pointer (preselection.ts). */
  private preselection: Preselection;
  /** Sélection++ shows its own levels under the pointer: the pre-selection then gives way. */
  preselectSuspended = false;
  private selection: ModelSelector;
  private pointer: { windowDragging(): boolean };
  private raycaster = new THREE.Raycaster();
  private timer = new THREE.Timer();
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private readonly redraw = new Redraw();
  private drawOverride: (() => void) | null = null;
  private filter: SelectionFilter = "auto";
  private windowOverlay: WindowOverlay;
  /** A sketch was clicked in the view (its id), or empty space was (null). */
  onSketchPick: (sketchId: string | null) => void = () => {};
  onSelectionChange: (selection: ModelSelection) => void = () => {};
  /** "Fenêtre" button: a drag draws a selection window instead of turning the view (Maj + glisser does it anyway). */
  windowSelect = false;
  /** Sélection++: a click is handled there first (true: handled, the usual selection does not run). */
  clickOverride: ((event: PointerEvent) => boolean) | null = null;

  /** What a click selects: edge then face (auto), only faces, only edges, only corners, or whole bodies. */
  get selectionFilter(): SelectionFilter {
    return this.filter;
  }

  set selectionFilter(filter: SelectionFilter) {
    this.filter = filter;
    this.refreshHints();
  }

  /** The corners are no longer all dotted with the filter « Points »: the one under the pointer is marked (pre-selection). */
  private refreshHints(): void {
    this.selection.setCornerHints([], false);
  }

  private get bodies() {
    return this.layer.bodies;
  }

  get rig(): rig.CameraRig {
    return { camera: this.camera, controls: this.controls };
  }

  constructor(private readonly container: HTMLElement) {
    // Transparent: the view's background is a CSS gradient behind the canvas (applyTheme).
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // A finger's screen (an iPad, a phone) draws at 1.5 at most: the GPU's work grows with the square of it.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, COARSE ? 1.5 : 2));
    // Soft shadows of a fixed sun: a board throws its shadow on its neighbours (the inside of a niche is dark, the
    // underside of a shelf too), which gives the depth the plain shading alone does not. They change only with the
    // bodies (the sun is fixed): computed again then, not at each frame (markShadows).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    wakeOnInput(window, this.redraw);
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add("block", "h-full", "w-full", "touch-none");
    // HTML labels (dimensions, constraint glyphs) drawn above the canvas.
    const labelLayer = this.labels.domElement;
    labelLayer.style.position = "absolute";
    labelLayer.style.inset = "0";
    labelLayer.style.pointerEvents = "none";
    container.appendChild(labelLayer);
    this.windowOverlay = new WindowOverlay(container);

    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    rig.freeOrbit(this.controls);
    this.viewHelper = new ViewHelper(this.camera, this.renderer.domElement);
    this.viewHelper.center = this.controls.target;

    this.sketches = new SketchLayer(this.scene);
    // A studio to reflect for the appearances (metals, lacquers, glass), computed once.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.layer = new BodyLayer(this.scene, studio);
    pmrem.dispose();
    this.hover = new HoverHighlight(this.scene);
    this.preselection = new Preselection(this.scene);
    // Bodies are lit by the studio too, with a clear key light and a softer fill from the other side: the faces of a
    // board, its edge and its neighbour differ in brightness, so the shapes (a niche, a shelf) read at once.
    this.scene.environment = studio;
    this.scene.environmentIntensity = 0.35;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x70788a, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(1.2, -2, 3);
    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.3);
    fill.position.set(-2, 1.5, 1);
    this.camera.add(key, fill);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.camera);
    this.scene.add(this.grid.object);
    const axes = new THREE.AxesHelper(25);
    axes.setColors(new THREE.Color(0xef4444), new THREE.Color(0x22c55e), new THREE.Color(0x3b82f6));
    axes.renderOrder = 1;
    this.scene.add(axes);
    this.selection = new ModelSelector(this.scene, this.sketches, {
      bodies: () => this.bodies,
      changed: (selection) => this.onSelectionChange(selection),
      sketchPicked: (id) => this.onSketchPick(id),
    });

    this.setView("iso", 120);
    this.applyTheme();
    this.pointer = bindPointerInput({
      container,
      canvas: this.renderer.domElement,
      controls: this.controls,
      viewHelper: this.viewHelper,
      windowOverlay: this.windowOverlay,
      handler: () => this.pointerHandler,
      windowSelect: () => this.windowSelect,
      clickOverride: (event) => this.clickOverride?.(event) ?? false,
      select: (event) => this.selectAt(event),
      finishWindow: (start, end) => this.finishWindow(start, end),
    });
    // The cursor of the view: a cross of very thin lines (a tool's own cursor still wins over it).
    this.renderer.domElement.classList.add("cad-view");
    this.renderer.domElement.style.setProperty("--cad-cursor", THIN_CROSSHAIR);
    // The arrows at the ends of the selected edges keep their size on the screen.
    this.onEachFrame(() => this.selection.fitArrows(this.camera, this.renderer.domElement.clientHeight));
    // OrbitControls writes « cursor: auto » on the canvas when it starts: the stylesheet's cursor must show through.
    this.renderer.domElement.style.cursor = "";
    let frame = 0;
    this.renderer.domElement.addEventListener("pointermove", (event) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        this.preselect(event);
      });
    });
    this.renderer.domElement.addEventListener("pointerleave", () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      this.preselection.show(null, this.bodies);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  /** Reads background colours from CSS so the scene follows the light/dark theme. */
  applyTheme(): void {
    const styles = getComputedStyle(this.container);
    const background = styles.getPropertyValue("--viewport-bg").trim() || "#e5e7eb";
    const gridColor = styles.getPropertyValue("--viewport-grid").trim() || "#9ca3af";
    const gradient = styles.getPropertyValue("--viewport-gradient").trim();
    this.renderer.setClearColor(new THREE.Color(background), gradient ? 0 : 1);
    this.container.style.background = gradient;
    this.grid.setColor(new THREE.Color(gridColor));
  }

  /** The grid shown in the view, or hidden (the drawing still snaps to its spacing). */
  get gridVisible(): boolean { return this.grid.object.visible; }
  set gridVisible(on: boolean) { this.grid.object.visible = on; }

  /** Spacing of the grid lines now shown (mm): what drawing snaps to. */
  get gridStep(): number { return this.grid.currentStep; }

  // ---- sketches drawn in the view and bodies ------------------------------------------

  /**
   * Draws these sketches on their planes: curves (as polylines in sketch coordinates) and a translucent
   * fill of their closed areas, which makes them clickable. The selected one is highlighted.
   */
  setSketchLines(items: SketchDrawing[]): void {
    this.sketches.set(items);
    this.selection.sketchesDrawn(new Set(items.map((i) => i.id)));
  }

  /** Hides (or shows again) the joint lines between pieces that meet flush (Curic Hidden): the view only. */
  setJointsHidden(hidden: boolean): void { this.layer.setJointsHidden(hidden); }

  setBodies(meshes: BodyMesh[]): void {
    this.setHoverHighlight(null);
    this.layer.replace(meshes);
    this.markShadows();
    this.preselection.reset();
    this.aimSun();
    this.selection.bodiesChanged();
    this.refreshHints();
  }

  /**
   * Shows a body moved (a door open, a drawer out) without changing the model: a rotation (row-major 3×3) and a
   * translation applied to its mesh and edges; null puts it back. Lost at the next regeneration.
   */
  setBodyPose(bodyId: string, pose: { rotation: number[]; translation: Vec3 } | null): void { this.layer.setPose(bodyId, pose); this.markShadows(); }
  setBodyVisible(bodyId: string, visible: boolean): void { this.layer.setVisible(bodyId, visible); this.markShadows(); }
  /** The view changed (a tool, a panel): drawn again for a moment (redraw.ts). */
  invalidate(ms?: number): void { this.redraw.invalidate(ms); }
  /** The bodies changed (made again, moved, shown, hidden): their shadows are computed again, once. */
  markShadows(): void { this.renderer.shadowMap.needsUpdate = true; this.redraw.invalidate(); }

  /** Takes these bodies (the walls in the way) out of the view and out of reach, the others back in. */
  setCutaway(ids: ReadonlySet<string>): void { this.layer.setCut(ids); this.markShadows(); }
  isCutaway(bodyId: string): boolean { return this.layer.isCut(bodyId); }
  /** Draws these bodies (the walls of the room) behind what stands in their plane against them. */
  setBehind(ids: ReadonlySet<string>): void { this.layer.setBehind(ids); this.markShadows(); }
  /** Whether a body is drawn: neither hidden nor taken out of the view. */
  bodyInView(bodyId: string): boolean { return this.layer.bodies.get(bodyId)?.mesh.visible === true && !this.layer.isCut(bodyId); }
  setSketchCutaway(ids: ReadonlySet<string>): void { this.sketches.setCut(ids); }

  /** Where the eye is. */
  eye(): [number, number, number] { return this.camera.position.toArray() as [number, number, number]; }
  setXray(on: boolean): void { this.layer.setXray(on); }

  /** Colours the bodies by their material; null puts the plain tints back. Applied again to every regeneration. */
  setAppearance(appearance: ((bodyId: string) => BodyAppearance | null) | null, faces: ((bodyId: string) => FaceAppearance[]) | null = null): void {
    this.layer.setAppearance(appearance, faces);
  }

  /** Corners of the displayed bodies (model coordinates, mm), merged by position. */
  bodyVertices(): Point3[] { return this.layer.vertices(); }

  /** Thickness of a body under a point of its surface: how far a ray going in (along `inward`) travels inside it. */
  depthAt(bodyId: string, point: Vec3, inward: Vec3): number | null { return this.layer.depthAt(bodyId, point, inward); }

  bodyMesh(bodyId: string): BodyMesh | undefined { return this.bodies.get(bodyId)?.data; }

  get displayedBodies(): string[] { return [...this.bodies.keys()]; }
  /** Every body of the last regeneration, hidden ones included (set by the editor): the parts to make are read here. */
  modelBodies: readonly BodyMesh[] = [];

  // ---- camera -----------------------------------------------------------------------

  setView(view: rig.StandardView, fixedDistance?: number): void { rig.setView(this.rig, this.layer.bounds(), view, fixedDistance); }

  fit(): void { this.fitBox(this.bodiesBox()); }
  bodiesBox(): THREE.Box3 { return this.layer.bounds(); }

  /** The sun that casts the shadows: fixed in the scene, its shadow map covering the bodies. */
  private readonly sun = (() => {
    const light = new THREE.DirectionalLight(0xffffff, 0.9);
    light.castShadow = true;
    light.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
    light.shadow.radius = 3;
    return light;
  })();

  /** Half the diagonal of the bodies' box (mm), kept by `aimSun`. */
  private sceneRadius = 100;

  private aimSun(): void {
    const box = this.layer.bounds();
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
    this.sceneRadius = radius;
    this.sun.position.copy(centre).addScaledVector(new THREE.Vector3(-0.6, -1, 1.6).normalize(), radius * 3);
    this.sun.target.position.copy(centre);
    const camera = this.sun.shadow.camera;
    camera.left = camera.bottom = -radius * 1.2;
    camera.right = camera.top = radius * 1.2;
    camera.near = radius * 0.5;
    camera.far = radius * 6;
    camera.updateProjectionMatrix();
    // The offsets keep a board from shadowing itself (the units are millimetres).
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = Math.max(radius * 0.0015, 0.2);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
  }

  /** Where the camera is (for saved views, scenes). */
  cameraState(): rig.CameraState { return rig.cameraState(this.rig); }

  /** Puts the camera back where `cameraState` read it. */
  setCameraState(state: rig.CameraState): void { rig.setCameraState(this.rig, state); }

  /** Frames `box` keeping the current viewing direction; `margin` leaves room for labels. */
  fitBox(box: THREE.Box3, margin = 1): void { rig.fitBox(this.rig, box, margin); }

  /** True when every corner of `box` is on screen (inside `inset` of the normalised view). */
  boxVisible(box: THREE.Box3, inset = 0.9): boolean { return rig.boxVisible(this.camera, box, inset); }

  /**
   * Enters sketch mode: camera normal to the sketch plane, rotation disabled
   * (left button and one finger go to the sketch tools), bodies see-through.
   */
  enterSketch(frame: SketchFrame, handler: PointerHandler): void {
    this.savedCamera ??= this.cameraState();
    this.setPointerHandler(handler);
    rig.viewSketchPlane(this.rig, this.layer.bounds(), frame);
    // Grid on the sketch plane (drawing-board look).
    this.grid.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...frame.normal));
    this.grid.object.position.set(...frame.origin);
    this.layer.setOpacity(0.25);
    this.controls.update();
  }

  exitSketch(): void {
    this.pointerHandler = null;
    rig.freeOrbit(this.controls);
    this.grid.object.quaternion.identity();
    this.grid.object.position.set(0, 0, 0);
    this.layer.setOpacity(1);
    if (this.savedCamera) {
      this.setCameraState(this.savedCamera);
      this.savedCamera = null;
    }
    this.controls.update();
  }

  get inSketch(): boolean { return this.pointerHandler !== null; }

  // ---- pointer and picking -------------------------------------------------------------

  /** Gives the view back, when this tool still has it (another one may have taken it since). */
  releasePointerHandler(handler: PointerHandler): void {
    if (this.pointerHandler === handler) this.pointerHandler = null;
  }

  /** Installs (or removes) the tool receiving pointer events, without changing the camera. */
  setPointerHandler(handler: PointerHandler | null): void {
    this.pointerHandler = handler;
    if (handler) this.clearSelection();
  }

  /** Runs `listener` before every rendered frame (screen-size gizmos); returns a remover. */
  onEachFrame(listener: () => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Objects under the pointer, nearest first; lines are hit within `linePx` screen pixels. */
  intersect(event: PointerEvent, objects: THREE.Object3D[], linePx = 6): THREE.Intersection[] {
    this.rayFromEvent(event);
    this.raycaster.params.Line = { threshold: linePx * this.worldPerPixel() };
    return this.shownHits(this.raycaster.intersectObjects(objects, true));
  }

  /** The plane of the section shown (setSection), null without one: what lies on its far side is hidden. */
  private sectionPlane: THREE.Plane | null = null;

  /**
   * Hits the eye can see: not those the section hides (audit of 11/11/2026: a click went through the cut to the part
   * hidden by it). The renderer clips where the plane's distance is negative.
   */
  private shownHits(hits: THREE.Intersection[]): THREE.Intersection[] {
    const plane = this.sectionPlane;
    return plane ? hits.filter((h) => plane.distanceToPoint(h.point) >= -1e-6) : hits;
  }

  /** The bodies' faces under the ray cast last, the nearest shown first. */
  private meshHits(): THREE.Intersection[] {
    return this.shownHits(this.raycaster.intersectObjects(this.layer.shownMeshes(), false));
  }

  private rays(event: PointerEvent): PointerRays {
    return { intersect: (objects, linePx) => this.intersect(event, objects, linePx), screenDistance: (p) => this.screenDistance(event, p) };
  }

  /** Face of a displayed body under the pointer. */
  pickFace(event: PointerEvent): FacePick | null {
    this.rayFromEvent(event);
    const hit = this.meshHits()[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    const bodyId = hit.object.userData.bodyId as string;
    const groups = this.bodies.get(bodyId)?.data.faceGroups ?? [];
    const indexOffset = hit.faceIndex * 3;
    const faceIndex = groups.findIndex((g) => indexOffset >= g.start && indexOffset < g.start + g.count);
    return faceIndex < 0 ? null : { bodyId, faceIndex, point: hit.point.clone() };
  }

  /**
   * Edge of a displayed body under the pointer (within a few pixels): the line nearest the pointer on the screen —
   * not the one nearest the eye, which is often a neighbour where lines are close (the faces of a double side) —
   * among those not hidden behind a face.
   */
  pickEdge(event: PointerEvent): EdgePick | null {
    const hits = this.intersect(event, this.layer.shownEdges(), 16);
    if (hits.length === 0) return null;
    // The first face under the pointer: an edge farther than it (beyond a margin of a few pixels) is hidden.
    const face = this.meshHits()[0];
    const pixelAt = (depth: number) => (2 * depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / (this.renderer.domElement.clientHeight || 1);
    const hidden = face ? face.distance + 24 * pixelAt(face.distance) : Infinity;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
    const onScreen = (v: THREE.Vector3): [number, number] => {
      const p = v.clone().project(this.camera);
      return [((p.x + 1) / 2) * rect.width, ((1 - p.y) / 2) * rect.height];
    };
    let hit: THREE.Intersection | undefined;
    let nearest = 7;
    for (const candidate of hits) {
      if (candidate.index === undefined || candidate.distance > hidden) continue;
      const position = (candidate.object as THREE.LineSegments).geometry.getAttribute("position");
      const a = new THREE.Vector3().fromBufferAttribute(position, candidate.index).applyMatrix4(candidate.object.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(position, candidate.index + 1).applyMatrix4(candidate.object.matrixWorld);
      const px = pixelDistanceToSegment(pointer, onScreen(a), onScreen(b));
      // Nearer on the screen wins; at the same place (within half a pixel), the one in front.
      if (px < nearest - 0.5 || (hit && Math.abs(px - nearest) <= 0.5 && candidate.distance < hit.distance)) {
        hit = candidate;
        nearest = Math.min(nearest, px);
      }
    }
    if (!hit || hit.index === undefined) return null;
    const bodyId = hit.object.userData.bodyId as string;
    // The lines drawn leave the seams out: their own table says which edge a vertex is.
    const groups = hit.object.userData.drawnGroups as DrawnEdges["groups"] | undefined;
    const data = this.bodies.get(bodyId)?.data;
    const edgeIndex = groups ? drawnEdgeAt(groups, hit.index) : data ? edgeAtVertex(data, hit.index) : -1;
    return edgeIndex < 0 ? null : { bodyId, edgeIndex };
  }

  /** Corner of a displayed body within a few pixels of the pointer (the nearer one to the eye when they overlap). */
  pickVertex(event: PointerEvent): VertexPick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const reach = matchMedia("(pointer: coarse)").matches ? 18 : 11;
    return this.layer.vertexNear(this.camera, rect, event.clientX - rect.left, event.clientY - rect.top, reach);
  }

  /**
   * One element of a sketch drawn in the view, under the pointer: a point (within a few pixels), a curve,
   * or the inside of an area (only when nothing nearer, like a body face, hides it).
   */
  pickSketchItem(event: PointerEvent, kind: SketchPick["kind"], nearerThan: number | null = null): (SketchPick & { distance: number }) | null {
    return this.sketches.pickItem(this.rays(event), kind, nearerThan);
  }

  /**
   * The camera and the bodies placed as they are now, before a ray is cast: no image may have been drawn since they
   * changed (redraw.ts, the view draws on demand), and the renderer is what usually brings them up to date.
   */
  private freshMatrices(): void {
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
  }

  /** Ray under the pointer, in world coordinates. */
  rayFromEvent(event: PointerEvent): { origin: Vec3; direction: Vec3 } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.freshMatrices();
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    return { origin: [origin.x, origin.y, origin.z], direction: [direction.x, direction.y, direction.z] };
  }

  /** Distance in screen pixels between the pointer and a point of the model (Infinity when it is behind the eye). */
  screenDistance(event: PointerEvent, p: Vec3): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(...p).project(this.camera);
    if (v.z < -1 || v.z > 1) return Infinity;
    return Math.hypot(((v.x + 1) / 2) * rect.width - (event.clientX - rect.left), ((1 - v.y) / 2) * rect.height - (event.clientY - rect.top));
  }

  /** Size of one screen pixel at the camera target, in mm (used for pick tolerances). */
  worldPerPixel(): number {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const height = this.renderer.domElement.clientHeight || 1;
    return (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / height;
  }

  /**
   * What the pointer is over (Sélection++, as Curic Select++): a sketch line or area in front, else the face
   * of a body. Nothing while a tool or a selection window has the pointer.
   */
  hoverTarget(event: PointerEvent): HoverTarget | null {
    if (this.pointerHandler || this.pointer.windowDragging()) return null;
    return this.hoverTargetForTool(event);
  }

  /** The same, for a tool that has the pointer (a click choosing a body or a sketch). */
  hoverTargetForTool(event: PointerEvent): HoverTarget | null {
    const face = this.pickFace(event);
    const rays = this.rays(event);
    const sketch = this.sketches.pick(rays, "line") ?? this.sketches.pick(rays, "fill", face ? face.point.distanceTo(this.camera.position) : null);
    if (sketch) return { kind: "sketch", id: sketch };
    return face ? { kind: "body", id: face.bodyId, face } : null;
  }

  // ---- selection --------------------------------------------------------------------

  /** Click in model mode: what lies under the pointer goes to the selection (see click-candidates, model-selector). */
  /**
   * Lights what a click here would select (the same choice as the click, with the filter of the selection); nothing
   * while a tool, a drag, a selection window or Sélection++ has the pointer, nor for a finger (no hover).
   */
  private preselect(event: PointerEvent): void {
    if (this.pointerHandler || this.pointer.windowDragging() || event.buttons !== 0 || event.pointerType === "touch" || this.preselectSuspended) {
      this.preselection.show(null, this.bodies);
      return;
    }
    const rays = this.rays(event);
    const list = clickCandidates(this.filter, {
      vertex: () => this.pickVertex(event),
      edge: () => this.pickEdge(event),
      face: () => this.pickFace(event),
      item: (kind, nearerThan = null) => this.sketches.pickItem(rays, kind, nearerThan),
      sketch: (what, nearerThan = null) => this.sketches.pick(rays, what, nearerThan),
      screenDistance: (p) => this.screenDistance(event, p),
      eyeDistance: (point) => point.distanceTo(this.camera.position),
    });
    this.preselection.show(list[0] ?? null, this.bodies, this.filter === "body");
  }

  private selectAt(event: PointerEvent): void {
    const rays = this.rays(event);
    const list = clickCandidates(this.filter, {
      vertex: () => this.pickVertex(event),
      edge: () => this.pickEdge(event),
      face: () => this.pickFace(event),
      item: (kind, nearerThan = null) => this.sketches.pickItem(rays, kind, nearerThan),
      sketch: (what, nearerThan = null) => this.sketches.pick(rays, what, nearerThan),
      screenDistance: (p) => this.screenDistance(event, p),
      eyeDistance: (point) => point.distanceTo(this.camera.position),
    });
    // Ctrl, Cmd or Maj: adds whole bodies and sketches to the selection (several at once), as in Fusion.
    this.selection.click(list, { x: event.clientX, y: event.clientY }, this.filter, event.shiftKey || event.ctrlKey || event.metaKey);
  }

  /** Ends a selection window: the bodies and sketches it holds are added to the selection. */
  private finishWindow(start: ScreenPoint, end: ScreenPoint): void {
    const canvas = this.renderer.domElement;
    const taken = windowPick(start, end, {
      camera: this.camera,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      bodies: this.bodies,
      sketches: this.sketches.polylines(),
      bodyAt: (x, y) => {
        this.freshMatrices();
        this.raycaster.setFromCamera(new THREE.Vector2((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2), this.camera);
        return (this.meshHits()[0]?.object.userData.bodyId as string | undefined) ?? null;
      },
    });
    this.selection.addWindow(taken.bodies, taken.sketches);
  }

  /** Adds or removes a whole body or sketch (Ctrl/Maj + clic in the browser). */
  toggleInSelection(kind: "body" | "sketch", id: string): void { this.selection.toggle(kind, id); }

  /** Sélection++: selects what a level holds (see ModelSelector.level). */
  selectLevel(target: { bodies: string[] } | { face: FacePick } | { sketches: string[] } | { item: SketchPick }, adding: boolean): void {
    this.selection.level(target, adding);
  }

  /** Selects one whole body (from the browser), replacing the current selection. */
  selectBody(bodyId: string): void { this.selection.selectBody(bodyId); }

  clearSelection(): void { this.selection.clear(); }

  /** Dimension text displayed next to a selected edge. */
  setEdgeLabel(pick: EdgePick, text: string): void { this.selection.setEdgeLabel(pick, text); }

  /** The distance shown between two selected parallel edges (null: none). */
  setEdgeGap(gap: { from: THREE.Vector3; to: THREE.Vector3; text: string } | null): void { this.selection.setEdgeGap(gap); }

  /**
   * Shows in green what a click would select: whole bodies (edges over everything, faces tinted), or one face of
   * a body; null removes it.
   */
  setHoverHighlight(target: { bodies: string[] } | { face: FacePick } | null): void { this.hover.set(target, this.bodies); }

  /**
   * Section of the view (as Curic Section): what lies beyond the plane perpendicular to `axis` at `position` is
   * hidden (with `flip`, what lies before it); null shows everything again. The view only: nothing is cut.
   */
  setSection(section: { axis: 0 | 1 | 2; position: number; flip: boolean } | null): void {
    const normal = new THREE.Vector3();
    if (section) normal.setComponent(section.axis, section.flip ? 1 : -1);
    const planes = section ? [new THREE.Plane(normal, section.flip ? -section.position : section.position)] : [];
    this.sectionPlane = planes[0] ?? null;
    this.renderer.localClippingEnabled = planes.length > 0;
    for (const material of [...this.layer.materials(), ...this.hover.materials(), ...this.sketches.materials()]) {
      material.clippingPlanes = planes;
      material.needsUpdate = true;
    }
  }

  // ---- rendering --------------------------------------------------------------------

  private resize(): void {
    this.redraw.invalidate();
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    setFatLineResolution(clientWidth, clientHeight);
    this.labels.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The depth range of the camera follows its distance: a fixed one (0.1 mm to 100 m) leaves about 2 mm of depth
   * precision at 2 m, so the faces of two boards that meet, and the edges over them, fight and show as dotted lines.
   * The near plane at 1/200 of the distance keeps it under a hundredth of a millimetre and still lets one look close.
   */
  private fitClipping(distance: number): void {
    const near = Math.max(distance / 200, 0.05);
    const far = Math.max(distance * 60, this.sceneRadius * 40, 1000);
    if (Math.abs(this.camera.near - near) < near * 0.05 && Math.abs(this.camera.far - far) < far * 0.05) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update();
    const delta = this.timer.getDelta();
    if (this.viewHelper.animating) this.viewHelper.update(delta);
    if (this.controls.update()) this.redraw.invalidate(500);
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.fitClipping(distance);
    this.grid.update(distance, this.savedCamera ? null : this.gridArea);
    for (const listener of this.frameListeners) listener();
    // Nothing changed for a while: the last image stays (redraw.ts); the render mode draws its passes always.
    if (!this.redraw.due && !this.viewHelper.animating && !this.drawOverride) return;
    this.renderer.clear();
    if (this.drawOverride) this.drawOverride();
    else {
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    }
    if (!this.pointerHandler) this.viewHelper.render(this.renderer);
  };

  /** Render mode (render/render-mode.ts) draws each frame instead of the editing scene; its labels are hidden meanwhile. */
  setDrawOverride(draw: (() => void) | null): void {
    this.drawOverride = draw;
    this.labels.domElement.style.display = draw ? "none" : "";
  }

  /** The meshes of the displayed bodies (with their pose), for the render. */
  bodyMeshes(): THREE.Mesh[] { return this.layer.meshes(); }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.layer.dispose();
    this.controls.dispose();
    this.viewHelper.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.labels.domElement.remove();
    this.windowOverlay.dispose();
  }
}
