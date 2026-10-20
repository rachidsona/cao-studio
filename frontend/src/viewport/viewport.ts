/**
 * Three.js viewport: displays tessellated bodies sent by the geometry worker,
 * with a Z-up CAD camera, adaptive grid, axes, navigation gizmo, standard
 * views and face picking. It never computes geometry itself.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { SketchFrame, Vec3 } from "../sketcher/frame";
import type { BodyMesh } from "../geometry/protocol";
import { edgeAtVertex } from "./edge-geometry";
import { AdaptiveGrid } from "./grid";
import { SelectionLayer, type EdgePick, type FacePick, type ModelSelection, type SelectionFilter, type VertexPick } from "./selection-layer";
import { addDistinct, bodyVertices, type Point3 } from "./body-points";

export type { EdgePick, FacePick, ModelSelection, SelectionFilter, VertexPick } from "./selection-layer";

export type StandardView = "iso" | "front" | "back" | "top" | "bottom" | "left" | "right";


const VIEW_DIRECTIONS: Record<StandardView, [number, number, number]> = {
  iso: [1, -1, 0.8],
  front: [0, -1, 0],
  back: [0, 1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

/**
 * Receives canvas pointer events while a tool is active (sketch mode, extrusion…).
 * `down` returns true to take the pointer exclusively (handle drag): the camera
 * controls then ignore that gesture.
 */
export interface PointerHandler {
  down(event: PointerEvent): boolean;
  move(event: PointerEvent): void;
  up(event: PointerEvent, isClick: boolean): boolean;
}

interface SavedCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

