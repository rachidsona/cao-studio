/**
 * « Cotes des pièces » (colonne Vue, à droite de la vue) : un interrupteur qui cote chaque pièce vue de face : sa largeur et sa hauteur, et sur une planche vue par la tranche sa longueur
 * (features/piece-dims.ts). L'élément sélectionné — un caisson avec ses façades, une répartition entière… — n'a que
 * les siennes, et les garde pendant qu'un outil travaille dessus ; sans sélection, toutes les pièces en vue. Seules
 * les cotes qu'on voit s'écrivent (une porte cache le caisson derrière) ; elles suivent la vue quand elle tourne et le
 * modèle quand il change. Éteint, plus rien ; l'état est gardé dans ce navigateur. Sans outil en cours, un clic sur
 * une cote la change (document/piece-size.ts) ; une cote de Répartition se change d'un clic même pendant qu'un outil y
 * travaille (Étagères, Cloisons, Tiroirs…), avec la calculatrice (« 290 − 2 × 1,8 »), et l'outil suit.
 *
 * Une Répartition a ses cotes de plan, autour du meuble (plan-dims-view.ts) : celles-là remplacent les cotes de ses
 * pièces, et s'affichent d'elles-mêmes tant qu'on y travaille (Répartition, Étagères, Cloisons, Penderie, Tiroirs,
 * Dressing), même éteint ; le bouton les masque jusqu'à la fin de l'outil.
 */
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type Axis, type CadDocument, type Vec3 } from "../document/types";
import type { PartitionPlan } from "../features/partition-dims";
import { pieceDims, viewAxes, type Box } from "../features/piece-dims";
import { formatLength } from "../measurements/units";
import { frameOf, toWorld } from "../sketcher/frame";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { documentPlans, joineryPlans } from "./dressing/partition-plan";
import { withPieceSize } from "../document/piece-size";
import { editDim, editValue } from "./dim-editor";
import { PlanDimsView, type DimEdit } from "./dressing/plan-dims-view";
import { disposeFat, fatSegments } from "../viewport/fat-lines";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { sketchShown } from "./zone-view";

const KEY = "cao.piece-dims";
const COLOR = 0xf8500a;
/** More pieces than this in view: only the nearest are written. */
const MAX_PIECES = 300;

