/**
 * « Espacement » (groupe Modifier) : un clic sur un élément, un clic sur un autre — deux corps, deux caissons avec
 * leurs façades — et l'espace entre eux s'affiche en cote ; on tape le nouvel espace, et le second élément s'écarte ou
 * se rapproche (ou le premier, ou les deux de moitié), le long de la cote ou d'un axe (document/spacing.ts). Il s'ouvre
 * aussi sur deux éléments déjà sélectionnés, ou depuis une mesure du Mètre entre deux corps. Une esquisse se clique
 * comme un corps (ses traits) : elle glisse par son plan, et ce qui en est extrudé la suit. Deux pièces d'un même
 * caisson (deux étagères) bougent seules ; deux éléments différents, en entier. Une seule annulation.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { axisGap, measureGap, movesNeeded, spacingFeatures, spacingShifts, type Along, type Gap, type Mover, type Moving } from "../document/spacing";
import { elementKey, type Box } from "../document/swap";
import type { CadDocument, Feature, SketchFeature, Vec3 } from "../document/types";
import { islandOf } from "../document/kitchen-moves";
import { syncKitchenPlans } from "../document/kitchen-sync";
import { frameOf, toWorld } from "../sketcher/frame";
import { sketchCurves } from "../sketcher/polylines";
import { sketchBox } from "../sketcher/sketch-transform";
import { closestBetween, type Closest, type MeasureShape } from "../measurements/closest";
import { formatLength } from "../measurements/units";
import { freshFeatureIds } from "./curic-common";
import { Marks } from "./measure";
import { bodyPicked } from "./measure-shapes";
import { PanelTool, type ToolContext } from "./panel-tool";

const ALONG: [string, string][] = [
  ["measure", "La plus courte distance"],
  ["0", "X — largeur"],
  ["1", "Y — profondeur"],
  ["2", "Z — hauteur"],
];
const MOVERS: [Mover, string][] = [
  ["second", "Le second (cliqué en dernier)"],
  ["first", "Le premier"],
  ["both", "Les deux, de moitié chacun"],
];
const COTE = 0xdc2626;

interface Side {
  key: string;
  bodies: string[];
  whole: boolean;
  box: Box;
  shape: MeasureShape;
  name: string;
  /** A kitchen island taken whole: its cabinets, slid by their position. */
  slide?: string[];
}

