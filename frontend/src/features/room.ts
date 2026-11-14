/** La pièce relevée dans le noyau : chaque mur (ses fenêtres et portes percées), chaque prise, retombée et rampant. */
import { draw, Plane, type Shape3D } from "replicad";
import type { RoomFeature } from "../document/types";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import type { SolidsOutput } from "./outputs";
import { roomPieces, type Prism } from "./room-plan";

function prismShape(p: Prism): Shape3D {
  let d = draw(p.points[0]!);
  for (const q of p.points.slice(1)) d = d.lineTo(q);
  return d.close().sketchOnPlane(new Plane(p.origin, p.xDir, p.normal)).extrude(p.length) as Shape3D;
}

export function buildRoom(feature: RoomFeature): SolidsOutput {
  if (!feature.walls.length) throw new GeometryError(`${feature.name} : aucun mur.`);
  const { pieces, openings, leans } = roomPieces(feature);
  const shapes: Shape3D[] = [];
  try {
    pieces.forEach((piece, i) => {
      let shape = prismShape(piece.prism);
      // Out of plumb: the wedge along its room face, added or cut, before its openings.
      for (const lean of leans.filter((x) => piece.kind === "wall" && x.wall === i)) {
        const tool = prismShape(lean.prism);
        const made = (lean.mode === "join" ? shape.fuse(tool) : shape.cut(tool)) as Shape3D;
        shape.delete();
        tool.delete();
        shape = made;
      }
      for (const o of openings.filter((x) => piece.kind === "wall" && x.wall === i)) {
        const tool = prismShape(o.prism);
        const cut = shape.cut(tool) as Shape3D;
        shape.delete();
        tool.delete();
        shape = cut;
      }
      if (!isShapeValid(shape)) {
        shape.delete();
        throw new GeometryError(`${feature.name} : « ${piece.name} » est invalide (une ouverture déborde-t-elle du mur ?).`);
      }
      shapes.push(shape);
    });
  } catch (error) {
    for (const s of shapes) s.delete();
    throw error instanceof GeometryError ? error : new GeometryError(`${feature.name} : ${error instanceof Error ? error.message : String(error)}`);
  }
  return { kind: "solids", shapes };
}
