/**
 * Lines a few pixels wide (WebGL's own are one pixel): the chosen edges and sketch lines of the view, drawn in a clear
 * colour that reads on any body. Their width is in pixels, so the view tells them its size on every resize.
 */
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

const materials = new Set<LineMaterial>();
let resolution: [number, number] = [800, 600];

/** The view's size in pixels (called by the view when it resizes). */
export function setFatLineResolution(width: number, height: number): void {
  resolution = [width, height];
  for (const material of materials) material.resolution.set(width, height);
}

/**
 * Segments (pairs of points) of this colour and width (pixels), drawn over the bodies. A polyline is given as the
 * pairs of its successive points. The geometry and the material are freed with `disposeFat`.
 */
export function fatSegments(points: THREE.Vector3[], color: number, width = 3.5): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const material = new LineMaterial({ color, linewidth: width, depthTest: false, transparent: true });
  material.resolution.set(...resolution);
  materials.add(material);
  const line = new LineSegments2(geometry, material);
  line.userData.fat = true;
  return line;
}

/** Pairs of successive points of a polyline. */
export function polylineSegments(points: THREE.Vector3[]): THREE.Vector3[] {
  return points.slice(1).flatMap((p, i) => [points[i] as THREE.Vector3, p]);
}

export function disposeFat(line: LineSegments2): void {
  materials.delete(line.material as LineMaterial);
  line.geometry.dispose();
  (line.material as THREE.Material).dispose();
}