/** A sketch picked is kept as « sketch:<id> » among the bodies picked. */
const SKETCH = "sketch:";
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export class SpacingTool extends PanelTool {
  /** The bodies (or « sketch:<id> ») clicked, one per element. */
  private picks: string[] = [];
  private sides: [Side, Side] | null = null;
  /** The two closest points of the two elements (worked out once: the meshes can be large). */
  private near: Closest | null = null;
  private along: Along = "measure";
  private wanted = 0;
  private mover: Mover = "second";
  private slots: { id: string; name: string }[] = [];
  private readonly marks = new Marks(this.ctx.viewport.scene);

  constructor(ctx: ToolContext, bodies: string[], sketches: string[] = []) {
    super(ctx, "Espacement", null);
    const doc = ctx.doc();
    // Two elements selected (bodies or sketches): the first body of each; two bodies of one element: those two.
    const firsts = [...new Map(bodies.map((id) => [elementKey(doc, id), id])).values()];
    const all = [...firsts, ...sketches.map((id) => SKETCH + id)];
    const picks = all.length === 2 ? all : firsts.length === 1 && !sketches.length && bodies.length === 2 ? bodies : [];
    for (const id of picks) this.pick(id);
  }

  private sketchOf(pick: string): SketchFeature | null {
    const f = pick.startsWith(SKETCH) ? findFeature(this.ctx.doc(), pick.slice(SKETCH.length)) : undefined;
    return f?.type === "sketch" ? f : null;
  }

  private label(pick: string): string {
    const sketch = this.sketchOf(pick);
    return sketch ? `Esquisse ${sketch.name}` : bodyLabel(this.ctx.doc(), pick);
  }

  /** A sketch as one side: its lines in the model, its box; it moves whole. */
  private sketchSide(sketch: SketchFeature): Side | null {
    const box = sketchBox(sketch);
    if (!box) return null;
    const frame = frameOf(sketch);
    const lines = sketchCurves(sketch).map((c) => c.points.map(([x, y]) => toWorld(frame, x, y) as Vec3));
    const segments = lines.flatMap((pts) => pts.slice(1).map((p, i): [Vec3, Vec3] => [pts[i]!, p]));
    const points = lines.flat();
    if (!points.length) points.push(...sketch.points.map((p) => toWorld(frame, p.x, p.y) as Vec3));
    return { key: sketch.id, bodies: [], whole: true, box, shape: { points, segments, triangles: [] }, name: `Esquisse ${sketch.name}` };
  }

  /** The element of each pick (two pieces of one element: each piece alone), with its box and its mesh. */
  private measure(): void {
    const doc = this.ctx.doc();
    const [a, b] = this.picks as [string, string];
    const keyOf = (pick: string) => this.sketchOf(pick)?.id ?? elementKey(doc, pick);
    const whole = keyOf(a) !== keyOf(b);
    // A piece of a kitchen plan's island: the island whole (its units, worktop, plinth), unless both are pieces of it.
    const isle = (pick: string) => (this.sketchOf(pick) ? null : islandOf(doc, elementKey(doc, pick)));
    const apart = isle(a)?.plan !== isle(b)?.plan;
    const side = (id: string): Side | null => {
      const sketch = this.sketchOf(id);
      if (sketch) return this.sketchSide(sketch);
      const island = whole && apart ? isle(id) : null;
      const slide = island?.made.filter((x) => findFeature(doc, x)?.type === "cabinet");
      const key = slide?.length ? `${island!.plan}:I` : whole ? elementKey(doc, id) : id;
      const bodies = slide?.length ? this.ctx.viewport.displayedBodies.filter((x) => island!.made.includes(elementKey(doc, x))) : whole ? this.ctx.viewport.displayedBodies.filter((x) => elementKey(doc, x) === key) : [id];
      const meshes = bodies.map((x) => this.ctx.viewport.bodyMesh(x)).filter((m) => m !== undefined);
      if (!meshes.length) return null;
      const boxes = meshes.map((m) => m.metrics.bbox);
      const box: Box = [[0, 1, 2].map((i) => Math.min(...boxes.map((x) => x[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((x) => x[1][i]!))) as Vec3];
      const parts = meshes.map((m) => bodyPicked(m).shape);
      const shape: MeasureShape = { points: parts.flatMap((p) => p.points), segments: parts.flatMap((p) => p.segments), triangles: parts.flatMap((p) => p.triangles) };
      const name = slide?.length ? "Îlot" : ((whole ? findFeature(doc, key)?.name : undefined) ?? bodyLabel(doc, id));
      return { key, bodies, whole, box, shape, name, ...(slide?.length ? { slide } : {}) };
    };
    const [sa, sb] = [side(a), side(b)];
    this.sides = sa && sb ? [sa, sb] : null;
    this.near = sa && sb ? closestBetween(sa.shape, sb.shape) : null;
    this.wanted = Math.max(0, Number((this.gap()?.distance ?? 0).toFixed(3)));
  }

  private pick(bodyId: string): void {
    if (this.picks.length >= 2) this.picks = [];
    this.picks.push(bodyId);
    this.sides = null;
    this.slots = [];
    if (this.picks.length === 2) this.measure();
  }

  /** The space as it is now (before the move). */
  private gap(): Gap | null {
    if (!this.sides || !this.near) return null;
    const [a, b] = this.sides;
    return this.along === "measure" ? measureGap(this.near, a.box, b.box) : axisGap(a.box, b.box, this.along);
  }

  private moving(): Moving[] {
    const gap = this.gap();
    if (!gap || !this.sides) return [];
    const shifts = spacingShifts(gap, this.wanted, this.mover);
    return this.sides.map((s, i) => ({ key: s.key, bodies: s.bodies, whole: s.whole, shift: shifts[i]!, ...(s.slide ? { slide: s.slide } : {}) }));
  }

  private made(): Feature[] {
    const doc = this.ctx.doc();
    const moving = this.moving();
    const needed = movesNeeded(doc, moving);
    if (this.slots.length < needed) this.slots = freshFeatureIds(doc, "mv", "Espacement", needed);
    return spacingFeatures(doc, moving, this.slots);
  }

  protected feature(): Feature | string {
    if (this.picks.length === 0) return "Cliquez le premier élément (corps, caisson ou esquisse).";
    if (this.picks.length === 1) return "Cliquez le second élément.";
    if (!this.sides) return "Ces éléments ne sont plus affichés : cliquez-en deux autres.";
    return this.made()[0] ?? "Tapez le nouvel espace.";
  }

  protected override companions(): Feature[] {
    return this.made().slice(1);
  }

  /** A unit of a kitchen plan moved: its plan follows at once (the island whole, with its worktop and plinth), as when it is stored. */
  protected override decorate(doc: CadDocument): CadDocument {
    return syncKitchenPlans(this.docBefore(), doc);
  }

  /** The cote, where the two elements will be once moved, and its value. */
  private draw(): void {
    this.marks.clear();
    const gap = this.gap();
    if (!gap) return;
    const [sa, sb] = spacingShifts(gap, this.wanted, this.mover);
    const from = add(gap.from, sa);
    const to = add(gap.to, sb);
    this.marks.line(from, to, COTE, false);
    this.marks.dot(from, COTE);
    this.marks.dot(to, COTE);
    this.marks.label(from.map((c, i) => (c + to[i]!) / 2) as Vec3, formatLength(this.wanted, this.ctx.unit()));
  }

  protected override render(): void {
    super.render();
    this.draw();
  }

  override move(event: PointerEvent): void {
    const target = this.picks.length < 2 ? this.ctx.viewport.hoverTargetForTool(event) : null;
    this.ctx.viewport.setHoverHighlight(target?.kind === "body" ? { bodies: [target.id] } : null);
  }

  /** A click picks an element; a third starts again with the element clicked (the real model is shown again first). */
  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (!target) return;
    if (this.picks.length >= 2) {
      this.picks = [];
      this.sides = null;
      this.render();
      void this.ctx.preview(null).then(() => this.render());
      return;
    }
    this.pick(target.kind === "sketch" ? SKETCH + target.id : target.id);
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.marks.clear();
    this.ctx.viewport.setHoverHighlight(null);
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const unit = this.ctx.unit();
    const gap = this.gap();
    const [a, b] = this.sides ?? [];
    return [
      this.info(a && b ? `Entre « ${a.name} » et « ${b.name} »${a.whole ? "" : " (pièces d'un même élément)"}.` : this.picks.length === 1 ? `Premier : « ${this.label(this.picks[0]!)} ». Cliquez le second.` : "Cliquez deux éléments (corps, caissons, esquisses) : l'espace entre eux devient une cote à changer."),
      gap ? this.selectRow("Le long de", String(this.along), ALONG, (v) => {
        this.along = v === "measure" ? "measure" : (Number(v) as 0 | 1 | 2);
        this.wanted = Math.max(0, Number((this.gap()?.distance ?? 0).toFixed(3)));
        changed();
      }) : null,
      gap ? this.info(`Espace actuel : ${gap.distance < 0 ? `${formatLength(-gap.distance, unit)} de chevauchement` : formatLength(gap.distance, unit)}.`) : null,
      gap ? this.numberRow("Espace", this.wanted, unit, (v) => ((this.wanted = Math.max(0, v)), changed()), true) : null,
      gap ? this.selectRow("Bouger", this.mover, MOVERS, (v) => ((this.mover = v as Mover), changed())) : null,
      gap ? this.info("Un autre clic dans la vue recommence avec deux autres éléments.") : null,
    ];
  }
}
