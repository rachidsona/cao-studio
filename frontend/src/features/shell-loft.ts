/**
 * Coque et lissage dans le noyau (comme Fusion) :
 * - la coque creuse le corps à une épaisseur de paroi, les faces choisies (planes) restant ouvertes : un tiroir, un
 *   bac, une boîte sans couvercle à partir d'un bloc. Sans face ouverte, le corps devient creux et fermé, quelle que
 *   soit sa forme (prisme à base de triangle, de carré, de cercle, de biais) : c'est lui, moins lui-même rentré de
 *   l'épaisseur. « Vider un corps » en fait aussi un corps par côté (`sides: "separate"`) : chaque face plane un
 *   panneau, en onglet ou bout à bout comme Panneaux sur faces, et ce qui reste de la paroi — les faces courbes,
 *   le tube d'un cylindre entre ses deux fonds — autant de corps qu'il fait de morceaux ;
 * - le lissage relie les profils fermés de plusieurs esquisses, dans l'ordre (courbe ou droit entre eux) : un pied
 *   galbé, une moulure qui change de section, une trémie.
 */
import { makeOffset, makeSolid, type Face, type Shape3D, type Sketch } from "replicad";
import type { LoftFeature, ShellFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid, requireSingleValidSolid } from "../geometry/kernel";
import { resolveFace } from "../geometry/references";
import { applyOperation, onProfilePlane, profileDrawing, requirePositive, requireProfile, requireSolid, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";
import { facePanels, faceSlab } from "./paneling";

/** Two faces are the same one when their centres are this close (mm). */
const SAME_FACE = 1e-4;

/** The centre of a face (a point inside it when it is flat), to find it again among the faces of the body. */
function centreOf(face: Face): Vec3 {
  const c = face.center;
  return [c.x, c.y, c.z];
}

/** The outward unit normal of a flat face. */
function normalOf(face: Face): Vec3 {
  const n = face.normalAt(face.center);
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  return [n.x / length, n.y / length, n.z / length];
}

/**
 * The body hollowed, its walls one solid. Faces open: the kernel's own shell (a positive thickness hollows inwards,
 * the walls stay inside the body's outline). None: the body less itself drawn in by the thickness — the kernel's shell
 * does not make a closed one.
 */
function hollowed(name: string, target: Shape3D, open: readonly Face[], thickness: number): Shape3D {
  const points = open.map(centreOf);
  let made: Shape3D | null = null;
  try {
    if (points.length) made = target.clone().shell(thickness, (f) => f.either(points.map((p) => (g: typeof f) => g.containsPoint(p))));
    else {
      const drawn = makeOffset(target as unknown as Face, -thickness) as Shape3D;
      // A body with a hole through it comes back as its skin only: closed into a solid.
      const inner = drawn.solids.length ? drawn : (makeSolid([drawn as unknown as Face]) as unknown as Shape3D);
      try {
        made = target.cut(inner) as Shape3D;
      } finally {
        inner.delete();
        if (inner !== drawn) drawn.delete();
      }
    }
  } catch {
    throw new GeometryError(`${name} : le corps ne se vide pas à cette épaisseur ; essayez une paroi plus fine que sa plus petite épaisseur (et que ses arrondis).`);
  }
  return requireSingleValidSolid(made, name);
}

/** Each side of the body a solid of its own: the flat ones boards, what is left of the wall (the curved sides) after them. */
function separateSides(feature: ShellFeature, target: Shape3D, open: readonly Face[]): Shape3D[] {
  const thickness = Math.abs(feature.thickness);
  const gone = open.map(centreOf);
  const kept = target.faces.filter((f) => {
    const c = centreOf(f);
    return !gone.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < SAME_FACE);
  });
  const flat = kept.filter((f) => f.geomType === "PLANE");
  const normals = flat.map(normalOf);
  const shapes = flat.length ? facePanels(feature.name, target, flat, normals, thickness, feature.joint ?? "miter") : [];
  if (kept.length > flat.length) {
    // The curved sides: the hollow body less the boards of its flat ones.
    let rest: Shape3D | null = null;
    try {
      rest = hollowed(feature.name, target, open, thickness);
      for (const [i, face] of flat.entries()) {
        const slab = faceSlab(face, normals[i]!, thickness);
        const next = rest.cut(slab) as Shape3D;
        slab.delete();
        rest.delete();
        rest = next;
      }
      const parts = rest.solids.map((s) => s.clone() as Shape3D);
      if (!parts.every(isShapeValid)) {
        for (const part of parts) part.delete();
        throw new GeometryError(`${feature.name} : un des côtés courbes obtenus est invalide ; essayez une paroi plus fine.`);
      }
      // Numbered by position (x, then y, then z): the same bodies at each regeneration.
      const placed = parts.map((part) => {
        const box = part.boundingBox;
        const c = [...box.center];
        box.delete();
        return { part, c };
      });
      placed.sort((a, b) => a.c[0]! - b.c[0]! || a.c[1]! - b.c[1]! || a.c[2]! - b.c[2]!);
      shapes.push(...placed.map((p) => p.part));
    } catch (error) {
      for (const s of shapes) s.delete();
      if (error instanceof GeometryError) throw error;
      throw new GeometryError(`${feature.name} : les côtés courbes ne se séparent pas ; essayez une paroi plus fine.`);
    } finally {
      rest?.delete();
    }
  }
  if (!shapes.length) throw new GeometryError(`${feature.name} : il ne reste aucun côté ; refermez une face ouverte.`);
  return shapes;
}

export function buildShell(feature: ShellFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  requirePositive(Math.abs(feature.thickness), `${feature.name} : l'épaisseur`);
  const target = requireSolid(lookup, feature.target).shape;
  const open = feature.faces.map((ref) => resolveFace(target, ref));
  if (open.some((f) => f.geomType !== "PLANE")) throw new GeometryError(`${feature.name} : seules des faces planes peuvent rester ouvertes.`);
  if (feature.sides === "separate") return { kind: "solids", shapes: separateSides(feature, target, open) };
  return { kind: "solid", shape: hollowed(feature.name, target, open, Math.abs(feature.thickness)) };
}

export function buildLoft(feature: LoftFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  if (feature.profiles.length < 2) throw new GeometryError(`${feature.name} : choisissez au moins deux esquisses à relier.`);
  if (new Set(feature.profiles).size !== feature.profiles.length) throw new GeometryError(`${feature.name} : une esquisse ne peut servir qu'une fois.`);
  const sketches = feature.profiles.map((id, i) => {
    const profile = requireProfile(lookup, id);
    const placed = onProfilePlane(profileDrawing(`${feature.name} (profil ${i + 1})`, profile).clone(), profile);
    if (!("wire" in placed)) throw new GeometryError(`${feature.name} : le profil ${i + 1} doit être un seul contour fermé, sans trou.`);
    return placed as Sketch;
  });
  let solid: Shape3D;
  try {
    solid = sketches[0]!.loftWith(sketches.slice(1), { ruled: feature.ruled ?? false });
  } catch {
    throw new GeometryError(`${feature.name} : le lissage est impossible ; les profils doivent être dans des plans séparés, dans l'ordre.`);
  }
  return applyOperation(feature.name, solid, feature.operation, feature.target, lookup);
}
