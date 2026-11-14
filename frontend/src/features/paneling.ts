/**
 * Panneaux sur faces : les faces choisies d'un volume — planes, ou cylindriques (une planche cintrée, curved-panel.ts) —
 * deviennent des panneaux de l'épaisseur voulue, pris dans le volume (vers l'intérieur) ; les faces non choisies restent
 * ouvertes. Deux assemblages :
 * - en onglet, à tout angle : deux panneaux voisins se partagent leur coin par le plan bissecteur de leurs faces
 *   (chaque point va au panneau dont la face est la plus proche) — le seau à 8 pans, la boîte en onglets ;
 * - bout à bout : la première face choisie passe, les suivantes s'arrêtent contre les panneaux déjà faits ;
 *   c'est aussi ainsi que se joignent une face courbe et sa voisine, même « en onglet ».
 * Chaque panneau est un corps, pour la liste de débit. Le volume de départ disparaît.
 */
import { basicFaceExtrusion, makeBox, Vector, type Face, type Shape3D } from "replicad";
import type { PanelingFeature, Vec3 } from "../document/types";
import { GeometryError, requireSingleValidSolid } from "../geometry/kernel";
import { resolveFace, resolveFacePlane } from "../geometry/references";
import { requirePositive, requireSolid, type OutputLookup } from "./common";
import type { SolidsOutput } from "./outputs";
import { curvedSlab } from "./curved-panel";

/** The kinds of faces that become panels. */
export const PANEL_FACES = new Set(["PLANE", "CYLINDRE"]);

/** Two edges are the same when their middles are this close (mm). */
const SAME_EDGE = 1e-3;

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The half-space { p : normal · (p − point) ≤ 0 }, as a box large enough for the body. */
function halfSpace(normal: Vec3, point: Vec3, size: number): Shape3D {
  const n = normal.map((c) => c / length(normal)) as Vec3;
  const box = makeBox([-size, -size, -2 * size], [size, size, 0]) as unknown as Shape3D;
  const axis = cross([0, 0, 1], n);
  const turned = length(axis) < 1e-9 ? (n[2] > 0 ? box : (box.rotate(180, [0, 0, 0], [1, 0, 0]) as Shape3D)) : (box.rotate((Math.atan2(length(axis), n[2]) * 180) / Math.PI, [0, 0, 0], axis) as Shape3D);
  return turned.translate(point) as Shape3D;
}

/** The middles of the edges of a face. */
function edgeMiddles(face: Face): Vec3[] {
  return face.edges.map((e) => {
    const p = e.pointAt(0.5);
    return [p.x, p.y, p.z] as Vec3;
  });
}

/** A point both faces share an edge through, or null when they do not touch along an edge. */
function sharedEdge(a: Vec3[], b: Vec3[]): Vec3 | null {
  return a.find((p) => b.some((q) => length([p[0] - q[0], p[1] - q[1], p[2] - q[2]]) < SAME_EDGE)) ?? null;
}

/** Replaces a shape by what an operation makes of it, deleting the one it was made from. */
function swap(shape: Shape3D, make: (s: Shape3D) => Shape3D): Shape3D {
  const next = make(shape);
  shape.delete();
  return next;
}

/** The board of a flat face: the face drawn in by the thickness, kept inside the body. */
export function faceSlab(face: Face, normal: Vec3, thickness: number): Shape3D {
  return basicFaceExtrusion(face, new Vector(normal.map((c) => -c * thickness) as Vec3)) as Shape3D;
}

/**
 * The boards of these flat faces of `target` (`normals`: their outward unit normals), `thickness` thick, taken inside
 * it: mitred where two of them share an edge, or butted — the first one runs through. `name`: whose they are, for
 * what goes wrong.
 */
export function facePanels(name: string, target: Shape3D, faces: readonly Face[], normals: readonly Vec3[], thickness: number, joint: PanelingFeature["joint"]): Shape3D[] {
  const middles = faces.map(edgeMiddles);
  const box = target.boundingBox;
  const size = 4 * Math.max(box.width, box.height, box.depth, thickness);
  const shapes: Shape3D[] = [];
  try {
    const flat = faces.map((f) => f.geomType === "PLANE");
    faces.forEach((face, i) => {
      const n = normals[i]!;
      let piece = flat[i] ? swap(faceSlab(face, n, thickness), (s) => s.intersect(target) as Shape3D) : curvedSlab(target, face, thickness);
      if (joint === "miter") {
        faces.forEach((_, j) => {
          const edge = j !== i ? sharedEdge(middles[i]!, middles[j]!) : null;
          if (!edge) return;
          // A curved face and its neighbour: butted, the one taken first runs through.
          if (!flat[i] || !flat[j]) {
            if (j < i) piece = swap(piece, (s) => s.cut(shapes[j]!) as Shape3D);
            return;
          }
          const m = normals[j]!.map((c, k) => c - n[k]!) as Vec3;
          if (length(m) < 1e-6) return;
          const cut = halfSpace(m, edge, size);
          piece = swap(piece, (s) => s.intersect(cut) as Shape3D);
          cut.delete();
        });
      } else for (const before of shapes) piece = swap(piece, (s) => s.cut(before) as Shape3D);
      // Nothing left of it: the panels taken before fill its place (a hole's wall in a thin board, between the panels of
      // both faces).
      if (!piece.solids?.length) {
        piece.delete();
        throw new GeometryError(`${name} : il ne reste rien du panneau ${i + 1}, les panneaux voisins prennent toute sa place ; prenez une épaisseur plus fine, ou cette face avant eux.`);
      }
      shapes.push(requireSingleValidSolid(piece, `${name} : le panneau ${i + 1}`));
    });
  } catch (error) {
    for (const s of shapes) s.delete();
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${name} : les panneaux ne se font pas ; essayez une épaisseur plus fine.`);
  }
  return shapes;
}

export function buildPaneling(feature: PanelingFeature, lookup: OutputLookup): SolidsOutput {
  requirePositive(feature.thickness, `${feature.name} : l'épaisseur`);
  if (!feature.faces.length) throw new GeometryError(`${feature.name} : choisissez au moins une face.`);
  const target = requireSolid(lookup, feature.target).shape;
  const faces = feature.faces.map((ref) => resolveFace(target, ref));
  if (faces.some((f) => !PANEL_FACES.has(f.geomType))) throw new GeometryError(`${feature.name} : seules des faces planes ou cylindriques deviennent des panneaux (pas une sphère ni une forme libre).`);
  // A curved face has no single normal: it is not used for it.
  const normals = feature.faces.map((ref, i): Vec3 => (faces[i]!.geomType === "PLANE" ? resolveFacePlane(target, ref).normal : [0, 0, 1]));
  return { kind: "solids", shapes: facePanels(feature.name, target, faces, normals, feature.thickness, feature.joint) };
}
