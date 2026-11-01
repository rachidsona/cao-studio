/**
 * Points a click can pick in the 3D view: small round dots of a constant size on the screen (a dark edge round a disc
 * of the point's colour, readable on any background), only the one under the pointer shown (#f8500a).
 */
import * as THREE from "three";
import type { Vec3 } from "../sketcher/frame";


function layer(points: Vec3[], colors: number[], size: number, map: THREE.Texture, order: number): THREE.Points {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size, map, vertexColors: true, alphaTest: 0.2, sizeAttenuation: false, depthTest: false, transparent: true });
  const object = new THREE.Points(geometry, material);
  object.renderOrder = order;
  return object;
}

/** A small round dot (a dark edge round a white disc, tinted by the point's colour). */
function dotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.beginPath();
  g.arc(32, 32, 24, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#111827";
  g.stroke();
  return new THREE.CanvasTexture(canvas);
}

let dot: THREE.CanvasTexture | null = null;

/** Points shown as small coloured dots of a constant size on the screen (the point under the pointer, a picked one). */
export class SnapDots {
  private object: THREE.Points | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sizePx = 11,
  ) {}

  /** Draws these points, each in its colour (hex). */
  show(points: Vec3[], colors: number[]): void {
    this.clear();
    if (points.length === 0) return;
    dot ??= dotTexture();
    const tints = colors.flatMap((hex) => new THREE.Color(hex).toArray());
    this.object = layer(points, tints, this.sizePx, dot, 47);
    this.scene.add(this.object);
  }

  clear(): void {
    if (!this.object) return;
    this.scene.remove(this.object);
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object = null;
  }
}
