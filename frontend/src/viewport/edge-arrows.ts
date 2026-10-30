/**
 * Arrows at the two ends of a selected straight edge (as the arrows of a dimension): they show where the edge
 * starts and stops. Small cones, their tips on the ends, pointing outwards, sized after the edge.
 */
import * as THREE from "three";

/** The two ends of a straight edge and its direction (from start to end), or null for a curve. */
export function straightEnds(points: THREE.Vector3[]): { start: THREE.Vector3; end: THREE.Vector3; length: number } | null {
  if (points.length < 2) return null;
  const first = points[0] as THREE.Vector3;
  // The farthest point from the first, then the farthest from that one: the two ends, whatever the order of the segments.
  const far = (from: THREE.Vector3) => points.reduce((best, p) => (p.distanceToSquared(from) > best.distanceToSquared(from) ? p : best), from);
  const start = far(first);
  const end = far(start);
  const length = end.distanceTo(start);
  if (length < 1e-6) return null;
  const dir = end.clone().sub(start).divideScalar(length);
  const off = (p: THREE.Vector3) => p.clone().sub(start).cross(dir).length();
  if (points.some((p) => off(p) > 1e-6 * Math.max(1, length))) return null;
  return { start: start.clone(), end: end.clone(), length };
}

/** The length of an arrow on the screen (pixels), whatever the zoom, and at most a quarter of its edge. */
export const ARROW_PX = 14;

/** Two cones at the ends of a straight edge (null for a curve), drawn over the bodies; sized each frame by `fitArrows`. */
export function edgeArrows(points: THREE.Vector3[], color: number): THREE.Group | null {
  const ends = straightEnds(points);
  if (!ends) return null;
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
  const group = new THREE.Group();
  group.userData.arrows = true;
  group.userData.edgeLength = ends.length;
  const out = ends.end.clone().sub(ends.start).normalize();
  for (const [tip, direction] of [
    [ends.end, out],
    [ends.start, out.clone().negate()],
  ] as const) {
    // A cone of length 1 along +y, its middle at the origin: turned along the edge; `fitArrows` sizes and places it.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1, 16), material);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    cone.userData.tip = tip.clone();
    cone.userData.direction = direction.clone();
    cone.renderOrder = 41;
    group.add(cone);
  }
  fitArrow(group, () => Math.min(40, ends.length * 0.25));
  return group;
}

/** Sizes the cones of an arrow group: `length(tip)` gives the length (mm) of a cone whose tip is there. */
function fitArrow(group: THREE.Object3D, length: (tip: THREE.Vector3) => number): void {
  const edge = group.userData.edgeLength as number;
  for (const cone of group.children) {
    const tip = cone.userData.tip as THREE.Vector3;
    const size = Math.min(length(tip), edge * 0.25);
    cone.scale.setScalar(size);
    cone.position.copy(tip).addScaledVector(cone.userData.direction as THREE.Vector3, -size / 2);
  }
}

/** Gives the arrows their size on the screen ({@link ARROW_PX} pixels) for this camera and this view height. */
export function fitArrows(groups: Iterable<THREE.Object3D>, camera: THREE.PerspectiveCamera, viewHeight: number): void {
  const perPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(viewHeight, 1);
  for (const group of groups) fitArrow(group, (tip) => ARROW_PX * perPixel * tip.distanceTo(camera.position));
}

/** Frees the cones of `edgeArrows`. */
export function disposeArrows(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  ((group.children[0] as THREE.Mesh | undefined)?.material as THREE.Material | undefined)?.dispose();
}
