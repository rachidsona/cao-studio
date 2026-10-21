/**
 * "Tracé sur face" (like Curic DIO): on a planar face of a body, hover near an
 * edge, the line parallel to it follows the pointer at the distance shown;
 * click to keep it, or type the distance. One line marks a band along the
 * edge (rabbet, edge strip); two lines a band further in (groove). OK makes a
 * sketch on the face whose band is a closed area: select it and extrude it
 * in (cut) or out (join).
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { SketchFeature } from "../document/types";
import type { FaceOutline } from "../geometry/protocol";
import type { Vec2 } from "../sketcher/edit";
import { bandPolygon, bandSketch, facePolygon, inwardDistance, polygonEdges, type FaceEdge } from "../sketcher/face-strip";
import { rayToSketch, sketchFrame, type SketchFrame } from "../sketcher/frame";
import { planeForFace } from "../sketcher/projection";
import { dragStep, roundTo } from "../viewport/axis-drag";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";

interface LoadedFace {
  bodyId: string;
  faceIndex: number;
  outline: FaceOutline;
  frame: SketchFrame;
  plane: SketchFeature["plane"];
  offset: number;
  polygon: Vec2[];
}

/** Last settings, kept for the next band of the session (mm). */
let last = { mode: "line" as "line" | "groove", distance: 10, width: 8 };

export class FaceStripTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private face: LoadedFace | null = null;
  private edge: FaceEdge | null = null;
  /** The edge and distance follow the pointer until a click keeps them. */
  private following = true;
  private mode = last.mode;
  private distance = last.distance;
  private width = last.width;

  constructor(ctx: ToolContext) {
    super(ctx, "Tracé sur face", null);
    const doc = ctx.doc();
    this.id = uniqueId(doc, "sk");
    this.name = uniqueName(doc, "Tracé");
  }

  /** Opens the tool, on the planar face already selected if there is one. */
  async open(pick?: FacePick): Promise<void> {
    this.start();
    if (pick) await this.load(pick);
    this.render();
  }

  private async load(pick: FacePick): Promise<void> {
    let outline: FaceOutline;
    try {
      outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      return;
    }
    const placement = outline.surface === "PLANE" ? planeForFace(outline.normal, outline.center) : null;
    if (!placement) {
      this.ctx.notify("Tracé possible seulement sur une face plane parallèle aux plans XY, XZ ou YZ.", "error");
      return;
    }
    const frame = sketchFrame(placement.plane, placement.offset);
    const polygon = facePolygon(outline, frame);
    if (!polygon) {
      this.ctx.notify("Cette face n'a pas de contour droit fermé : choisissez une face bordée d'arêtes droites.", "error");
      return;
    }
    this.face = { bodyId: pick.bodyId, faceIndex: pick.faceIndex, outline, frame, plane: placement.plane, offset: placement.offset, polygon };
    this.edge = null;
    this.following = true;
  }

  private band(): Vec2[] | null {
    if (!this.face || !this.edge) return null;
    const [from, to] = this.mode === "line" ? [0, this.distance] : [this.distance, this.distance + this.width];
    return bandPolygon(this.face.polygon, this.edge, from, to);
  }

  protected feature(): SketchFeature | string {
    if (!this.face) return "Cliquez une face plane d'un corps.";
    if (!this.edge) return "Survolez la face près d'une arête : le trait suit le pointeur ; cliquez pour le garder.";
    const band = this.band();
    if (!band) return "La distance sort de la face : réduisez-la.";
    const geometry = bandSketch(this.face.outline, this.face.frame, band);
    return { id: this.id, type: "sketch", name: this.name, plane: this.face.plane, offset: Number(this.face.offset.toFixed(6)), ...geometry, support: this.face.bodyId };
  }

  override confirm(): void {
    if (typeof this.feature() === "string") {
      super.confirm(); // explains what is missing
      return;
    }
    last = { mode: this.mode, distance: this.distance, width: this.width };
    super.confirm();
    this.ctx.notify("Tracé créé : avec « Extrusion », creusez la bande (feuillure, rainure) ou ajoutez-la.", "info");
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    return [
      this.selectRow(
        "Tracé",
        this.mode,
        [
          ["line", "Une ligne (bande le long de l'arête)"],
          ["groove", "Deux lignes (rainure)"],
        ],
        (v) => {
          this.mode = v as "line" | "groove";
          changed();
        },
      ),
      this.numberRow(this.mode === "line" ? "Distance" : "Retrait", this.distance, unit, (v) => {
        this.distance = v;
        this.following = false;
        changed();
      }),
      this.mode === "groove"
        ? this.numberRow("Largeur", this.width, unit, (v) => {
            this.width = v;
            changed();
          })
        : null,
      this.face && !this.following ? this.linkButton("Choisir une autre arête", () => ((this.following = true), this.render())) : null,
      this.info("La distance se mesure depuis l'arête survolée, vers l'intérieur de la face. Un clic garde le trait ; un clic sur une autre face recommence."),
    ];
  }

  private linkButton(label: string, run: () => void): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-left text-sky-700 underline hover:text-sky-900 dark:text-sky-300";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  // ---- pointer -----------------------------------------------------------------------

  /** Pointer position on the face's plane, in sketch coordinates. */
  private onFace(event: PointerEvent): Vec2 | null {
    if (!this.face) return null;
    const { origin, direction } = this.ctx.viewport.rayFromEvent(event);
    return rayToSketch(this.face.frame, origin, direction);
  }

  override move(event: PointerEvent): void {
    if (!this.following) return;
    const p = this.onFace(event);
    if (!p || !this.face) return;
    // The edge nearest the pointer, and the pointer's distance from it, rounded to the zoom.
    let best: { edge: FaceEdge; d: number } | null = null;
    for (const edge of polygonEdges(this.face.polygon)) {
      const ab: Vec2 = [edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]];
      const t = Math.max(0, Math.min(1, ((p[0] - edge.a[0]) * ab[0] + (p[1] - edge.a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
      const d = Math.hypot(p[0] - (edge.a[0] + t * ab[0]), p[1] - (edge.a[1] + t * ab[1]));
      if (!best || d < best.d) best = { edge, d };
    }
    if (!best) return;
    const distance = roundTo(inwardDistance(this.face.polygon, best.edge, p), dragStep(this.ctx.viewport.worldPerPixel()));
    if (distance <= 0) return;
    this.edge = best.edge;
    this.distance = distance;
    this.render();
    this.schedulePreview();
  }

  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (this.face && pick && pick.bodyId === this.face.bodyId && pick.faceIndex === this.face.faceIndex && this.edge && this.following) {
      this.following = false; // keep this edge and distance
      this.render();
      return;
    }
    if (!pick) return;
    void this.load(pick).then(() => {
      this.render();
      this.schedulePreview();
    });
  }
}