export function bindPieceDims(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const button = root.querySelector<HTMLButtonElement>("[data-piece-dims]");
  const plansView = new PlanDimsView(viewport);
  /** Hidden by the button while a tool of joinery works. */
  let dismissed = false;
  const working = () => joineryPlans.current !== null;
  const shown = () => (working() ? !dismissed : on);
  const group = new THREE.Group();
  group.renderOrder = 47;
  viewport.scene.add(group);
  const raycaster = new THREE.Raycaster();
  let on = false;
  try {
    on = localStorage.getItem(KEY) === "1";
  } catch {
    // No storage: off.
  }
  /** The features of the element worked on (kept while a tool has emptied the selection). */
  let element: Set<string> | null = null;
  let stamp = "";
  let moved = 0;

  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof CSS2DObject) child.element.remove();
      if (child.userData.fat) disposeFat(child as LineSegments2);
    }
  };

  /** The features of the selected bodies, a cabinet with its fronts. */
  const selectedElement = (): Set<string> | null => {
    const doc = editor.doc;
    const ids = new Set<string>();
    for (const body of editor.picked.selection.bodies) {
      const f = findFeature(doc, featureOfBody(bodyOrigin(doc, body)));
      if (!f) continue;
      ids.add(f.type === "fronts" ? f.cabinet : f.id);
    }
    if (!ids.size) return null;
    // A cabinet with its fronts; a board of a Répartition with all the boards of its sketch.
    const sketches = new Set(doc.features.flatMap((f) => (f.type === "extrude" && f.sketch && ids.has(f.id) ? [f.sketch] : [])));
    for (const f of doc.features) {
      if (f.type === "fronts" && ids.has(f.cabinet)) ids.add(f.id);
      if (f.type === "extrude" && f.sketch && sketches.has(f.sketch)) ids.add(f.id);
    }
    return ids;
  };

  const boxOf = (id: string): Box | null => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };

  /** True when nothing stands between the eye and this point of this body. */
  const seen = (bodyId: string, p: Vec3, meshes: THREE.Object3D[]): boolean => {
    const eye = viewport.camera.position;
    const target = new THREE.Vector3(...p);
    const direction = target.clone().sub(eye);
    const distance = direction.length();
    raycaster.set(eye, direction.normalize());
    raycaster.far = distance + 1;
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return !hit || hit.object.userData.bodyId === bodyId || hit.distance >= distance - 2;
  };

  /** The sketch of a body made by a Répartition's sketch or equipping its niches. */
  const sketchOfBody = (doc: CadDocument, id: string): string | null => {
    const f = findFeature(doc, featureOfBody(bodyOrigin(doc, id)));
    return f && (f.type === "extrude" || f.type === "niche") ? (f.sketch ?? null) : null;
  };

  /** How far the panels of a sketch were moved from it, when they were moved without turning. */
  const shiftOf = (bodies: string[], expected: THREE.Box3): Vec3 => {
    const actual = new THREE.Box3();
    for (const id of bodies) {
      const box = boxOf(id);
      if (box) actual.expandByPoint(new THREE.Vector3(...box[0])).expandByPoint(new THREE.Vector3(...box[1]));
    }
    if (actual.isEmpty() || actual.getSize(new THREE.Vector3()).distanceTo(expected.getSize(new THREE.Vector3())) > 1) return [0, 0, 0];
    return actual.min.clone().sub(expected.min).toArray() as Vec3;
  };

  /** The dimensions of the Répartitions; the sketches they took care of. */
  const drawPlans = (element: Set<string> | null): Set<string> => {
    plansView.clear();
    const doc = editor.doc;
    const current = joineryPlans.current;
    // Doors hidden (the display menu, the eye of the navigator) leave the niches behind them in sight.
    const seenBodies = new Set(viewport.bodyMeshes().filter((m) => m.visible).map((m) => m.userData.bodyId as string));
    const doorsSeen = (sketch: string | undefined) =>
      doc.features.some((f) => f.type === "niche" && (f.fill === "doors" || f.fill === "door") && f.sketch === sketch && [...seenBodies].some((id) => id.startsWith(`${f.id}#`)));
    const withDoors = <T extends PartitionPlan>(plans: T[], sketch: string | undefined): T[] => (doorsSeen(sketch) ? plans : plans.map((p) => ({ ...p, doors: [] })));
    if (current) {
      // A Répartition already made, worked on by a tool: its dimensions round it are changed by a click as without one
      // (not those inside its niches, where the tool's clicks go).
      if (shown()) for (const w of current) plansView.show(w.frame, w.preview ? w.plans : withDoors(w.plans, w.sketch?.id), editor.unit, [0, 0, 0], !w.preview && w.sketch ? edit(w.sketch.id) : undefined, false);
      return new Set(current.flatMap((w) => (w.sketch ? [w.sketch.id] : [])));
    }
    const done = new Set<string>();
    const panels = viewport.displayedBodies.map((id) => ({ id, sketch: sketchOfBody(doc, id) }));
    for (const { sketch, plans } of documentPlans(doc)) {
      if (!sketchShown(sketch.id)) continue;
      const own = panels.filter((p) => p.sketch === sketch.id).map((p) => p.id);
      const moved = own.filter((id) => findFeature(doc, featureOfBody(bodyOrigin(doc, id)))?.type === "extrude");
      if (!moved.length || (element && !moved.some((id) => element.has(featureOfBody(bodyOrigin(doc, id)))))) continue;
      const frame = frameOf(sketch);
      const expected = new THREE.Box3();
      for (const plan of plans) {
        for (const [x, y] of [[plan.outer.x0, plan.outer.y0], [plan.outer.x1, plan.outer.y1]] as const) {
          const corner = new THREE.Vector3(...toWorld(frame, x, y));
          expected.expandByPoint(corner).expandByPoint(corner.clone().addScaledVector(new THREE.Vector3(...frame.normal), plan.depth));
        }
      }
      plansView.show(frame, withDoors(plans, sketch.id), editor.unit, shiftOf(moved, expected), edit(sketch.id));
      done.add(sketch.id);
    }
    return done;
  };

  /** A click on a dimension of this Répartition: the calculator, the niche or the whole of it made that size. */
  const edit = (sketch: string): DimEdit => (label, axis, span, value, whole) => editDim(editor, sketch, label, axis, span, value, whole);

  const draw = () => {
    clear();
    if (!shown()) return void plansView.clear();
    const picked = selectedElement();
    if (picked) element = picked;
    else if (!root.dataset.tool) element = null;
    const doc = editor.doc;
    const planned = drawPlans(element);
    // At work in a Répartition with the button off, or on a preview: the plan's dimensions alone.
    if (!on || joineryPlans.current?.some((w) => w.preview)) return;
    const hidden = new Set(viewport.bodyMeshes().filter((m) => !m.visible).map((m) => m.userData.bodyId as string));
    const bodies = viewport.displayedBodies.filter((id) => {
      if (hidden.has(id)) return false;
      const sketch = sketchOfBody(doc, id);
      return (!sketch || !planned.has(sketch)) && (!element || element.has(featureOfBody(bodyOrigin(doc, id))));
    });
    const eye = viewport.camera.position;
    const toEye = viewport.camera.getWorldDirection(new THREE.Vector3()).negate();
    const up = viewport.camera.up.clone().applyQuaternion(viewport.camera.quaternion);
    const axes = viewAxes([toEye.x, toEye.y, toEye.z], [up.x, up.y, up.z]);
    const meshes = viewport.bodyMeshes().filter((m) => m.visible);
    const nearest = bodies
      .map((id) => ({ id, box: boxOf(id) }))
      .filter((b): b is { id: string; box: Box } => !!b.box)
      .sort((a, b) => eye.distanceTo(center(a.box)) - eye.distanceTo(center(b.box)))
      .slice(0, MAX_PIECES);
    const points: number[] = [];
    // Where the values already written are on the screen: one landing on another (a double side) is left out.
    const rect = viewport.renderer.domElement.getBoundingClientRect();
    const written: [number, number][] = [];
    const onScreen = (p: Vec3): [number, number] => {
      const v = new THREE.Vector3(...p).project(viewport.camera);
      return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
    };
    for (const { id, box } of nearest) {
      for (const d of pieceDims(box, axes)) {
        // Seen along most of its line (not only through the gap between two doors).
        const looks = [0.25, 0.5, 0.75].map((t) => d.from.map((v, i) => v + (d.to[i]! - v) * t) as Vec3);
        if (looks.filter((p) => seen(id, p, meshes)).length < 2) continue;
        const [x, y] = onScreen(d.at);
        if (written.some(([wx, wy]) => Math.abs(wx - x) < 34 && Math.abs(wy - y) < 14)) continue;
        written.push([x, y]);
        // The line and a short tick across each end.
        const tick = Math.min(d.length / 8, 25);
        const along = d.from.findIndex((v, i) => Math.abs(v - d.to[i]!) > 1e-6);
        const across = along === axes.up ? axes.across : axes.up;
        points.push(...d.from, ...d.to);
        for (const end of [d.from, d.to]) {
          const a = [...end] as Vec3;
          const b = [...end] as Vec3;
          a[across] = end[across]! - tick;
          b[across] = end[across]! + tick;
          points.push(...a, ...b);
        }
        const span = document.createElement("span");
        span.className = "cad-piece-dim";
        span.textContent = formatLength(d.length, editor.unit).replace(/\s*[a-zµ]+$/i, "");
        if (!root.dataset.tool) {
          span.dataset.editable = "";
          span.style.pointerEvents = "auto";
          span.style.cursor = "text";
          span.title = "Cliquez pour changer cette cote";
          span.addEventListener("pointerdown", (event) => event.stopPropagation());
          span.addEventListener("click", () => editValue(editor, span, d.length, (mm) => withPieceSize(editor.doc, id, along as Axis, d.length, mm)));
        }
        const label = new CSS2DObject(span);
        label.position.set(...d.at);
        group.add(label);
      }
    }
    // A few pixels wide over a pale halo, as the Répartition's (dressing/plan-dims-view.ts): readable on wood.
    if (points.length) {
      const vectors = Array.from({ length: points.length / 3 }, (_, n) => new THREE.Vector3(points[3 * n], points[3 * n + 1], points[3 * n + 2]));
      ([[0xffffff, 4.5, 0.7], [COLOR, 1.8, 1]] as const).forEach(([color, width, opacity], n) => {
        const line = fatSegments(vectors, color, width);
        (line.material as THREE.Material & { opacity: number }).opacity = opacity;
        // Hidden behind the bodies, as before (a door hides the cabinet's dimensions behind it).
        line.material.depthTest = true;
        line.renderOrder = 47 + n;
        group.add(line);
      });
    }
  };

  // Drawn again when the view stops turning (the axes and what hides what change) and when the pieces change.
  const look = () => {
    const c = viewport.camera;
    return [...c.position.toArray(), ...c.quaternion.toArray()].map((v) => v.toFixed(3)).join();
  };
  let frames = 0;
  viewport.onEachFrame(() => {
    if (!shown() || ++frames % 6) return;
    const now = look() + viewport.displayedBodies.map((id) => viewport.bodyMesh(id)?.metrics.bbox.join()).join("|");
    if (now !== stamp) {
      stamp = now;
      moved = performance.now();
      clear();
    } else if (moved && performance.now() - moved > 120) {
      moved = 0;
      draw();
    }
  });

  const pressed = () => button?.setAttribute("aria-pressed", String(shown()));
  const set = (value: boolean) => {
    if (working()) {
      dismissed = !value;
      pressed();
      stamp = "";
      draw();
      return;
    }
    on = value;
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      // Kept for this page only.
    }
    pressed();
    stamp = "";
    draw();
  };
  button?.addEventListener("click", () => set(!shown()));
  pressed();
  joineryPlans.changed = () => {
    if (!working()) dismissed = false;
    pressed();
    stamp = "";
    draw();
  };

  editor.afterRender(() => {
    if (shown()) draw();
  });
}

const center = (b: Box) => new THREE.Vector3((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2);
