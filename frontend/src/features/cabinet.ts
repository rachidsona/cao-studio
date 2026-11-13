/**
 * Parametric cabinet (kitchen units, wardrobes, cupboards): from its outer
 * width, height and depth, the board thickness, the back, the shelves and the
 * plinth, every part is a board of its own (a body): left and right sides,
 * bottom, top, back, shelves. Changing a dimension rebuilds all the parts.
 *
 * Axes: X along the width (left to right), Y along the depth (front face at
 * the origin, back further in +Y), Z up. The origin is the front-left-bottom
 * corner of the cabinet.
 *
 * Construction: the sides run full height and the top, bottom and shelves
 * fit between them ("sides through"), or the top and bottom run full width
 * and the sides fit between them. The back is screwed on (full outer size,
 * the carcass is shallower by its thickness) or inset (inner size, the
 * horizontal boards stop in front of it). A plinth raises the bottom: the
 * sides go down to the floor. Handleless fronts notch the front edge of the sides where their gorge profiles run
 * (`notches`, stamped from the fronts: features/fronts-parts.ts stampGorges).
 */
import { makeBox, type Shape3D } from "replicad";
import type { CabinetFeature, Vec3 } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { cabinetParts, cabinetProblem } from "./cabinet-parts";
import type { SolidsOutput } from "./outputs";

export { cabinetPartNames, cabinetParts, cabinetProblem, type CabinetPart } from "./cabinet-parts";

/** The shape turned with its cabinet about the vertical through the cabinet's origin (the shape is consumed). */
export function turnedWith(shape: Shape3D, cabinet: { origin: Vec3; rotation?: number }): Shape3D {
  return cabinet.rotation ? (shape.rotate(cabinet.rotation, cabinet.origin, [0, 0, 1]) as Shape3D) : shape;
}

/** A side with the notches of the gorge profiles cut in its front edge (the shape is consumed). */
function notched(solid: Shape3D, part: { from: Vec3; to: Vec3 }, feature: CabinetFeature): Shape3D {
  const [, oy, oz] = feature.origin;
  for (const n of feature.notches ?? []) {
    // Over the side's thickness and a little out of its front face, for a clean cut.
    const tool = makeBox([part.from[0] - 1, oy - 1, oz + n.z0], [part.to[0] + 1, oy + n.depth, oz + n.z1]) as unknown as Shape3D;
    const cut = solid.cut(tool) as Shape3D;
    solid.delete();
    tool.delete();
    solid = cut;
  }
  return solid;
}

export function buildCabinet(feature: CabinetFeature): SolidsOutput {
  const problem = cabinetProblem(feature);
  if (problem) throw new GeometryError(`${feature.name} : ${problem}`);
  const parts = cabinetParts(feature);
  const shapes: Shape3D[] = [];
  try {
    for (const part of parts) {
      let solid = makeBox(part.from, part.to) as unknown as Shape3D;
      if (part.name.startsWith("Côté")) solid = notched(solid, part, feature);
      if (!isShapeValid(solid)) {
        solid.delete();
        throw new GeometryError(`${feature.name} : la pièce « ${part.name} » est invalide.`);
      }
      shapes.push(turnedWith(solid, feature));
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error;
  }
  return { kind: "solids", shapes };
}
