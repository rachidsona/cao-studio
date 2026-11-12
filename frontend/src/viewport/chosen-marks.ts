/**
 * Ce qu'un outil a déjà choisi, marqué tant qu'il est ouvert : la face (ou le corps) de départ en orange — ce qui
 * bouge, ce qui se prolonge, la cible —, celle d'arrivée en bleu — où il va, les corps outils —, ce qui est enlevé en
 * rouge (les corps outils d'une découpe). Le survol reste vert.
 * Chaque marque garde la forme qu'avait la face au clic : un aperçu qui refait les corps ne l'efface pas.
 */
import * as THREE from "three";
import type { BodyObject } from "./body-layer";
import type { FacePick } from "./selection-layer";

/** First chosen (what moves, what is extended, the target), second (where it goes, the tools), or what is taken away (the tools of a cut). */
export type MarkRole = "first" | "second" | "remove";
export type ChosenMark = ({ face: FacePick } | { body: string }) & { role: MarkRole };

const COLORS: Record<MarkRole, number> = { first: 0xf97316, second: 0x0ea5e9, remove: 0xef4444 };

/**
 * The edges of a set of triangles used by one triangle only: the outline of a face. Edges are matched by where their
 * ends are (to 0,01 mm), the triangles of a face not always sharing their vertices.
 */
function outlineOf(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, indices: ArrayLike<number>): Float32Array {
  const at = (v: number) => `${Math.round(positions.getX(v) * 100)},${Math.round(positions.getY(v) * 100)},${Math.round(positions.getZ(v) * 100)}`;
  const count = new Map<string, [number, number]>();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    for (const [a, b] of [[indices[t]!, indices[t + 1]!], [indices[t + 1]!, indices[t + 2]!], [indices[t + 2]!, indices[t]!]] as [number, number][]) {
      const [p, q] = [at(a), at(b)];
      if (p === q) continue;
      const key = p < q ? `${p}|${q}` : `${q}|${p}`;
      if (count.has(key)) count.delete(key);
      else count.set(key, [a, b]);
    }
  }
  const out = new Float32Array(count.size * 6);
  let k = 0;
  for (const [a, b] of count.values()) {
    for (const v of [a, b]) {
      out[k++] = positions.getX(v);
      out[k++] = positions.getY(v);
      out[k++] = positions.getZ(v);
    }
  }
  return out;
}

const keyOf = (mark: ChosenMark) => ("face" in mark ? `${mark.face.bodyId}/${mark.face.faceIndex}` : mark.body);

export class ChosenMarks {
  private readonly group = new THREE.Group();
  /** Each mark shown, by what it marks: kept as it was drawn while it stays chosen. */
  private readonly shown = new Map<string, THREE.Object3D[]>();
  private readonly tints: Record<MarkRole, THREE.MeshBasicMaterial>;
  private readonly lines: Record<MarkRole, THREE.LineBasicMaterial>;

  constructor(scene: THREE.Scene) {
    const tint = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    const line = (color: number) => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
    this.tints = { first: tint(COLORS.first), second: tint(COLORS.second), remove: tint(COLORS.remove) };
    this.lines = { first: line(COLORS.first), second: line(COLORS.second), remove: line(COLORS.remove) };
    scene.add(this.group);
  }

  materials(): THREE.Material[] {
    return [...Object.values(this.tints), ...Object.values(this.lines)];
  }

  /**
   * Shows these marks in place of the previous ones (none: nothing marked). A mark already shown stays as it was
   * drawn (its body may be replaced by a preview meanwhile); a new one is drawn from the body as it is now.
   */
  set(marks: readonly ChosenMark[], bodies: ReadonlyMap<string, BodyObject>): void {
    const keep = new Set(marks.map(keyOf));
    for (const [key, objects] of this.shown) {
      if (keep.has(key)) continue;
      for (const o of objects) {
        this.group.remove(o);
        (o as THREE.Mesh).geometry.dispose();
      }
      this.shown.delete(key);
    }
    for (const mark of marks) {
      const key = keyOf(mark);
      const shown = this.shown.get(key);
      if (shown) {
        // Still chosen, maybe in another role (the tools of a join become those of a cut): only its colour changes.
        const [tint, outline] = shown as [THREE.Mesh, THREE.LineSegments];
        tint.material = this.tints[mark.role];
        outline.material = this.lines[mark.role];
        tint.userData.chosen = outline.userData.chosen = mark.role;
        continue;
      }
      const objects = this.draw(mark, bodies);
      if (!objects) continue;
      this.shown.set(key, objects);
      this.group.add(...objects);
    }
  }

  /** The tint and outline of a mark, copied from its body as it is now; null when it is not shown. */
  private draw(mark: ChosenMark, bodies: ReadonlyMap<string, BodyObject>): THREE.Object3D[] | null {
    const body = bodies.get("face" in mark ? mark.face.bodyId : mark.body);
    if (!body) return null;
    const positions = body.mesh.geometry.getAttribute("position");
    const all = body.data.indices;
    const range = "face" in mark ? body.data.faceGroups[mark.face.faceIndex] : { start: 0, count: all.length };
    if (!range) return null;
    // Copies: the marks stay as they were when chosen, whatever the preview does to the bodies.
    const indices = all.slice(range.start, range.start + range.count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((positions.array as Float32Array).slice()), 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const tint = new THREE.Mesh(geometry, this.tints[mark.role]);
    tint.renderOrder = 46;
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.BufferAttribute("face" in mark ? outlineOf(positions, indices) : new Float32Array((body.edges.geometry.getAttribute("position").array as Float32Array).slice()), 3));
    const outline = new THREE.LineSegments(edges, this.lines[mark.role]);
    outline.renderOrder = 47;
    tint.userData.chosen = outline.userData.chosen = mark.role;
    return [tint, outline];
  }
}
