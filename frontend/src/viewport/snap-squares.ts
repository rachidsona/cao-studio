/**
 * Points a click can pick, drawn as in the sketch: hollow squares of a constant size on the screen (a dark edge round
 * a light one, readable on any background), the one that will be picked a filled orange square, a little larger.
 */
import * as THREE from "three";
import type { Vec3 } from "../sketcher/frame";

const SIZE_PX = 18;
const PICKED_PX = 24;

/** A square on a transparent ground: hollow (a dark edge round a white one) or filled; tinted by the point's colour. */
function squareTexture(filled: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  if (filled) {
    g.fillStyle = "#fff";
    g.fillRect(8, 8, 48, 48);
    g.strokeStyle = "#1f2937";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 48, 48);
  } else {
    g.strokeStyle = "#111827";
    g.lineWidth = 16;
    g.strokeRect(12, 12, 40, 40);
    g.strokeStyle = "#fff";
    g.lineWidth = 8;
    g.strokeRect(12, 12, 40, 40);
  }
  return new THREE.CanvasTexture(canvas);
}

let hollow: THREE.CanvasTexture | null = null;
let filled: THREE.CanvasTexture | null = null;

function layer(points: Vec3[], colors: number[], size: number, map: THREE.Texture, order: number): THREE.Points {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size, map, vertexColors: true, alphaTest: 0.2, sizeAttenuation: false, depthTest: false, transparent: true });
  const object = new THREE.Points(geometry, material);
  object.renderOrder = order;
  return object;
}

export class SnapSquares {
  private objects: THREE.Points[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Draws these points as hollow squares (white, or `colors` — rgb 0..1 — one per point), the `picked` one orange and filled. */
  show(points: Vec3[], picked = -1, colors?: number[]): void {
    this.clear();
    if (points.length === 0) return;
    hollow ??= squareTexture(false);
    filled ??= squareTexture(true);
    const rest = points.filter((_, i) => i !== picked);
    const tints = colors ? colors.flatMap((_, i) => (i % 3 === 0 && i / 3 !== picked ? colors.slice(i, i + 3) : [])) : rest.flatMap(() => [1, 1, 1]);
    if (rest.length) this.objects.push(layer(rest, tints, SIZE_PX, hollow, 44));
    const one = points[picked];
    if (one) this.objects.push(layer([one], [0.98, 0.45, 0.09], PICKED_PX, filled, 46));
    for (const object of this.objects) this.scene.add(object);
  }

  clear(): void {
    for (const object of this.objects) {
      this.scene.remove(object);
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    this.objects = [];
  }
}