interface BodyObject {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  data: BodyMesh;
}

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private labels = new CSS2DRenderer();
  private pointerHandler: PointerHandler | null = null;
  private exclusivePointer: number | null = null;
  private frameListeners = new Set<() => void>();
  private savedCamera: SavedCamera | null = null;
  private controls: OrbitControls;
  private viewHelper: ViewHelper;
  private grid = new AdaptiveGrid();
  /** Sketches drawn in the view when they are not being edited (one group per sketch). */
  private sketchGroup = new THREE.Group();
  /** Sharp where the sketch is in front, faint where a body hides it: sketches stay apparent. */
  private sketchMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb });
  private sketchGhostMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
  /** The selected sketch is drawn in rose, with its areas tinted. */
  private sketchSelectedMaterial = new THREE.LineBasicMaterial({ color: 0xe11d48 });
  private sketchSelectedGhostMaterial = new THREE.LineBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  private sketchFillMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  private sketchSelectedFillMaterial = new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  /** A sketch was clicked in the view (its id), or empty space was (null). */
  onSketchPick: (sketchId: string | null) => void = () => {};
  private bodies = new Map<string, BodyObject>();
  private bodyMaterial: THREE.MeshStandardMaterial;
  /** One subtle tint per body, so separate pieces (e.g. boards of a split frame) stand out. */
  private bodyMaterials: THREE.MeshStandardMaterial[] = [];
  private highlightMaterial: THREE.MeshStandardMaterial;
  private edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 });
  private raycaster = new THREE.Raycaster();
  private timer = new THREE.Timer();
  private selection: SelectionLayer;
  private pointerDown: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  onSelectionChange: (selection: ModelSelection) => void = () => {};
  private filter: SelectionFilter = "auto";

  /** What a click selects: edge then face (auto), only faces, only edges, only corners, or whole bodies. */
  get selectionFilter(): SelectionFilter {
    return this.filter;
  }

  set selectionFilter(filter: SelectionFilter) {
    this.filter = filter;
    this.refreshHints();
  }

  private refreshHints(): void {
    this.selection.setCornerHints(this.bodyVertices(), this.filter === "vertex");
  }

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add("block", "h-full", "w-full", "touch-none");
    // HTML labels (dimensions, constraint glyphs) drawn above the canvas.
    const labelLayer = this.labels.domElement;
    labelLayer.style.position = "absolute";
    labelLayer.style.inset = "0";
    labelLayer.style.pointerEvents = "none";
    container.appendChild(labelLayer);

    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.viewHelper = new ViewHelper(this.camera, this.renderer.domElement);
    this.viewHelper.center = this.controls.target;

    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8c4d1,
      metalness: 0.25,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.highlightMaterial = this.bodyMaterial.clone();
    for (const color of [0xb8c4d1, 0xc8bba4, 0xaec4b6, 0xbfb6cc, 0xb4c0d8, 0xcfc3a9]) {
      const material = this.bodyMaterial.clone();
      material.color.set(color);
      this.bodyMaterials.push(material);
    }
    this.highlightMaterial.color.set(0x0ea5e9);

    this.scene.add(this.sketchGroup);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, -2, 3);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(this.grid.object);
    this.scene.add(this.makeAxes());
    this.selection = new SelectionLayer(this.scene);

    this.setView("iso", 120);
    this.applyTheme();
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  private makeAxes(): THREE.Object3D {
    const axes = new THREE.AxesHelper(25);
    axes.setColors(new THREE.Color(0xef4444), new THREE.Color(0x22c55e), new THREE.Color(0x3b82f6));
    axes.renderOrder = 1;
    return axes;
  }

  /** Reads background colours from CSS so the scene follows the light/dark theme. */
  applyTheme(): void {
    const styles = getComputedStyle(this.container);
    const background = styles.getPropertyValue("--viewport-bg").trim() || "#e5e7eb";
    const gridColor = styles.getPropertyValue("--viewport-grid").trim() || "#9ca3af";
    this.renderer.setClearColor(new THREE.Color(background));
    this.grid.setColor(new THREE.Color(gridColor));
  }

  /**
   * Draws these sketches on their planes: curves (as polylines in sketch coordinates) and a translucent
   * fill of their closed areas, which makes them clickable. The selected one is highlighted.
   */
  setSketchLines(items: { id: string; frame: SketchFrame; polylines: [number, number][][]; regions: { outer: [number, number][]; holes: [number, number][][] }[]; selected: boolean }[]): void {
    for (const group of [...this.sketchGroup.children]) {
      this.sketchGroup.remove(group);
      group.traverse((child) => (child instanceof THREE.Line || child instanceof THREE.Mesh) && child.geometry.dispose());
    }
    for (const { id, frame, polylines, regions, selected } of items) {
      const group = new THREE.Group();
      group.userData.sketchId = id;
      group.matrixAutoUpdate = false;
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal));
      group.matrix.copy(basis.setPosition(new THREE.Vector3(...frame.origin)));
      for (const points of polylines) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
        const ghost = new THREE.Line(geometry, selected ? this.sketchSelectedGhostMaterial : this.sketchGhostMaterial);
        ghost.renderOrder = 4;
        const line = new THREE.Line(geometry, selected ? this.sketchSelectedMaterial : this.sketchMaterial);
        line.renderOrder = 5;
        ghost.userData.kind = line.userData.kind = "line";
        group.add(ghost, line);
      }
      for (const { outer, holes } of regions) {
        const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
        shape.holes = holes.map((hole) => new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), selected ? this.sketchSelectedFillMaterial : this.sketchFillMaterial);
        fill.renderOrder = 3;
        fill.userData.kind = "fill";
        group.add(fill);
      }
      this.sketchGroup.add(group);
    }
  }

  /** Sketch under the pointer: a curve within a few pixels, else (when nothing nearer hides it) the inside of an area. */
  private pickSketch(event: PointerEvent, what: "line" | "fill", nearerThan: number | null = null): string | null {
    const targets: THREE.Object3D[] = [];
    this.sketchGroup.traverse((o) => o.userData.kind === what && targets.push(o));
    const hit = this.intersect(event, targets, 6)[0];
    if (!hit || (nearerThan !== null && hit.distance > nearerThan + 1e-3)) return null;
    return (hit.object.parent?.userData.sketchId as string | undefined) ?? null;
  }

  /** Spacing of the grid lines now shown (mm): what drawing snaps to. */
  get gridStep(): number {
    return this.grid.currentStep;
  }

  setBodies(meshes: BodyMesh[]): void {
    for (const body of this.bodies.values()) this.disposeBody(body);
    this.bodies.clear();
    for (const [index, data] of meshes.entries()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      for (const group of data.faceGroups) geometry.addGroup(group.start, group.count, 0);
      geometry.computeBoundingSphere();
      const tint = this.bodyMaterials[index % this.bodyMaterials.length] as THREE.MeshStandardMaterial;
      const mesh = new THREE.Mesh(geometry, [tint, this.highlightMaterial]);
      mesh.userData.bodyId = data.bodyId;

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(data.edges, 3));
      const edges = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);
      edges.userData.bodyId = data.bodyId;
      this.scene.add(mesh, edges);
      this.bodies.set(data.bodyId, { mesh, edges, data });
    }
    // Keep the selected faces/edges that still exist after regeneration.
    const before = this.selection.count;
    this.selection.prune(this.bodies);
    this.selection.render(this.bodies);
    this.refreshHints();
    if (this.selection.count !== before) this.onSelectionChange(this.selection.snapshot());
  }

  /** Corners of the displayed bodies (model coordinates, mm), merged by position. */
  bodyVertices(): Point3[] {
    const all: Point3[] = [];
    for (const body of this.bodies.values()) for (const p of bodyVertices(body.data)) addDistinct(all, p);
    return all;
  }

  /** Corner of a displayed body within a few pixels of the pointer (the nearer one to the eye when they overlap). */
  pickVertex(event: PointerEvent): VertexPick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const reach = matchMedia("(pointer: coarse)").matches ? 18 : 11;
    let best: { pick: VertexPick; screen: number; depth: number } | null = null;
    const v = new THREE.Vector3();
    for (const body of this.bodies.values()) {
      for (const point of bodyVertices(body.data)) {
        v.set(...point).project(this.camera);
        if (v.z < -1 || v.z > 1) continue;
        const screen = Math.hypot(((v.x + 1) / 2) * rect.width - px, ((1 - v.y) / 2) * rect.height - py);
        if (screen > reach) continue;
        const depth = v.z;
        if (!best || screen < best.screen - 1 || (screen < best.screen + 1 && depth < best.depth)) {
          best = { pick: { bodyId: body.data.bodyId, point }, screen, depth };
        }
      }
    }
    return best?.pick ?? null;
  }

  private disposeBody(body: BodyObject): void {
    this.scene.remove(body.mesh, body.edges);
    body.mesh.geometry.dispose();
    body.edges.geometry.dispose();
  }

  private sceneBounds(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const body of this.bodies.values()) box.expandByObject(body.mesh);
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10));
    return box;
  }

  setView(view: StandardView, fixedDistance?: number): void {
    const box = this.sceneBounds();
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
    const distance = fixedDistance ?? this.fitDistance(radius);
    const direction = new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize();
    // Avoid a degenerate up vector when looking straight along Z.
    this.camera.up.set(0, 0, 1);
    if (Math.abs(direction.z) > 0.99) this.camera.up.set(0, 1, 0);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.lookAt(center);
    this.controls.update();
  }

  /** Camera distance that shows a sphere of `radius` in both directions of a possibly narrow view. */
  private fitDistance(radius: number): number {
    const vertical = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    return (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.05;
  }

  fit(): void {
    this.fitBox(this.sceneBounds());
  }

  /** Frames `box` keeping the current viewing direction; `margin` leaves room for labels. */
  fitBox(box: THREE.Box3, margin = 1): void {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max((box.getSize(new THREE.Vector3()).length() / 2) * margin, 1);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, this.fitDistance(radius));
    this.controls.update();
  }

  /** True when every corner of `box` is on screen (inside `inset` of the normalised view). */
  boxVisible(box: THREE.Box3, inset = 0.9): boolean {
    this.camera.updateMatrixWorld();
    const { min, max } = box;
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          const p = new THREE.Vector3(x, y, z).project(this.camera);
          if (Math.abs(p.x) > inset || Math.abs(p.y) > inset || p.z > 1) return false;
        }
      }
    }
    return true;
  }

  private bindPointer(): void {
    const canvas = this.renderer.domElement;
    // Capture phase on the container runs before OrbitControls' own listener on the canvas,
    // so a tool can claim a gesture (e.g. dragging a handle) before the camera reacts.
    this.container.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target !== canvas) return;
        this.pointerDown = { x: event.clientX, y: event.clientY };
        if (this.pointerHandler && event.button === 0 && this.pointerHandler.down(event)) {
          event.stopPropagation();
          canvas.setPointerCapture(event.pointerId);
          this.exclusivePointer = event.pointerId;
          this.controls.enabled = false;
        }
      },
      { capture: true },
    );
    canvas.addEventListener("pointermove", (event) => this.pointerHandler?.move(event));
    canvas.addEventListener("pointerup", (event) => {
      const start = this.pointerDown;
      this.pointerDown = null;
      if (this.exclusivePointer === event.pointerId) {
        this.exclusivePointer = null;
        this.controls.enabled = true;
      }
      // A click (not a drag) selects; drags belong to the camera controls.
      const isClick = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5;
      if (this.pointerHandler && event.button === 0) {
        if (this.pointerHandler.up(event, isClick)) return;
      }
      if (!isClick) return;
      if (!this.pointerHandler && this.viewHelper.handleClick(event)) return;
      if (!this.pointerHandler) this.selectAt(event);
    });
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
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Tessellation of a displayed body (edge/face picking by tools). */
  bodyMesh(bodyId: string): BodyMesh | undefined {
    return this.bodies.get(bodyId)?.data;
  }

  /** Face of a displayed body under the pointer. */
  pickFace(event: PointerEvent): FacePick | null {
    return this.pick(event);
  }

  /** Ray under the pointer, in world coordinates. */
  rayFromEvent(event: PointerEvent): { origin: Vec3; direction: Vec3 } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
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
   * Enters sketch mode: camera normal to the sketch plane, rotation disabled
   * (left button and one finger go to the sketch tools), bodies see-through.
   */
  enterSketch(frame: SketchFrame, handler: PointerHandler): void {
    this.savedCamera ??= {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      up: this.camera.up.clone(),
    };
    this.setPointerHandler(handler);
    const normal = new THREE.Vector3(...frame.normal);
    const origin = new THREE.Vector3(...frame.origin);
    const box = this.sceneBounds();
    const center = box.getCenter(new THREE.Vector3());
    // Project the scene centre onto the plane so the sketch area stays in view.
    const target = center.clone().sub(normal.clone().multiplyScalar(center.clone().sub(origin).dot(normal)));
    // Frame the part as seen along the normal: its depth along the normal does not matter.
    const size = box.getSize(new THREE.Vector3());
    const across = size.clone().sub(normal.clone().multiplyScalar(size.dot(normal)));
    const radius = Math.max(across.length() / 2, 30) * 1.15;
    this.camera.up.set(...frame.v);
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(normal, this.fitDistance(radius));
    this.camera.lookAt(target);
    this.controls.enableRotate = false;
    this.controls.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: -1 as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN };
    // Grid on the sketch plane (drawing-board look).
    this.grid.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.grid.object.position.copy(origin);
    this.setBodyOpacity(0.25);
    this.controls.update();
  }

  exitSketch(): void {
    this.pointerHandler = null;
    this.controls.enableRotate = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.grid.object.quaternion.identity();
    this.grid.object.position.set(0, 0, 0);
    this.setBodyOpacity(1);
    if (this.savedCamera) {
      this.camera.up.copy(this.savedCamera.up);
      this.camera.position.copy(this.savedCamera.position);
      this.controls.target.copy(this.savedCamera.target);
      this.savedCamera = null;
    }
    this.controls.update();
  }

  get inSketch(): boolean {
    return this.pointerHandler !== null;
  }

  private setBodyOpacity(opacity: number): void {
    for (const material of [...this.bodyMaterials, this.highlightMaterial, this.edgeMaterial]) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity === 1;
      material.needsUpdate = true;
    }
  }

  private pick(event: PointerEvent): FacePick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = [...this.bodies.values()].map((b) => b.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return null;
    const bodyId = hit.object.userData.bodyId as string;
    const groups = this.bodies.get(bodyId)?.data.faceGroups ?? [];
    const indexOffset = hit.faceIndex * 3;
    const faceIndex = groups.findIndex((g) => indexOffset >= g.start && indexOffset < g.start + g.count);
    return faceIndex < 0 ? null : { bodyId, faceIndex, point: hit.point.clone() };
  }

  /** Last click in model mode, to cycle through what lies under the same spot. */
  private lastClick: { x: number; y: number; index: number } | null = null;

  /**
   * Click in model mode. What lies under the pointer is listed by priority: a corner (filter "Points"),
   * a body edge (thin: it wins, a sketch along it must not steal it for a fillet), a sketch curve, the
   * inside of a sketch area in front of the body, the face, then a sketch area behind it. A click toggles
   * the first; clicking again at the same spot selects the next one instead (a sketch lying on a body, or
   * tied to its corners by coincidences, stays selectable). Empty space clears.
   */
  private selectAt(event: PointerEvent): void {
    const filter = this.selectionFilter;
    type Candidate = { kind: "vertex"; pick: VertexPick } | { kind: "edge"; pick: EdgePick } | { kind: "sketch"; id: string } | { kind: "face"; pick: FacePick };
    const list: Candidate[] = [];
    const vertex = filter === "vertex" ? this.pickVertex(event) : null;
    if (vertex) list.push({ kind: "vertex", pick: vertex });
    const edge = filter === "auto" || filter === "edge" ? this.pickEdge(event) : null;
    if (edge) list.push({ kind: "edge", pick: edge });
    const curve = this.pickSketch(event, "line");
    if (curve) list.push({ kind: "sketch", id: curve });
    const face = filter === "edge" || filter === "vertex" ? null : this.pick(event);
    const inFront = this.pickSketch(event, "fill", face ? face.point.distanceTo(this.camera.position) : null);
    if (inFront && inFront !== curve) list.push({ kind: "sketch", id: inFront });
    if (face) list.push({ kind: "face", pick: face });
    const behind = face ? this.pickSketch(event, "fill") : null;
    if (behind && behind !== curve && behind !== inFront) list.push({ kind: "sketch", id: behind });

    const again = this.lastClick && Math.hypot(event.clientX - this.lastClick.x, event.clientY - this.lastClick.y) <= 4 && list.length > 1;
    const index = again && this.lastClick ? (this.lastClick.index + 1) % list.length : 0;
    this.lastClick = { x: event.clientX, y: event.clientY, index };
    const chosen = list[index];
    // Cycling replaces what the previous click at this spot selected.
    if (again) this.selection.clear();
    if (chosen?.kind === "sketch") {
      this.selection.clear();
      this.selection.render(this.bodies);
      this.onSelectionChange(this.selection.snapshot());
      this.onSketchPick(chosen.id);
      return;
    }
    if (chosen?.kind === "vertex") this.selection.toggleVertex(chosen.pick);
    else if (chosen?.kind === "edge") this.selection.toggleEdge(chosen.pick);
    else if (chosen?.kind === "face" && filter === "body") this.selection.toggleBody(chosen.pick.bodyId);
    else if (chosen?.kind === "face") this.selection.toggleFace(chosen.pick);
    else this.selection.clear();
    this.selection.render(this.bodies);
    this.onSelectionChange(this.selection.snapshot());
    this.onSketchPick(null);
  }

  /** Edge of a displayed body under the pointer (within a few pixels). */
  pickEdge(event: PointerEvent): EdgePick | null {
    const lines = [...this.bodies.values()].map((b) => b.edges);
    const hit = this.intersect(event, lines, 6)[0];
    if (!hit || hit.index === undefined) return null;
    const bodyId = hit.object.userData.bodyId as string;
    const data = this.bodies.get(bodyId)?.data;
    const edgeIndex = data ? edgeAtVertex(data, hit.index) : -1;
    return edgeIndex < 0 ? null : { bodyId, edgeIndex };
  }

  /** Selects one whole body (from the browser), replacing the current selection. */
  selectBody(bodyId: string): void {
    this.selection.clear();
    if (this.bodies.has(bodyId)) this.selection.toggleBody(bodyId);
    this.selection.render(this.bodies);
    this.onSelectionChange(this.selection.snapshot());
  }

  clearSelection(): void {
    if (this.selection.empty) return;
    this.selection.clear();
    this.selection.render(this.bodies);
    this.onSelectionChange(this.selection.snapshot());
  }

  /** Dimension text displayed next to a selected edge. */
  setEdgeLabel(pick: EdgePick, text: string): void {
    this.selection.setEdgeLabel(pick, text);
    this.selection.render(this.bodies);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.labels.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update();
    const delta = this.timer.getDelta();
    if (this.viewHelper.animating) this.viewHelper.update(delta);
    this.controls.update();
    this.grid.update(this.camera.position.distanceTo(this.controls.target));
    for (const listener of this.frameListeners) listener();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    if (!this.pointerHandler) this.viewHelper.render(this.renderer);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const body of this.bodies.values()) this.disposeBody(body);
    this.controls.dispose();
    this.viewHelper.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.labels.domElement.remove();
  }
}
