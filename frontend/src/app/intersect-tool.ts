/**
 * « Lignes tout autour » (groupe Curic, comme l'outil Intersect de Curic OI) : on clique une face plane d'un corps,
 * puis on tire la flèche plantée dedans ou on tape la distance ; une ligne fait le tour du corps, parallèle à la face,
 * à cette distance — la coupe du corps par ce plan, posée en esquisse (« Intersection 1 ») : le corps reste entier.
 * « Nombre » la répète au même pas (le « *n » de Curic) ; « Répartir » partage l'épaisseur du corps en parts égales
 * (son « /n »). « Tous les corps traversés » trace aussi la ligne sur les autres corps que le plan coupe (son « Ctrl :
 * prendre un objet »). Une esquisse fermée se tire ensuite comme une autre (Extruder, Magie extrude).
 */
import { uniqueId } from "../document/operations";
import type { Feature, PlaneName, SketchFeature, Vec3 } from "../document/types";
import type { EdgeOutline } from "../geometry/protocol";
import { formatLength } from "../measurements/units";
import { frameOf } from "../sketcher/frame";
import { projectEdge } from "../sketcher/projection";
import { ArrowHandle } from "../viewport/arrow-handle";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The reference face: its body, a point of it and its outward normal. */
interface Reference {
  bodyId: string;
  point: Vec3;
  normal: Vec3;
}

/** A plane parallel to the face, `distance` inside the body: its point and axes in it. */
function planeAt(ref: Reference, distance: number): { origin: Vec3; u: Vec3; v: Vec3; name: PlaneName } {
  const n = ref.normal;
  // The point of the plane nearest the model's origin: the sketch's coordinates are then the model's.
  const level = dot(n, ref.point) - distance;
  const origin = n.map((c) => c * level) as Vec3;
  // An axis of the plane: the model's X, Y or Z the least along the normal.
  const axis = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]!) < Math.abs(n[m]!) ? i : m), 0);
  const seed: Vec3 = [0, 0, 0];
  seed[axis] = 1;
  const u = unit(seed.map((c, i) => c - n[i]! * dot(n, seed)) as Vec3);
  const v = cross(n, u);
  const main = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]!) > Math.abs(n[m]!) ? i : m), 0);
  return { origin, u, v, name: (["YZ", "XZ", "XY"] as const)[main]! };
}

export class IntersectTool extends PanelTool {
  private ref: Reference | null = null;
  private distance = 100;
  private count = 1;
  private spread = false;
  private everyBody = false;
  /** The sections of the current planes, by plane (null while the kernel computes them). */
  private sections: EdgeOutline[][] | null = null;
  private asked = "";
  private readonly arrow: ArrowHandle;
  private dragging = false;
  private readonly ids: string[] = [];

  constructor(ctx: ToolContext, faces: readonly FacePick[]) {
    super(ctx, "Lignes tout autour", null);
    this.arrow = new ArrowHandle(ctx.viewport, () => this.panel.querySelector<HTMLInputElement>("input")?.focus());
    if (faces[0]) void this.choose(faces[0]);
  }

