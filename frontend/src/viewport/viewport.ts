/**
 * Three.js viewport: displays tessellated bodies sent by the geometry worker,
 * with a Z-up CAD camera, adaptive grid, axes, navigation gizmo, standard
 * views and face picking. It never computes geometry itself.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import type { BodyMesh } from "../geometry/protocol";
import { AdaptiveGrid } from "./grid";

export type StandardView = "iso" | "front" | "back" | "top" | "bottom" | "left" | "right";

export interface FacePick {
  bodyId: string;
  faceIndex: number;
  point: THREE.Vector3;
}

const VIEW_DIRECTIONS: Record<StandardView, [number, number, number]> = {
  iso: [1, -1, 0.8],
  front: [0, -1, 0],
  back: [0, 1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
};

interface BodyObject {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  data: BodyMesh;
}

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private viewHelper: ViewHelper;
  private grid = new AdaptiveGrid();
  private bodies = new Map<string, BodyObject>();
  private bodyMaterial: THREE.MeshStandardMaterial;
  private highlightMaterial: THREE.MeshStandardMaterial;
  private edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937 });
  private raycaster = new THREE.Raycaster();
  private timer = new THREE.Timer();
  private selected: FacePick | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  onPick: (pick: FacePick | null) => void = () => {};

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.classList.add("block", "h-full", "w-full", "touch-none");

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
    this.highlightMaterial.color.set(0x0ea5e9);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, -2, 3);
    this.camera.add(key);
    this.scene.add(this.camera);
    this.scene.add(this.grid.object);
    this.scene.add(this.makeAxes());

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

  setBodies(meshes: BodyMesh[]): void {
    for (const body of this.bodies.values()) this.disposeBody(body);
    this.bodies.clear();
    for (const data of meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      for (const group of data.faceGroups) geometry.addGroup(group.start, group.count, 0);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, [this.bodyMaterial, this.highlightMaterial]);
      mesh.userData.bodyId = data.bodyId;

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(data.edges, 3));
      const edges = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);
      this.scene.add(mesh, edges);
      this.bodies.set(data.bodyId, { mesh, edges, data });
    }
    // Keep the face selection only if the same face still exists.
    if (this.selected && !this.bodies.get(this.selected.bodyId)?.data.faceGroups[this.selected.faceIndex]) {
      this.select(null);
    } else {
      this.paintSelection();
    }
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
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const box = this.sceneBounds();
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
    const distance = this.fitDistance(radius);
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.update();
  }

  private bindPointer(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener("pointerup", (event) => {
      const start = this.pointerDown;
      this.pointerDown = null;
      // A click (not a drag) selects; drags belong to the camera controls.
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      if (this.viewHelper.handleClick(event)) return;
      this.select(this.pick(event));
    });
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

  select(pick: FacePick | null): void {
    this.selected = pick;
    this.paintSelection();
    this.onPick(pick);
  }

  private paintSelection(): void {
    for (const body of this.bodies.values()) {
      body.mesh.geometry.groups.forEach((group, index) => {
        const isSelected = this.selected?.bodyId === body.data.bodyId && this.selected.faceIndex === index;
        group.materialIndex = isSelected ? 1 : 0;
      });
    }
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
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
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.viewHelper.render(this.renderer);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const body of this.bodies.values()) this.disposeBody(body);
    this.controls.dispose();
    this.viewHelper.dispose();
    this.timer.dispose();
    this.renderer.dispose();
  }
}
