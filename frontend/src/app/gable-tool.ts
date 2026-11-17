/**
 * « Toit » : une ligne tracée sur le dessus d'un bloc se tire vers le haut, comme dans SketchUp. Elle devient le
 * faîtage d'un toit à deux pans, ou d'un toit arrondi (une voûte), soudé au bloc (features/gable.ts) : une niche à
 * chien, une cabane, un abri.
 *
 * Le bouton « Toit » (groupe Créer) prend l'esquisse sélectionnée, sinon la dernière ligne tracée sur le dessus d'un
 * corps ; Extruder ouvre aussi l'outil sur une esquisse faite d'une seule ligne sur un dessus. On tire la flèche
 * plantée sur la ligne, ou on tape la hauteur ; l'aperçu est en direct, OK donne une seule annulation et cache la
 * ligne. Des lignes ailleurs restent pour Panneaux : chacune devient une planche.
 */
import { findFeature, uniqueId, uniqueName } from "../document/operations";
import type { CadDocument, Feature, SketchFeature, Vec3 } from "../document/types";
import { gablePlan, sectionGeometry, topUnder, type Box, type RoofShape } from "../features/gable";
import { frameOf, toWorld } from "../sketcher/frame";
import { ArrowHandle } from "../viewport/arrow-handle";
import type { Viewport } from "../viewport/viewport";
import { formatLength } from "../measurements/units";
import { PanelTool, type ToolContext } from "./panel-tool";

/** Kept for the session: the last shape chosen. */
let lastShape: RoofShape = "gable";

/**
 * The one line of a sketch, in the model; null when it has another drawing. Lines lying along the face's projected
 * outline do not count: a line laid by Magie extrusion is kept with the band it closes on the outline.
 */
function sketchLine(sketch: SketchFeature): [Vec3, Vec3] | null {
  const at = (id: string) => sketch.points.find((p) => p.id === id);
  const ends = (c: SketchFeature["curves"][number]) => (c.kind === "line" ? [at(c.p1), at(c.p2)] : []);
  const outline = sketch.curves.filter((c) => c.projected && c.kind === "line").map(ends);
  const onSegment = (p: { x: number; y: number }, [a, b]: (typeof outline)[number]) => {
    if (!a || !b) return false;
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1);
    return t > -1e-6 && t < 1 + 1e-6 && Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) < 1e-3;
  };
  const along = (c: SketchFeature["curves"][number]) => outline.some((o) => ends(c).every((p) => p && onSegment(p, o)));
  const lines = sketch.curves.filter((c) => !c.construction && !along(c));
  const line = lines[0];
  if (lines.length !== 1 || line?.kind !== "line") return null;
  const [a, b] = [at(line.p1), at(line.p2)];
  if (!a || !b) return null;
  const frame = frameOf(sketch);
  return [toWorld(frame, a.x, a.y), toWorld(frame, b.x, b.y)];
}

const boxes = (viewport: Viewport) =>
  viewport.displayedBodies.flatMap((id) => {
    const b = viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [{ id, box: [[...b[0]], [...b[1]]] as Box }] : [];
  });

/** What a sketch of lines only becomes: a roof when it is one line on the top of a body, else boards. */
export function strokesTool(sketch: SketchFeature, viewport: Viewport): { kind: "gable" | "panels"; message: string } {
  const line = sketchLine(sketch);
  if (line && topUnder(line, boxes(viewport))) return { kind: "gable", message: `Tirez la flèche sur « ${sketch.name} » vers le haut : le dessus se plie en toit à deux pans.` };
  return { kind: "panels", message: `« ${sketch.name} » n'a que des lignes : chacune devient un panneau. Réglez l'épaisseur, et la profondeur (sa hauteur depuis l'esquisse).` };
}

export class GableTool extends PanelTool {
  private readonly sketchId: string;
  private readonly sectionId: string;
  private readonly roofId: string;
  private readonly roofName: string;
  private readonly line: [Vec3, Vec3] | null;
  private readonly body: { id: string; box: Box } | null;
  private height: number;
  private shape: RoofShape = lastShape;
  private readonly arrow: ArrowHandle;
  private dragging = false;

