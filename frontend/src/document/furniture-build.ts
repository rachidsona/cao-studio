/**
 * Un meuble de l'« Assistant meuble » posé dans le document : ses caissons (des Répartitions extrudées, avec leur
 * intérieur, leurs portes et leur fond : document/caisson-spec.ts) et ses planches libres (une esquisse cachée, un
 * rectangle extrudé), dans la matière choisie, nommés d'après lui (« Bureau 1 — Plateau »). Il regarde vers −Y, comme une
 * Répartition dessinée de face ; `place` est le coin avant gauche de son pied. Une seule annulation. Pur.
 */
import { withCaissonPlaced } from "./caisson-spec";
import { BACK, furnitureLayout, furnitureModel, furnitureSize, type FurnitureAsk } from "./furniture-models";
import { setBodyInfo } from "./materials";
import { uniqueId, uniqueName } from "./operations";
import { rectangleAt } from "./sketch";
import type { CadDocument, Feature, Vec3 } from "./types";

/** « Bureau 2 » when a « Bureau 1 » (or one of its parts, « Bureau 1 — Plateau ») is there. */
function furnitureName(doc: CadDocument, base: string): string {
  const taken = (name: string) => doc.features.some((f) => f.name === name || f.name.startsWith(`${name} — `));
  let n = 1;
  while (taken(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** The furniture added at `place` (front left corner of its foot), in `material`; its name and new features. */
export function withFurniture(base: CadDocument, ask: FurnitureAsk, place: Vec3, material: string): { doc: CadDocument; name: string; features: string[] } | string {
  const layout = furnitureLayout(ask);
  if (typeof layout === "string") return layout;
  const name = furnitureName(base, furnitureModel(ask.kind).label);
  const [X0, Yfront, Z0] = place;
  // Its back: the furniture runs from its front (at Yfront) back to it, along +Y.
  const Yback = Yfront + furnitureSize(ask)[1];
  const known = new Set(base.features.map((f) => f.id));
  let doc = base;
  for (const piece of layout.pieces) {
    // The panels' back, the back board behind them.
    const frame = { origin: [X0 + piece.at[0], Yback - piece.at[1] - BACK, Z0 + piece.at[2]] as Vec3, xDir: [1, 0, 0] as Vec3, normal: [0, -1, 0] as Vec3 };
    const made = withCaissonPlaced(doc, { ...piece.spec, carcass: material, facing: material }, { frame, width: piece.width, height: piece.height, name: layout.pieces.length > 1 || layout.boards.length ? `${name} — ${piece.name}` : name });
    if (typeof made === "string") return `${piece.name} : ${made}`;
    doc = made.doc;
  }
  const boards: string[] = [];
  for (const board of layout.boards) {
    const [x0, x1] = [X0 + board.from[0], X0 + board.to[0]];
    const [y0, y1] = [Yback - board.to[1], Yback - board.from[1]];
    const [z0, z1] = [Z0 + board.from[2], Z0 + board.to[2]];
    const sketch: Feature = { id: uniqueId(doc, "sk"), type: "sketch", name: uniqueName(doc, "Esquisse"), plane: "XY", offset: z0, hidden: true, ...rectangleAt((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0) };
    doc = { ...doc, features: [...doc.features, sketch] };
    const id = uniqueId(doc, "ex");
    doc = { ...doc, features: [...doc.features, { id, type: "extrude", name: `${name} — ${board.name}`, sketch: sketch.id, distance: z1 - z0, operation: "new" }] };
    boards.push(id);
  }
  if (boards.length) doc = setBodyInfo(doc, boards, { material });
  const features = doc.features.filter((f) => !known.has(f.id)).map((f) => f.id);
  return { doc, name, features };
}
