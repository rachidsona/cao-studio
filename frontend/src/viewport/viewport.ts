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
import { SelectionLayer, type EdgePick, type FacePick, type ModelSelection, type SelectionFilter, type SketchPick, type VertexPick } from "./selection-layer";
import { addDistinct, bodyVertices, type Point3 } from "./body-points";
import { takenByWindow, windowFrom, WindowOverlay, type ScreenPoint } from "./window-select";

export type { EdgePick, FacePick, ModelSelection, SelectionFilter, SketchPick, VertexPick } from "./selection-layer";

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
  /** The plain colour of the body, put back when it has no appearance. */
  tint: THREE.Material;
}

/** How a body looks when it has a material (cabinet making): its colour, and a wood grain along an axis. */
export interface BodyAppearance {
  color: string;
  wood?: boolean;
  /** Axis of the grain (the boards' length): the stripes run along it. */
  grainAxis?: 0 | 1 | 2;
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
  private appearance: ((bodyId: string) => BodyAppearance | null) | null = null;
  private appearanceMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private bodyOpacity = 1;
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
  /** "Fenêtre" button: a drag draws a selection window instead of turning the view (Maj + glisser does it anyway). */
  windowSelect = false;
  private windowDrag: { pointerId: number; start: ScreenPoint; end: ScreenPoint } | null = null;
  private windowOverlay: WindowOverlay;

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
    this.windowOverlay = new WindowOverlay(container);

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
  setSketchLines(
    items: {
      id: string;
      frame: SketchFrame;
      curves: { id: string; points: [number, number][] }[];
      points: { id: string; at: [number, number] }[];
      regions: { outer: [number, number][]; holes: [number, number][][] }[];
      selected: boolean;
    }[],
  ): void {
    for (const group of [...this.sketchGroup.children]) {
      this.sketchGroup.remove(group);
      group.traverse((child) => (child instanceof THREE.Line || child instanceof THREE.Mesh) && child.geometry.dispose());
    }
    for (const { id, frame, curves, points, regions, selected } of items) {
      const group = new THREE.Group();
      group.userData.sketchId = id;
      group.userData.points = points;
      group.userData.selected = selected;
      group.matrixAutoUpdate = false;
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.u), new THREE.Vector3(...frame.v), new THREE.Vector3(...frame.normal));
      group.matrix.copy(basis.setPosition(new THREE.Vector3(...frame.origin)));
      for (const curve of curves) {
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
        const ghost = new THREE.Line(geometry, selected ? this.sketchSelectedGhostMaterial : this.sketchGhostMaterial);
        ghost.renderOrder = 4;
        ghost.userData.ghost = true;
        const line = new THREE.Line(geometry, selected ? this.sketchSelectedMaterial : this.sketchMaterial);
        line.renderOrder = 5;
        ghost.userData.kind = line.userData.kind = "line";
        ghost.userData.curveId = line.userData.curveId = curve.id;
        group.add(ghost, line);
      }
      for (const [index, { outer, holes }] of regions.entries()) {
        const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
        shape.holes = holes.map((hole) => new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
        const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), selected ? this.sketchSelectedFillMaterial : this.sketchFillMaterial);
        fill.renderOrder = 3;
        fill.userData.kind = "fill";
        fill.userData.regionIndex = index;
        fill.userData.area = Math.abs(THREE.ShapeUtils.area(shape.getPoints())) - holes.reduce((sum, h) => sum + Math.abs(THREE.ShapeUtils.area(h.map(([x, y]) => new THREE.Vector2(x, y)))), 0);
        group.add(fill);
      }
      this.sketchGroup.add(group);
    }
    // Picked sketches and sketch elements no longer drawn (hidden, deleted, being edited) are dropped.
    if (this.selection.pruneSketch(new Set(items.map((i) => i.id)))) this.emitSelection();
    else this.paintSketches();
  }

  /** Draws in rose the sketch selected alone (in the browser) and the sketches of a multiple selection. */
  private paintSketches(): void {
    for (const group of this.sketchGroup.children) {
      const on = group.userData.selected === true || this.selection.sketches.includes(group.userData.sketchId as string);
      for (const child of group.children) {
        if (child.userData.kind === "fill") (child as THREE.Mesh).material = on ? this.sketchSelectedFillMaterial : this.sketchFillMaterial;
        else if (child.userData.kind === "line") {
          const ghost = child.userData.ghost === true;
          (child as THREE.Line).material = on ? (ghost ? this.sketchSelectedGhostMaterial : this.sketchSelectedMaterial) : ghost ? this.sketchGhostMaterial : this.sketchMaterial;
        }
      }
    }
  }

  private emitSelection(): void {
    this.selection.render(this.bodies);
    this.paintSketches();
    this.onSelectionChange(this.selection.snapshot());
  }

  /** The sketch selected alone in the browser joins a multiple selection being made (Ctrl/Maj + clic, window). */
  private carryAloneSketch(): void {
    const alone = this.sketchGroup.children.find((g) => g.userData.selected === true)?.userData.sketchId as string | undefined;
    if (alone) this.selection.add([], [alone]);
  }

  /** Adds or removes a whole body or sketch (Ctrl/Maj + clic in the browser). */
  toggleInSelection(kind: "body" | "sketch", id: string): void {
    this.carryAloneSketch();
    if (kind === "sketch") this.selection.toggleSketch(id);
    else if (this.bodies.has(id)) this.selection.toggleBody(id);
    this.emitSelection();
    this.onSketchPick(null);
  }

  /**
   * One element of a sketch drawn in the view, under the pointer: a point (within a few pixels), a curve,
   * or the inside of an area (only when nothing nearer, like a body face, hides it).
   */
  pickSketchItem(event: PointerEvent, kind: SketchPick["kind"], nearerThan: number | null = null): (SketchPick & { distance: number }) | null {
    this.sketchGroup.updateMatrixWorld(true);
    if (kind === "point") {
      let best: (SketchPick & { distance: number }) | null = null;
      for (const group of this.sketchGroup.children) {
        for (const p of (group.userData.points ?? []) as { id: string; at: [number, number] }[]) {
          const w = new THREE.Vector3(p.at[0], p.at[1], 0).applyMatrix4(group.matrixWorld);
          const d = this.screenDistance(event, [w.x, w.y, w.z]);
          if (d <= 10 && (!best || d < best.distance)) best = { sketchId: group.userData.sketchId as string, kind, id: p.id, points: [[w.x, w.y, w.z]], distance: d };
        }
      }
      return best;
    }
    const targets: THREE.Object3D[] = [];
    this.sketchGroup.traverse((o) => o.userData.kind === (kind === "curve" ? "line" : "fill") && targets.push(o));
    const hit = this.intersect(event, targets, 6)[0];
    if (!hit || (nearerThan !== null && hit.distance > nearerThan + 1e-3)) return null;
    const object = hit.object as THREE.Mesh | THREE.Line;
    const sketchId = object.parent?.userData.sketchId as string;
    const world = (object.geometry.getAttribute("position") as THREE.BufferAttribute);
    const points: Point3[] = [];
    for (let i = 0; i < world.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(world, i).applyMatrix4(object.matrixWorld);
      points.push([v.x, v.y, v.z]);
    }
    if (kind === "curve") {
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1], points[i]![2] - points[i - 1]![2]);
      return { sketchId, kind, id: object.userData.curveId as string, points, measure: length, distance: hit.distance };
    }
    return {
      sketchId,
      kind,
      id: String(object.userData.regionIndex),
      points: [],
      measure: object.userData.area as number,
      fill: { geometry: object.geometry.clone(), matrix: object.matrixWorld.clone() },
      distance: hit.distance,
    };
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
    this.setHoverHighlight(null);
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
      this.bodies.set(data.bodyId, { mesh, edges, data, tint });
    }
    this.applyAppearance();
    // Keep the selected faces/edges that still exist after regeneration.
    const before = this.selection.count;
    this.selection.prune(this.bodies);
    this.selection.render(this.bodies);
    this.refreshHints();
    if (this.selection.count !== before) this.onSelectionChange(this.selection.snapshot());
  }

  /** Colours the bodies by their material; null puts the plain tints back. Applied again to every regeneration. */
  setAppearance(appearance: ((bodyId: string) => BodyAppearance | null) | null): void {
    this.appearance = appearance;
    this.applyAppearance();
  }

  private applyAppearance(): void {
    for (const [id, body] of this.bodies) {
      const look = this.appearance?.(id);
      (body.mesh.material as THREE.Material[])[0] = look ? this.appearanceMaterial(look) : body.tint;
    }
  }

  /** One material per look; the wood grain is stripes in world space along the grain axis, drawn by the shader. */
  private appearanceMaterial(look: BodyAppearance): THREE.MeshStandardMaterial {
    const wood = look.wood === true;
    const axis = look.grainAxis ?? 0;
    const key = `${look.color}|${wood}|${axis}`;
    let material = this.appearanceMaterials.get(key);
    if (material) return material;
    material = (this.bodyMaterials[0] as THREE.MeshStandardMaterial).clone();
    material.color.set(look.color);
    material.metalness = 0;
    material.roughness = wood ? 0.75 : 0.6;
    material.transparent = this.bodyOpacity < 1;
    material.opacity = this.bodyOpacity;
    material.depthWrite = this.bodyOpacity === 1;
    if (wood) {
      const across = [1, 1, 1].map((c, i) => (i === axis ? 0 : c));
      const length = Math.hypot(...across);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uAcross = { value: new THREE.Vector3(...across).divideScalar(length) };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nuniform vec3 uAcross;")
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n{ float t = dot(vWorld, uAcross) * 0.35; float ring = sin(t + 2.2 * sin(t * 0.21) + 0.9 * sin(dot(vWorld, vec3(0.013, 0.011, 0.017)))); diffuseColor.rgb *= 0.84 + 0.16 * (0.5 + 0.5 * ring) + 0.05 * sin(t * 5.3); }",
          );
      };
      material.customProgramCacheKey = () => key;
    }
    material.clippingPlanes = (this.bodyMaterials[0] as THREE.Material).clippingPlanes;
    this.appearanceMaterials.set(key, material);
    return material;
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
        if (this.windowDrag) {
          // A second finger: the window gives way to the camera.
          this.windowDrag = null;
          this.windowOverlay.hide();
          return;
        }
        this.pointerDown = { x: event.clientX, y: event.clientY };
        if (!this.pointerHandler && event.button === 0 && (event.shiftKey || this.windowSelect)) {
          // Window selection: Maj + glisser, or any drag while the "Fenêtre" button is on.
          event.stopPropagation();
          canvas.setPointerCapture(event.pointerId);
          const at = this.canvasPoint(event);
          this.windowDrag = { pointerId: event.pointerId, start: at, end: at };
          return;
        }
        if (this.pointerHandler && event.button === 0 && this.pointerHandler.down(event)) {
          event.stopPropagation();
          canvas.setPointerCapture(event.pointerId);
          this.exclusivePointer = event.pointerId;
          this.controls.enabled = false;
        }
      },
      { capture: true },
    );
    canvas.addEventListener("pointermove", (event) => {
      if (this.windowDrag?.pointerId === event.pointerId) {
        this.windowDrag.end = this.canvasPoint(event);
        if (Math.hypot(this.windowDrag.end[0] - this.windowDrag.start[0], this.windowDrag.end[1] - this.windowDrag.start[1]) > 5) this.windowOverlay.show(this.windowDrag.start, this.windowDrag.end);
        return;
      }
      this.pointerHandler?.move(event);
    });
    canvas.addEventListener("pointercancel", () => {
      this.windowDrag = null;
      this.windowOverlay.hide();
    });
    canvas.addEventListener("pointerup", (event) => {
      const start = this.pointerDown;
      this.pointerDown = null;
      const drag = this.windowDrag?.pointerId === event.pointerId ? this.windowDrag : null;
      if (drag) {
        this.windowDrag = null;
        this.windowOverlay.hide();
        drag.end = this.canvasPoint(event);
        // A click without dragging stays a click (Maj + clic adds to the selection).
        if (Math.hypot(drag.end[0] - drag.start[0], drag.end[1] - drag.start[1]) <= 5) {
          if (!this.clickOverride?.(event)) this.selectAt(event);
        }
        else this.finishWindow(drag.start, drag.end);
        return;
      }
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
      if (!this.pointerHandler && this.clickOverride?.(event)) return;
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

  /** Thickness of a body under a point of its surface: how far a ray going in (along `inward`) travels inside it. */
  depthAt(bodyId: string, point: Vec3, inward: Vec3): number | null {
    const body = this.bodies.get(bodyId);
    if (!body) return null;
    const ray = new THREE.Raycaster(new THREE.Vector3(...point).addScaledVector(new THREE.Vector3(...inward), 1e-3), new THREE.Vector3(...inward).normalize());
    const hit = ray.intersectObject(body.mesh, false)[0];
    return hit ? hit.distance + 1e-3 : null;
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
    this.bodyOpacity = opacity;
    for (const material of [...this.bodyMaterials, ...this.appearanceMaterials.values(), this.highlightMaterial, this.edgeMaterial]) {
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
    // Ctrl, Cmd or Maj: adds whole bodies and sketches to the selection (several at once), as in Fusion.
    const adding = event.shiftKey || event.ctrlKey || event.metaKey;
    type Candidate =
      | { kind: "vertex"; pick: VertexPick }
      | { kind: "edge"; pick: EdgePick }
      | { kind: "sketch"; id: string }
      | { kind: "face"; pick: FacePick }
      | { kind: "item"; pick: SketchPick };
    const list: Candidate[] = [];
    if (filter === "vertex" || filter === "edge" || filter === "face") {
      // "Points", "Arêtes", "Faces": the corners, edges and faces of bodies, and the points, curves and areas of sketches.
      if (filter === "vertex") {
        const vertex = this.pickVertex(event);
        const point = this.pickSketchItem(event, "point");
        const vertexDistance = vertex ? this.screenDistance(event, vertex.point) : Infinity;
        if (point && point.distance <= vertexDistance) list.push({ kind: "item", pick: point });
        if (vertex) list.push({ kind: "vertex", pick: vertex });
        if (point && point.distance > vertexDistance) list.push({ kind: "item", pick: point });
      } else if (filter === "edge") {
        const edge = this.pickEdge(event);
        if (edge) list.push({ kind: "edge", pick: edge });
        const curve = this.pickSketchItem(event, "curve");
        if (curve) list.push({ kind: "item", pick: curve });
      } else {
        const face = this.pick(event);
        const inFront = this.pickSketchItem(event, "region", face ? face.point.distanceTo(this.camera.position) : null);
        if (inFront) list.push({ kind: "item", pick: inFront });
        if (face) list.push({ kind: "face", pick: face });
        const behind = face ? this.pickSketchItem(event, "region") : null;
        if (behind && !inFront) list.push({ kind: "item", pick: behind });
      }
    } else {
      // "Auto" and "Corps": a body edge (thin: it wins over a sketch along it), a whole sketch, a face or body.
      const edge = filter === "auto" ? this.pickEdge(event) : null;
      if (edge) list.push({ kind: "edge", pick: edge });
      const curve = this.pickSketch(event, "line");
      if (curve) list.push({ kind: "sketch", id: curve });
      const face = this.pick(event);
      const inFront = this.pickSketch(event, "fill", face ? face.point.distanceTo(this.camera.position) : null);
      if (inFront && inFront !== curve) list.push({ kind: "sketch", id: inFront });
      if (face) list.push({ kind: "face", pick: face });
      const behind = face ? this.pickSketch(event, "fill") : null;
      if (behind && behind !== curve && behind !== inFront) list.push({ kind: "sketch", id: behind });
    }

    const again = this.lastClick && Math.hypot(event.clientX - this.lastClick.x, event.clientY - this.lastClick.y) <= 4 && list.length > 1;
    const index = again && this.lastClick ? (this.lastClick.index + 1) % list.length : 0;
    this.lastClick = { x: event.clientX, y: event.clientY, index };
    const chosen = list[index];
    // Cycling replaces what the previous click at this spot selected.
    if (again) this.selection.clear();
    const multi = adding || filter === "body" || this.selection.bodies.length > 0 || this.selection.sketches.length > 0;
    if (chosen?.kind === "sketch" && !multi) {
      // A sketch clicked alone becomes the sketch selected in the browser.
      this.selection.clear();
      this.emitSelection();
      this.onSketchPick(chosen.id);
      return;
    }
    if (adding || chosen?.kind === "sketch") this.carryAloneSketch();
    if (chosen?.kind === "sketch") this.selection.toggleSketch(chosen.id);
    else if (chosen?.kind === "vertex") this.selection.toggleVertex(chosen.pick);
    else if (chosen?.kind === "edge") this.selection.toggleEdge(chosen.pick);
    else if (chosen?.kind === "item") this.selection.toggleSketchItem(chosen.pick);
    else if (chosen?.kind === "face" && (filter === "body" || (adding && filter === "auto"))) this.selection.toggleBody(chosen.pick.bodyId);
    else if (chosen?.kind === "face") this.selection.toggleFace(chosen.pick);
    else if (!adding) this.selection.clear();
    this.emitSelection();
    this.onSketchPick(null);
  }

  /** Pointer position on the canvas (pixels from its top-left corner). */
  private canvasPoint(event: PointerEvent): ScreenPoint {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  /**
   * Ends a selection window: the bodies and sketches it holds are added to the selection (left to right:
   * entirely inside; right to left: touched).
   */
  private finishWindow(start: ScreenPoint, end: ScreenPoint): void {
    const { rect, mode } = windowFrom(start, end);
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    const screen = (v: THREE.Vector3): ScreenPoint | null => {
      const p = v.project(this.camera);
      return p.z < -1 || p.z > 1 ? null : [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h];
    };
    /** Screen polylines of an object, or null when part of it is behind the camera (a window cannot hold it). */
    const project = (lines: THREE.Vector3[][]): ScreenPoint[][] | null => {
      const out: ScreenPoint[][] = [];
      for (const line of lines) {
        const points = line.map(screen);
        if (points.some((p) => p === null)) {
          if (mode === "window") return null;
          continue;
        }
        out.push(points as ScreenPoint[]);
      }
      return out;
    };
    // A crossing window inside a single face touches no edge: the body under its centre is taken too.
    const center = mode === "crossing" ? this.bodyAtScreen((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2) : null;
    const bodies = [...this.bodies.values()].filter(({ data, mesh }) => {
      if (data.bodyId === center) return true;
      const lines: THREE.Vector3[][] = [];
      for (let i = 0; i + 5 < data.edges.length; i += 6) {
        lines.push([new THREE.Vector3(data.edges[i], data.edges[i + 1], data.edges[i + 2]), new THREE.Vector3(data.edges[i + 3], data.edges[i + 4], data.edges[i + 5])]);
      }
      const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) lines.push([new THREE.Vector3().fromBufferAttribute(position, i)]);
      const polylines = project(lines);
      return polylines !== null && takenByWindow(rect, mode, polylines);
    });
    this.sketchGroup.updateMatrixWorld(true);
    const sketches = this.sketchGroup.children.filter((group) => {
      const lines: THREE.Vector3[][] = [];
      for (const child of group.children) {
        if (child.userData.kind !== "line" || child.userData.ghost) continue;
        const position = (child as THREE.Line).geometry.getAttribute("position") as THREE.BufferAttribute;
        const line: THREE.Vector3[] = [];
        for (let i = 0; i < position.count; i++) line.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
        lines.push(line);
      }
      for (const p of (group.userData.points ?? []) as { at: [number, number] }[]) lines.push([new THREE.Vector3(p.at[0], p.at[1], 0).applyMatrix4(group.matrixWorld)]);
      const polylines = project(lines);
      return polylines !== null && takenByWindow(rect, mode, polylines);
    });
    this.carryAloneSketch();
    this.selection.add(
      bodies.map((b) => b.data.bodyId),
      sketches.map((g) => g.userData.sketchId as string),
    );
    this.emitSelection();
    this.onSketchPick(null);
  }

  /**
   * What the pointer is over (Sélection++, as Curic Select++): a sketch line or area in front, else the face
   * of a body. Nothing while a tool or a selection window has the pointer.
   */
  hoverTarget(event: PointerEvent): { kind: "sketch"; id: string } | { kind: "body"; id: string; face: FacePick } | null {
    if (this.pointerHandler || this.windowDrag) return null;
    return this.hoverTargetForTool(event);
  }

  /** The same, for a tool that has the pointer (a click choosing a body or a sketch). */
  hoverTargetForTool(event: PointerEvent): { kind: "sketch"; id: string } | { kind: "body"; id: string; face: FacePick } | null {
    const face = this.pick(event);
    const sketch = this.pickSketch(event, "line") ?? this.pickSketch(event, "fill", face ? face.point.distanceTo(this.camera.position) : null);
    if (sketch) return { kind: "sketch", id: sketch };
    return face ? { kind: "body", id: face.bodyId, face } : null;
  }

  /**
   * Section of the view (as Curic Section): what lies beyond the plane perpendicular to `axis` at `position` is
   * hidden (with `flip`, what lies before it); null shows everything again. The view only: nothing is cut.
   */
  setSection(section: { axis: 0 | 1 | 2; position: number; flip: boolean } | null): void {
    const normal = new THREE.Vector3();
    if (section) normal.setComponent(section.axis, section.flip ? 1 : -1);
    const planes = section ? [new THREE.Plane(normal, section.flip ? -section.position : section.position)] : [];
    this.renderer.localClippingEnabled = planes.length > 0;
    const materials: THREE.Material[] = [...this.bodyMaterials, ...this.appearanceMaterials.values(), this.highlightMaterial, this.edgeMaterial, this.hoverTint, this.hoverMaterial];
    materials.push(this.sketchMaterial, this.sketchGhostMaterial, this.sketchSelectedMaterial, this.sketchSelectedGhostMaterial, this.sketchFillMaterial, this.sketchSelectedFillMaterial);
    for (const material of materials) {
      material.clippingPlanes = planes;
      material.needsUpdate = true;
    }
  }

  /** Ids of the bodies displayed. */
  get displayedBodies(): string[] {
    return [...this.bodies.keys()];
  }

  /** Sélection++: a click is handled there first (true: handled, the usual selection does not run). */
  clickOverride: ((event: PointerEvent) => boolean) | null = null;

  private hoverOutline: THREE.Group | null = null;
  private hoverMaterial = new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true, opacity: 0.95 });
  private hoverTint = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide });

  /**
   * Shows in green what a click would select: whole bodies (edges over everything, faces tinted), or one face of
   * a body; null removes it.
   */
  setHoverHighlight(target: { bodies: string[] } | { face: FacePick } | null): void {
    if (this.hoverOutline) {
      this.scene.remove(this.hoverOutline);
      // Geometries made for a face are released; those of whole bodies belong to the bodies.
      this.hoverOutline.traverse((o) => o.userData.own && (o as THREE.Mesh).geometry.dispose());
      this.hoverOutline = null;
    }
    if (!target) return;
    const group = new THREE.Group();
    if ("face" in target) {
      const body = this.bodies.get(target.face.bodyId);
      const range = body?.data.faceGroups[target.face.faceIndex];
      if (!body || !range) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", body.mesh.geometry.getAttribute("position"));
      geometry.setIndex(new THREE.BufferAttribute(body.data.indices.slice(range.start, range.start + range.count), 1));
      const tint = new THREE.Mesh(geometry, this.hoverTint);
      tint.userData.own = true;
      tint.renderOrder = 44;
      group.add(tint);
    } else {
      for (const id of target.bodies) {
        const body = this.bodies.get(id);
        if (!body) continue;
        const edges = new THREE.LineSegments(body.edges.geometry, this.hoverMaterial);
        edges.renderOrder = 45;
        const tint = new THREE.Mesh(body.mesh.geometry, this.hoverTint);
        tint.renderOrder = 44;
        group.add(tint, edges);
      }
    }
    this.hoverOutline = group;
    this.scene.add(group);
  }

  /**
   * Sélection++: selects what a level holds (whole bodies, or one face), instead of the selection (or in
   * addition to it with `adding`); a level already wholly selected is removed when adding.
   */
  selectLevel(target: { bodies: string[] } | { face: FacePick } | { sketches: string[] } | { item: SketchPick }, adding: boolean): void {
    if (!adding) this.selection.clear();
    if ("face" in target) this.selection.toggleFace(target.face);
    else if ("item" in target) this.selection.toggleSketchItem(target.item);
    else if ("sketches" in target) for (const id of target.sketches) this.selection.toggleSketch(id);
    else if (adding && target.bodies.every((id) => this.selection.bodies.includes(id))) for (const id of target.bodies) this.selection.toggleBody(id);
    else this.selection.add(target.bodies, []);
    this.emitSelection();
    this.onSketchPick(null);
  }

  /** Body seen at this canvas point (pixels), if any. */
  private bodyAtScreen(x: number, y: number): string | null {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement;
    this.raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), this.camera);
    const hit = this.raycaster.intersectObjects([...this.bodies.values()].map((b) => b.mesh), false)[0];
    return (hit?.object.userData.bodyId as string | undefined) ?? null;
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
    this.emitSelection();
  }

  clearSelection(): void {
    if (this.selection.empty) return;
    this.selection.clear();
    this.emitSelection();
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
    this.windowOverlay.dispose();
  }
}