  constructor(ctx: ToolContext, sketchId: string | undefined) {
    super(ctx, "Toit", null);
    const doc = ctx.doc();
    // The sketch chosen, else the last one that is a single line on the top of a body.
    const onTop = (f: Feature | undefined) => {
      const line = f?.type === "sketch" && !f.suppressed ? sketchLine(f) : null;
      const body = line ? topUnder(line, boxes(ctx.viewport)) : null;
      return line && body && f ? { id: f.id, line, body } : null;
    };
    const found = onTop(sketchId ? findFeature(doc, sketchId) : undefined) ?? [...doc.features].reverse().map(onTop).find(Boolean) ?? null;
    this.sketchId = found?.id ?? "";
    this.line = found?.line ?? null;
    this.body = found?.body ?? null;
    this.sectionId = uniqueId(doc, "sk");
    this.roofId = uniqueId({ ...doc, features: [...doc.features, { id: this.sectionId } as Feature] }, "ex");
    this.roofName = uniqueName(doc, "Toit");
    // A third of the width under it, to the centimetre.
    const box = this.body?.box;
    const across = box && this.line ? (Math.abs(this.line[1][0] - this.line[0][0]) >= Math.abs(this.line[1][1] - this.line[0][1]) ? box[1][1] - box[0][1] : box[1][0] - box[0][0]) : 900;
    this.height = Math.max(10, Math.round(across / 3 / 10) * 10);
    this.arrow = new ArrowHandle(ctx.viewport, () => this.panel.querySelector<HTMLInputElement>("input")?.focus());
    this.placeArrow();
  }

  private plan() {
    if (!this.line || !this.body) return "Tracez une seule ligne sur le dessus d'un corps, parallèle à un de ses bords.";
    return gablePlan(this.line, this.body.box, this.height);
  }

  private placeArrow(): void {
    const plan = this.plan();
    if (typeof plan === "string" || !this.line) return;
    const mid = [0, 1, 2].map((i) => (this.line![0][i]! + this.line![1][i]!) / 2) as Vec3;
    this.arrow.place(mid, [0, 0, 1], this.height, formatLength(this.height, this.ctx.unit()));
  }

  protected feature(): Feature | string {
    const plan = this.plan();
    if (typeof plan === "string") return plan;
    return {
      id: this.sectionId, type: "sketch", name: `Pignon ${this.roofName}`, plane: plan.plane, offset: plan.offset, hidden: true,
      ...sectionGeometry(plan.triangle, this.shape),
    } satisfies SketchFeature;
  }

  protected override companions(): Feature[] {
    const plan = this.plan();
    if (typeof plan === "string" || !this.body) return [];
    return [{ id: this.roofId, type: "extrude", name: this.roofName, sketch: this.sectionId, distance: plan.distance, operation: "join", target: this.body.id }];
  }

  /** The line drawn is now under the roof: hidden. */
  protected override decorate(doc: CadDocument): CadDocument {
    return { ...doc, features: doc.features.map((f) => (f.id === this.sketchId && f.type === "sketch" ? { ...f, hidden: true } : f)), bodyNames: { ...doc.bodyNames, [this.roofId]: this.roofName } };
  }

  private setHeight(value: number): void {
    this.height = Math.max(1, value);
    this.placeArrow();
    this.render();
    this.schedulePreview();
  }

  override down(event: PointerEvent): boolean {
    this.dragging = this.arrow.dragStart(event);
    return this.dragging;
  }

  override move(event: PointerEvent): void {
    if (!this.dragging) return;
    const value = this.arrow.dragMove(event);
    if (value !== null && value > 0) this.setHeight(value);
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) {
      this.dragging = false;
      return true;
    }
    return super.up(event, isClick);
  }

  protected override dispose(): void {
    this.arrow.dispose();
  }

  protected rows(): (HTMLElement | null)[] {
    const plan = this.plan();
    return [
      this.selectRow("Forme", this.shape, [["gable", "Deux pans"], ["arch", "Arrondi (voûte)"]], (v) => {
        this.shape = lastShape = v as RoofShape;
        this.render();
        this.schedulePreview();
      }),
      this.numberRow(this.shape === "arch" ? "Hauteur de la voûte" : "Hauteur du faîtage", this.height, this.ctx.unit(), (v) => this.setHeight(v)),
      this.info(typeof plan === "string" ? plan : `Le toit court sur ${formatLength(plan.distance, this.ctx.unit())}, soudé au corps ; tirez la flèche ou tapez la hauteur. ${this.shape === "arch" ? "La voûte passe par les deux bords du dessus et par la ligne levée ; à la moitié de la largeur, c'est un demi-cercle." : "Une ligne hors du milieu donne deux pans inégaux."}`),
    ];
  }
}
