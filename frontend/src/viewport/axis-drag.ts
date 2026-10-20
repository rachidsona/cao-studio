/** Pure math for dragging a handle along a 3D axis with the mouse ray. */
import type { Vec3 } from "../sketcher/frame";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Parameter t of the point of the axis `base + t·axis` closest to the ray
 * `origin + s·direction`; null when the ray is (nearly) parallel to the axis,
 * where dragging along it is meaningless.
 */
export function axisParameter(base: Vec3, axis: Vec3, origin: Vec3, direction: Vec3): number | null {
  const w = sub(base, origin);
  const a = dot(axis, axis);
  const b = dot(axis, direction);
  const c = dot(direction, direction);
  const d = dot(axis, w);
  const e = dot(direction, w);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9 * a * c) return null;
  return (b * e - c * d) / denom;
}

/** Rounding step adapted to the zoom: finer when zoomed in. */
export function dragStep(worldPerPixel: number): number {
  const steps = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50];
  return steps.find((s) => s >= worldPerPixel * 3) ?? 100;
}

export function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(6));
}

/** Point where the ray `origin + s·direction` meets the plane through `base` with normal `normal`; null when parallel or behind. */
export function rayPlanePoint(base: Vec3, normal: Vec3, origin: Vec3, direction: Vec3): Vec3 | null {
  const denom = dot(normal, direction);
  if (Math.abs(denom) < 1e-9) return null;
  const s = dot(normal, sub(base, origin)) / denom;
  if (s < 0) return null;
  return [origin[0] + direction[0] * s, origin[1] + direction[1] * s, origin[2] + direction[2] * s];
}
