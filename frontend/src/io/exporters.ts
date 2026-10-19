/**
 * Export of computed bodies to exchange formats. STEP keeps the exact B-rep
 * (millimetres); STL is a tessellation intended for 3D printing.
 */
import { exportSTEP, type Shape3D } from "replicad";
import { GeometryError } from "../geometry/kernel";

export type ExportFormat = "step" | "stl";

export interface NamedBody {
  name: string;
  shape: Shape3D;
}

export function exportBodies(bodies: NamedBody[], format: ExportFormat): Blob {
  if (bodies.length === 0) throw new GeometryError("Aucun corps valide à exporter.");
  if (format === "step") {
    return exportSTEP(
      bodies.map((b) => ({ shape: b.shape, name: b.name })),
      { unit: "MM", modelUnit: "MM" },
    );
  }
  if (bodies.length > 1) throw new GeometryError("L'export STL multi-corps n'est pas encore pris en charge.");
  const [body] = bodies as [NamedBody];
  return body.shape.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true });
}
