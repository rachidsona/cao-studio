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
import { makeOffset, makeSolid, measureArea, type Face, type Shape3D, type Sketch } from "replicad";
import type { LoftFeature, ShellFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { resolveFace } from "../geometry/references";
import { applyOperation, onProfilePlane, profileDrawing, requirePositive, requireProfile, requireSolid, solidsResult, type OutputLookup } from "./common";
import type { SolidOutput, SolidsOutput } from "./outputs";
import { facePanels, faceSlab } from "./paneling";
import { splitBoards } from "./board-split-shape";
import { frameEnds, isFrame, splitRing } from "./ring-sides";

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

/** The body drawn in by the thickness, a solid: what is taken out of it to leave its walls. */
function drawnIn(target: Shape3D, thickness: number): Shape3D {
  const drawn = makeOffset(target as unknown as Face, -thickness) as Shape3D;
  if (drawn.solids.length) return drawn;
  // A body with a hole through it comes back as its skin only: closed into a solid.
  const solid = makeSolid([drawn as unknown as Face]) as unknown as Shape3D;
  drawn.delete();
  return solid;
}

/**
 * The body hollowed by its own shape drawn in, the open faces cut through: for each one, the face of the hollow that
 * lies behind it is drawn out through the wall. What the kernel's shell does not make: a closed hollow body, a body
 * with a hole through an open face.
 */
function carved(target: Shape3D, open: readonly Face[], thickness: number): Shape3D {
  const inner = drawnIn(target, thickness);
  let made: Shape3D | null = null;
  try {
    made = target.cut(inner) as Shape3D;
    for (const face of open) {
      const n = normalOf(face);
      const c = centreOf(face);
      for (const behind of inner.faces) {
        if (behind.geomType !== "PLANE") continue;
        const m = normalOf(behind);
        const b = centreOf(behind);
        const depth = (c[0] - b[0]) * n[0] + (c[1] - b[1]) * n[1] + (c[2] - b[2]) * n[2];
        if (m[0] * n[0] + m[1] * n[1] + m[2] * n[2] < 0.999 || Math.abs(depth - thickness) > 1e-3) continue;
        // A little beyond the outer face: a clean cut.
        const plug = faceSlab(behind, [-n[0], -n[1], -n[2]], thickness + 1);
        const next = made.cut(plug) as Shape3D;
        plug.delete();
        made.delete();
        made = next;
      }
    }
    return made;
  } catch (error) {
    made?.delete();
    throw error;
  } finally {
    inner.delete();
  }
}

/**
 * The body hollowed: its walls, one solid — or more, when what is open leaves them apart (the wall of a hole through
 * an open face, no longer held by it). Faces open: the kernel's own shell (a positive thickness hollows inwards,
 * the walls stay inside the body's outline), and when it does not give one solid — a hole through an open face —
 * the body carved by its own shape drawn in. None open: carved too, the kernel's shell does not make a closed one.
 */
function hollowed(name: string, target: Shape3D, open: readonly Face[], thickness: number): Shape3D {
  const points = open.map(centreOf);
  if (points.length) {
    try {
      const made = target.clone().shell(thickness, (f) => f.either(points.map((p) => (g: typeof f) => g.containsPoint(p))));
      if (made.solids.length >= 1 && isShapeValid(made)) return made;
      made.delete();
    } catch {
      // Carved instead.
    }
  }
  let made: Shape3D;
  try {
    made = carved(target, open, thickness);
  } catch {
    throw new GeometryError(`${name} : le corps ne se vide pas à cette épaisseur ; essayez une paroi plus fine que sa plus petite épaisseur (et que ses arrondis).`);
  }
  if (made.solids.length >= 1 && isShapeValid(made)) return made;
  made.delete();
  throw new GeometryError(`${name} : le corps ne se vide pas ainsi ; essayez une paroi plus fine, ou refermez une face.`);
}

/** Each side of the body a solid of its own: the flat ones boards, what is left of the wall (the curved sides) after them. */
function separateSides(feature: ShellFeature, target: Shape3D, open: readonly Face[]): Shape3D[] {
  const thickness = Math.abs(feature.thickness);
  const gone = open.map(centreOf);
  const kept = target.faces.filter((f) => {
    const c = centreOf(f);
    return !gone.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < SAME_FACE);
  });
  // Butted, the first sides run through: the largest ones first, the two of a pair together (a caisson's uprights
  // run its whole height, its top and bottom stand between them), whatever order the kernel lists the faces in.
  const axis = (n: Vec3) => n.reduce((best, c, i) => (Math.abs(c) > Math.abs(n[best]!) + 1e-9 ? i : best), 0);
  const ranked = kept.filter((f) => f.geomType === "PLANE").map((face) => ({ face, normal: normalOf(face), area: Math.round(measureArea(face)) }));
  if (feature.joint === "butt") ranked.sort((a, b) => b.area - a.area || axis(a.normal) - axis(b.normal));
  const flat = ranked.map((r) => r.face);
  const normals = ranked.map((r) => r.normal);
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

/**
 * The back closing an open face of the body: « inset », the opening of the hollow behind that face, `back.thickness`
 * deep from the body's outside — between the sides; « applied », the whole face, as deep — the sides then stop before
 * it (`walls` cut by it).
 */
function backPanel(feature: ShellFeature, target: Shape3D, walls: Shape3D[]): { back: Shape3D; walls: Shape3D[] } {
  const back = feature.back!;
  requirePositive(back.thickness, `${feature.name} : l'épaisseur du fond`);
  const face = resolveFace(target, back.face);
  if (face.geomType !== "PLANE") throw new GeometryError(`${feature.name} : le fond ferme une face plane.`);
  if (!feature.faces.some((ref) => resolveFace(target, ref).isSame(face))) throw new GeometryError(`${feature.name} : le fond ferme une face ouverte ; ouvrez-la d'abord.`);
  const n = normalOf(face);
  const c = centreOf(face);
  const wall = Math.abs(feature.thickness);
  if (back.mount === "applied") {
    const panel = faceSlab(face, n, back.thickness);
    const cut = walls.flatMap((w) => {
      const next = w.cut(panel) as Shape3D;
      w.delete();
      return next.solids.length ? [next] : (next.delete(), []);
    });
    return { back: panel, walls: cut };
  }
  // Inset: the face of the hollow behind the opening, brought out to the body's outside.
  const inner = drawnIn(target, wall);
  try {
    const behind = inner.faces.find((f) => {
      if (f.geomType !== "PLANE") return false;
      const m = normalOf(f);
      const b = centreOf(f);
      const depth = (c[0] - b[0]) * n[0] + (c[1] - b[1]) * n[1] + (c[2] - b[2]) * n[2];
      return m[0] * n[0] + m[1] * n[1] + m[2] * n[2] > 0.999 && Math.abs(depth - wall) < 1e-3;
    });
    if (!behind) throw new GeometryError(`${feature.name} : le fond ne trouve pas l'ouverture qu'il ferme.`);
    const out = behind.clone().translate([n[0] * wall, n[1] * wall, n[2] * wall]) as unknown as Face;
    return { back: faceSlab(out, n, back.thickness), walls };
  } finally {
    inner.delete();
  }
}

export function buildShell(feature: ShellFeature, lookup: OutputLookup): SolidOutput | SolidsOutput {
  // « Séparer les côtés »: a frame cut into its sides (features/ring-sides.ts) — already hollow, or a solid body emptied
  // first, open at both ends of its axis. (No thickness and no `frame`: the first such steps, bodies already hollow.)
  if (feature.sides === "separate" && !feature.back && !feature.faces.length && (feature.frame || feature.thickness === 0)) {
    const target = requireSolid(lookup, feature.target).shape;
    const joint = feature.joint ?? "miter";
    // A body of square panels joined into one (a caisson, a U, a shelf unit): a body per panel (board-split.ts), when
    // it is not a frame of one profile (its sides would not be straight along its axis).
    const boards = () => splitBoards(target, feature.pass ?? "largest");
    if (isFrame(target)) {
      try {
        return { kind: "solids", shapes: splitRing(feature.name, target, joint, feature.pass) };
      } catch (error) {
        const panels = error instanceof GeometryError ? boards() : null;
        if (panels) return { kind: "solids", shapes: panels };
        throw error;
      }
    }
    const panels = boards();
    if (panels) return { kind: "solids", shapes: panels };
    if (!(feature.thickness > 0)) throw new GeometryError(`${feature.name} : ce corps est plein ; saisissez l'épaisseur de ses côtés pour le vider.`);
    const ends = frameEnds(target, feature.open, feature.thickness);
    if (!ends) throw new GeometryError(feature.open ? `${feature.name} : la face choisie n'a pas de face plane en face d'elle à ouvrir aussi ; cliquez-en une autre.` : `${feature.name} : ce corps n'a pas deux faces planes qui se font face à ouvrir.`);
    const frame = hollowed(feature.name, target, ends, feature.thickness);
    try {
      return { kind: "solids", shapes: splitRing(feature.name, frame, joint, feature.pass) };
    } finally {
      frame.delete();
    }
  }
  requirePositive(Math.abs(feature.thickness), `${feature.name} : l'épaisseur`);
  const target = requireSolid(lookup, feature.target).shape;
  const open = feature.faces.map((ref) => resolveFace(target, ref));
  if (open.some((f) => f.geomType !== "PLANE")) throw new GeometryError(`${feature.name} : seules des faces planes peuvent rester ouvertes.`);
  if (!feature.back) {
    if (feature.sides === "separate") return { kind: "solids", shapes: separateSides(feature, target, open) };
    return solidsResult(hollowed(feature.name, target, open, Math.abs(feature.thickness)), feature.name);
  }
  // With its back: a body of its own, first; the sides (or the walls joined) after it.
  const walls = feature.sides === "separate" ? separateSides(feature, target, open) : [hollowed(feature.name, target, open, Math.abs(feature.thickness))];
  try {
    const made = backPanel(feature, target, walls);
    if (!isShapeValid(made.back)) throw new GeometryError(`${feature.name} : le fond obtenu est invalide.`);
    const parts = made.walls.flatMap((w) => (w.solids.length > 1 ? w.solids.map((s) => s.clone() as Shape3D) : [w]));
    return { kind: "solids", shapes: [made.back, ...parts] };
  } catch (error) {
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${feature.name} : le fond ne se fait pas ; essayez une épaisseur plus fine.`);
  }
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
