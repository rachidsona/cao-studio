/**
 * Les murs qui cachent la pièce s'effacent d'eux-mêmes : la vue tournée, le mur entre l'œil et la pièce (l'œil passé
 * derrière lui) n'est plus dessiné et un clic le traverse ; il revient dès qu'on repasse devant. Les meubles de ce
 * mur — ceux qui lui tournent le dos (document/furniture-facing.ts), entiers, et eux seuls : ceux des autres murs
 * restent, même dans l'angle — s'effacent avec lui, le mur le plus en travers d'abord, jamais au point de ne plus
 * rien laisser à regarder (une cuisine sur un seul mur, ou en L vue de derrière son angle). Deux cases du menu « Affichage » le règlent (activées d'office, retenues par le navigateur). La vue
 * seulement : le document n'en change pas.
 */
import { bodyFamily } from "../document/display-families";
import { featureBacks, type Facing } from "../document/furniture-facing";
import { bodyInfo } from "../document/materials";
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type Vec3 } from "../document/types";
import type { BodyMesh } from "../geometry/protocol";
import type { Viewport } from "../viewport/viewport";
import { furnitureOut, pieceOf, slabOf, wallOf, wallsBehind, type Slab } from "../viewport/wall-cutaway";
import type { Editor } from "./editor";

const KEY = "cao.wall-cutaway";
const FURNITURE_KEY = "cao.wall-cutaway-furniture";
/** Each wall's slab, once per mesh (null: not a wall). */
const slabs = new WeakMap<BodyMesh, Slab | null>();

