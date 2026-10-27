/**
 * Export of computed bodies to exchange formats. STEP keeps the exact B-rep
 * (millimetres); STL is a tessellation intended for 3D printing.
 */
import { exportSTEP, makeCompound, type Shape3D } from "replicad";
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
  const options = { tolerance: 0.01, angularTolerance: 0.1, binary: true };
  if (bodies.length === 1) return (bodies[0] as NamedBody).shape.blobSTL(options);
  // Several bodies: one STL of their compound, made of copies (makeCompound releases the shapes it is given).
  const compound = makeCompound(bodies.map((b) => b.shape.clone())) as Shape3D;
  try {
    return compound.blobSTL(options);
  } finally {
    compound.delete();
  }
}