  /** The body's depth under the face (from the face to its far side). */
  private depth(): number {
    const box = this.ref && this.ctx.viewport.bodyMesh(this.ref.bodyId)?.metrics.bbox;
    if (!box || !this.ref) return 0;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [box[k & 1 ? 1 : 0][0], box[k & 2 ? 1 : 0][1], box[k & 4 ? 1 : 0][2]] as Vec3);
    return Math.max(...corners.map((c) => dot(this.ref!.normal, this.ref!.point.map((p, i) => p - c[i]!) as Vec3)));
  }

  /** How far inside the face each line is. */
  private distances(): number[] {
    if (this.spread) return Array.from({ length: this.count }, (_, k) => (this.depth() * (k + 1)) / (this.count + 1));
    return Array.from({ length: this.count }, (_, k) => this.distance * (k + 1));
  }

  private async choose(pick: FacePick): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane : la ligne lui sera parallèle.", "info");
      this.ref = { bodyId: pick.bodyId, point: [pick.point.x, pick.point.y, pick.point.z], normal: unit([...outline.normal] as Vec3) };
      // A third of the depth, to the centimetre, to start with.
      this.distance = Math.max(1, Math.round(this.depth() / 3 / 10) * 10);
      this.update();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** The planes changed: the arrow, then their sections (asked to the kernel once per set of planes). */
  private update(): void {
    if (!this.ref) return this.render();
    const shown = this.spread ? this.distances()[0]! : this.distance;
    this.arrow.place(this.ref.point, this.ref.normal.map((c) => -c) as Vec3, shown, formatLength(shown, this.ctx.unit()));
    const bodies = this.everyBody ? this.ctx.viewport.displayedBodies : [this.ref.bodyId];
    const planes = this.distances().map((d) => planeAt(this.ref!, d));
    const key = JSON.stringify([bodies, planes]);
    this.asked = key;
    this.sections = null;
    this.render();
    void Promise.all(planes.map(async (p) => (await Promise.all(bodies.map((b) => this.ctx.geometry.sectionOutline(b, p.origin, p.u, p.v).catch(() => [])))).flat())).then((found) => {
      if (this.asked !== key) return;
      this.sections = found;
      this.render();
      this.schedulePreview();
    });
  }

  /** One sketch per plane that crosses something: its section, lines and arcs on the plane. */
  private sketches(): SketchFeature[] | string {
    if (!this.ref) return "Cliquez une face plane d'un corps.";
    if (!this.sections) return "Calcul de la coupe…";
    const doc = this.ctx.doc();
    const out: SketchFeature[] = [];
    this.distances().forEach((d, k) => {
      const found = this.sections![k] ?? [];
      if (!found.length) return;
      const p = planeAt(this.ref!, d);
      while (this.ids.length <= out.length) this.ids.push(uniqueId({ ...doc, features: [...doc.features, ...this.ids.map((id) => ({ id }) as Feature)] }, "sk"));
      const names = new Set([...doc.features.map((f) => f.name), ...out.map((s) => s.name)]);
      let n = 1;
      while (names.has(`Intersection ${n}`)) n++;
      const name = `Intersection ${n}`;
      const sketch: SketchFeature = { id: this.ids[out.length]!, type: "sketch", name, plane: p.name, offset: 0, frame: { origin: p.origin, xDir: p.u, normal: this.ref!.normal }, points: [], curves: [], constraints: [] };
      let geometry = { points: sketch.points, curves: sketch.curves, constraints: sketch.constraints };
      for (const edge of found) {
        const next = projectEdge(geometry, edge, frameOf(sketch));
        if (typeof next !== "string") geometry = next;
      }
      // Lines of the sketch, not the dashed construction lines of a projection: they show all around the body.
      const curves = geometry.curves.map(({ construction, projected, ...c }) => c);
      out.push({ ...sketch, ...geometry, curves });
    });
    return out.length ? out : "Ce plan ne traverse pas le corps : réduisez la distance.";
  }

  protected feature(): Feature | string {
    const made = this.sketches();
    return typeof made === "string" ? made : made[0]!;
  }

  protected override companions(): Feature[] {
    const made = this.sketches();
    return typeof made === "string" ? [] : made.slice(1);
  }

  override down(event: PointerEvent): boolean {
    this.dragging = !!this.ref && this.arrow.dragStart(event);
    return this.dragging;
  }

  override move(event: PointerEvent): void {
    if (!this.dragging) {
      if (!this.ref) this.ctx.viewport.setHoverHighlight((() => {
        const face = this.ctx.viewport.pickFace(event);
        return face ? { face } : null;
      })());
      return;
    }
    const value = this.arrow.dragMove(event);
    if (value !== null && value > 0 && !this.spread) {
      this.distance = Math.round(value);
      this.update();
    }
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) {
      this.dragging = false;
      return true;
    }
    return super.up(event, isClick);
  }

  /** A click on a face takes it as the reference. */
  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (face) void this.choose(face);
  }

  protected override dispose(): void {
    this.arrow.dispose();
    this.ctx.viewport.setHoverHighlight(null);
  }

  protected rows(): (HTMLElement | null)[] {
    const made = this.sketches();
    const unitName = this.ctx.unit();
    return [
      this.ref && !this.spread ? this.numberRow("Distance de la face", this.distance, unitName, (v) => ((this.distance = Math.max(0.1, v)), this.update())) : null,
      this.numberRow("Nombre de lignes", this.count, "plain", (v) => ((this.count = Math.max(1, Math.min(50, Math.round(v)))), this.update())),
      this.checkRow("Répartir dans l'épaisseur", this.spread, (v) => ((this.spread = v), this.update())),
      this.checkRow("Tous les corps traversés", this.everyBody, (v) => ((this.everyBody = v), this.update())),
      this.info(
        typeof made === "string"
          ? made
          : `${made.length} ligne${made.length > 1 ? "s" : ""} tout autour, ${this.spread ? `l'épaisseur (${formatLength(this.depth(), unitName)}) partagée en ${this.count + 1}` : `tous les ${formatLength(this.distance, unitName)} depuis la face`} ; le corps reste entier. Cliquez une autre face pour en changer.`,
      ),
    ];
  }
}