export function bindWallCutaway(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const box = root.querySelector<HTMLInputElement>("[data-wall-cutaway]");
  const canvas = root.querySelector<HTMLCanvasElement>("canvas.cad-view");
  let on = true;
  try {
    on = localStorage.getItem(KEY) !== "0";
  } catch {
    // No storage: on.
  }
  if (box) box.checked = on;
  // With them, the furniture standing against them.
  const units = root.querySelector<HTMLInputElement>("[data-wall-cutaway-furniture]");
  let withFurniture = true;
  try {
    withFurniture = localStorage.getItem(FURNITURE_KEY) !== "0";
  } catch {
    // No storage: on.
  }
  if (units) [units.checked, units.disabled] = [withFurniture, !on];
  // The walls, what stands against each, and the middle of the room, read again when the bodies are drawn again.
  let walls: Map<string, Slab> | null = null;
  let against = new Map<string, string[]>();
  /** The furniture: every body that is not of the room, nor a light; and what of it must not all go. */
  let furniture: string[] = [];
  let counts: string[] = [];
  let drawn = new Map<string, string[]>();
  let inside: [number, number] = [0, 0];
  let last = "";
  const read = () => {
    const doc = editor.doc;
    walls = new Map();
    furniture = [];
    const boxes = new Map<string, BodyMesh["metrics"]["bbox"]>();
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    let [w0, v0, w1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of viewport.displayedBodies) {
      const mesh = viewport.bodyMesh(id);
      if (!mesh) continue;
      const [lo, hi] = mesh.metrics.bbox;
      const light = !!bodyInfo(doc, id).light;
      // The walls of the room: of a surveyed room, or drawn by a plan (its other room bodies too, slabs or not).
      const wall = (findFeature(doc, featureOfBody(bodyOrigin(doc, id)))?.type === "room" || bodyFamily(doc, id) === "room") && !light;
      if (wall) {
        if (!slabs.has(mesh)) slabs.set(mesh, slabOf(mesh.vertices, mesh.indices));
        const slab = slabs.get(mesh);
        if (slab) walls.set(id, slab);
        [w0, v0, w1, v1] = [Math.min(w0, lo[0]!), Math.min(v0, lo[1]!), Math.max(w1, hi[0]!), Math.max(v1, hi[1]!)];
      } else {
        boxes.set(id, mesh.metrics.bbox);
        if (!light) furniture.push(id);
        [x0, y0, x1, y1] = [Math.min(x0, lo[0]!), Math.min(y0, lo[1]!), Math.max(x1, hi[0]!), Math.max(y1, hi[1]!)];
      }
    }
    // The room: where the furniture is, else the middle of the walls.
    inside = Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : [(w0 + w1) / 2, (v0 + v1) / 2];
    // Each body with the wall it is furniture of: the one its furniture turns its back to.
    const backs = featureBacks(doc);
    const facing = new Map<string, Facing>();
    const pieces = new Map<string, [Vec3, Vec3]>();
    for (const [body, [lo, hi]] of boxes) {
      const known = backs.get(featureOfBody(bodyOrigin(doc, body)));
      if (!known) continue;
      facing.set(body, known);
      const box = pieces.get(known.group);
      pieces.set(known.group, box ? [box[0].map((v, i) => Math.min(v, lo[i]!)) as Vec3, box[1].map((v, i) => Math.max(v, hi[i]!)) as Vec3] : [[...lo], [...hi]]);
    }
    // What equips a piece with no way of its own (hinges, sliding doors, accessories, lights): as the piece it is on.
    const groupBack = new Map([...facing.values()].map((f) => [f.group, f.back]));
    for (const [body, box] of boxes) {
      const piece = facing.has(body) ? null : pieceOf(pieces, box);
      if (piece) facing.set(body, { back: groupBack.get(piece)!, group: piece });
    }
    against = new Map([...walls.keys()].map((id) => [id, []]));
    for (const [body, box] of boxes) {
      const wall = wallOf(walls, inside, box, facing.get(body)?.back ?? null);
      if (wall) against.get(wall)!.push(body);
    }
    // The sketch of each piece (a zone's Répartition), with the bodies made on it: it goes when they all do.
    drawn = new Map();
    for (const body of boxes.keys()) {
      const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, body)));
      const sketch = (feature?.type === "extrude" || feature?.type === "niche") && feature.sketch;
      if (sketch) drawn.set(sketch, [...(drawn.get(sketch) ?? []), body]);
    }
    // What is worth looking at: the furniture one knows the back of (units, caissons, what goes with them); else all.
    const known = furniture.filter((body) => facing.has(body));
    counts = known.length ? known : furniture;
    if (canvas) canvas.dataset.walls = String(walls.size);
    last = "";
  };
  const update = () => {
    if (!on || !walls) return;
    const eye = viewport.eye();
    const key = eye.map((v) => Math.round(v)).join(",");
    if (key === last) return;
    last = key;
    const cut = wallsBehind(walls, inside, eye);
    // Their furniture shows its back only: out too, the most in the way first, never all there is to look at.
    const hidden = withFurniture ? furnitureOut(cut, against, counts) : new Set<string>();
    viewport.setCutaway(new Set([...cut, ...hidden]));
    viewport.setSketchCutaway(new Set([...drawn].filter(([, bodies]) => bodies.every((id) => hidden.has(id))).map(([sketch]) => sketch)));
    // How many are out of the view, on the view itself (for the tests).
    if (canvas) {
      canvas.dataset.wallsCut = String(cut.size);
      canvas.dataset.furnitureCut = String(hidden.size);
    }
  };
  viewport.onEachFrame(update);
  const store = (key: string, value: boolean) => {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
  };
  const again = () => {
    last = "";
    if (on) return update();
    viewport.setCutaway(new Set());
    viewport.setSketchCutaway(new Set());
    if (canvas) canvas.dataset.wallsCut = canvas.dataset.furnitureCut = "0";
  };
  box?.addEventListener("change", () => {
    on = box.checked;
    if (units) units.disabled = !on;
    store(KEY, on);
    again();
  });
  units?.addEventListener("change", () => {
    withFurniture = units.checked;
    store(FURNITURE_KEY, withFurniture);
    again();
  });
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    read();
  };
  read();
}
