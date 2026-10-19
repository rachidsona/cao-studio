/**
 * Adapter around the B-rep kernel (replicad on top of OpenCascade WASM).
 *
 * Every other module talks to the kernel through this file so the underlying
 * library can be swapped or upgraded in one place. It must stay free of DOM
 * and Django concerns: it runs in a Web Worker and in Node tests.
 */
import { getOC, measureArea, measureVolume, setOC, type Shape3D } from "replicad";
import type { OpenCascadeInstance } from "replicad-opencascadejs";

let ready = false;

/** Error raised for geometric failures; `message` is shown to the user (French). */
export class GeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeometryError";
  }
}

export function initKernel(oc: OpenCascadeInstance): void {
  setOC(oc);
  ready = true;
}

export function isKernelReady(): boolean {
  return ready;
}

export function assertKernelReady(): void {
  if (!ready) throw new GeometryError("Le noyau géométrique n'est pas initialisé.");
}

/** Full topological and geometric check of a shape (OCCT BRepCheck). */
export function isShapeValid(shape: Shape3D): boolean {
  const oc = getOC();
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
  try {
    return analyzer.IsValid();
  } finally {
    analyzer.delete();
  }
}

export function solidCount(shape: Shape3D): number {
  return shape.solids.length;
}

export interface BodyMetrics {
  /** mm³ */
  volume: number;
  /** mm² */
  area: number;
  bbox: [[number, number, number], [number, number, number]];
  faceCount: number;
  edgeCount: number;
}

export function bodyMetrics(shape: Shape3D): BodyMetrics {
  const box = shape.boundingBox;
  try {
    const [min, max] = box.bounds;
    return {
      volume: measureVolume(shape),
      area: measureArea(shape),
      bbox: [
        [min[0], min[1], min[2]],
        [max[0], max[1], max[2]],
      ],
      faceCount: shape.faces.length,
      edgeCount: shape.edges.length,
    };
  } finally {
    box.delete();
  }
}

/**
 * Ensures a boolean/feature result is a single valid solid; deletes it and
 * throws a user-facing error otherwise.
 */
export function requireSingleValidSolid(shape: Shape3D, context: string): Shape3D {
  const count = solidCount(shape);
  if (count === 0) {
    shape.delete();
    throw new GeometryError(`${context} : le résultat ne contient aucun solide.`);
  }
  if (count > 1) {
    shape.delete();
    throw new GeometryError(`${context} : le résultat est séparé en ${count} solides distincts.`);
  }
  if (!isShapeValid(shape)) {
    shape.delete();
    throw new GeometryError(`${context} : le solide obtenu est invalide.`);
  }
  return shape;
}
