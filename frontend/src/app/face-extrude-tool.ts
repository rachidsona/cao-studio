/**
 * Push/pull of selected planar faces (like desktop CAD tools): an arrow on
 * the face, dragged along its normal; pulling adds material (union), pushing
 * digs into the body (subtraction). The kernel result is previewed live. « Tirer une face » from a selected edge
 * opens it on one of the two faces along the edge (the smaller, the end of a board), the other one a choice away —
 * and only the strip of the face along the edge is pulled (as a line drawn on the face would split it), or the whole
 * face if asked. If another body stands in front of the face (a side of the cabinet, a wall), « Jusqu'au corps voisin »
 * pulls it right up to it (features/touch.ts).
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import { uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, ExtrudeFeature, FaceRef, Vec3 } from "../document/types";
import { formatLength, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { openCalculator } from "../ui/calculator";
import { ArrowHandle } from "../viewport/arrow-handle";
import type { FacePick } from "../viewport/viewport";
import { gapAlong, type Box } from "../features/touch";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";
import { getEdgeTake, referenceDistance, ReferencePicker, setEdgeTake, type EdgeTake } from "./reference-measure";
import { ReferenceMarker } from "./reference-marker";
import { OPERATION_LABELS } from "../ui/feature-meta";

const OPERATIONS: [BooleanOperation, string][] = [
  ["join", `${OPERATION_LABELS.join} (ajouter)`],
  ["cut", `${OPERATION_LABELS.cut} (creuser)`],
  ["new", OPERATION_LABELS.new],
  ["intersect", OPERATION_LABELS.intersect],
];

export class FaceExtrudeTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private faces: FaceRef[] = [];
  private distance: number;
  private operation: BooleanOperation;
  /** The operation follows the direction until the user chooses one. */
  private autoOperation: boolean;
  private arrow: ArrowHandle;
  /** Corners, edges and faces of the bodies as they were when the tool opened, to take a distance from. */
  private reference: ReferencePicker;
  /** Lights up the corner, edge or face a click would take. */
  private marker: ReferenceMarker;
  /** Pulled from an edge: the faces along it, the one pulled first. */
  private choices: FaceRef[] = [];
  /** Pulled from an edge: its two ends, and whether only the strip of the face along it is pulled. */
  private strip: { from: Vec3; to: Vec3 } | null = null;
  private stripOnly = true;
  /** The box of each face along the edge, and of the other bodies (as they were when the tool opened). */
  private choiceBoxes: (Box | null)[] = [];
  private others: Box[] = [];

  constructor(ctx: ToolContext, editing: ExtrudeFeature | null) {
    super(ctx, "Extrusion de faces", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "ex");
    this.name = editing?.name ?? uniqueName(doc, "Extrusion");
    this.distance = editing?.distance ?? 10;
    this.operation = editing?.operation ?? "join";
    this.autoOperation = !editing;
    this.target = editing?.target;
    this.faces = editing?.faces ?? [];
    this.strip = editing?.strip ?? null;
    this.reference = new ReferencePicker(ctx.viewport);
    this.marker = new ReferenceMarker(ctx.viewport);
    this.arrow = new ArrowHandle(ctx.viewport, (anchor) =>
      openCalculator({
        container: ctx.container,
        anchor,
        value: Math.abs(this.distance),
        unit: ctx.unit(),
        title: "Distance d'extrusion",
        locked: true,
        allowNegative: true,
        onSubmit: (v) => {
          this.setDistance(v);
          return true;
        },
      }),
    );
  }

  /** Describes the picked faces (kernel references), then shows the arrow on the first one. */
  async open(picks: FacePick[]): Promise<void> {
    this.reference.capture();
    const [first] = picks;
    if (!this.editing && first) {
      this.target = first.bodyId;
      try {
        const refs = await Promise.all(
          picks.filter((p) => p.bodyId === first.bodyId).map((p) => this.ctx.geometry.describe(p.bodyId, [], p.faceIndex)),
        );
        this.faces = refs.flatMap((r) => (r.face && r.face.type === "PLANE" ? [r.face] : []));
        if (this.faces.length < refs.length) this.ctx.notify("Seules les faces planes peuvent être extrudées.", "info");
      } catch (error) {
        this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
    this.placeArrow();
    this.start();
  }

  /** The faces along an edge (planar ones, the smaller first): the first is pulled, the other one a choice away. */
  async openFromEdge(picks: FacePick[], ends: [Vec3, Vec3] | null = null, boxes: ([Vec3, Vec3] | null)[] = []): Promise<void> {
    // A closed edge (a circle) has no length to pull along: the whole face.
    if (ends && Math.hypot(...[0, 1, 2].map((i) => ends[1][i]! - ends[0][i]!)) > 1e-6) this.strip = { from: ends[0], to: ends[1] };
    const [first] = picks;
    if (first) {
      this.target = first.bodyId;
      try {
        const refs = await Promise.all(picks.map((p) => this.ctx.geometry.describe(p.bodyId, [], p.faceIndex)));
        // In the order given: the smaller face first (viewport/body-points.ts).
        const planar = refs.flatMap((r, i) => (r.face && r.face.type === "PLANE" ? [{ face: r.face, box: boxes[i] ?? null }] : []));
        this.choices = planar.map((p) => p.face);
        this.choiceBoxes = planar.map((p) => p.box);
        this.faces = this.choices.slice(0, 1);
        this.others = this.ctx.viewport.displayedBodies.filter((id) => id !== first.bodyId).flatMap((id) => {
          const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
          return b ? [[[...b[0]], [...b[1]]] as Box] : [];
        });
        if (!this.faces.length) this.ctx.notify("Les faces de cette arête ne sont pas planes.", "info");
      } catch (error) {
        this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
    this.reference.capture();
    this.placeArrow();
    this.start();
  }

  private placeArrow(): void {
    const face = this.faces[0];
    if (!face) return;
    const unit = this.ctx.unit();
    // Only the strip along the edge: the arrow stands on the edge.
    const at = this.strip && this.stripOnly ? ([0, 1, 2].map((i) => (this.strip!.from[i]! + this.strip!.to[i]!) / 2) as Vec3) : face.center;
    this.arrow.place(at, face.normal, this.distance, `${trim(toDisplay(this.distance, unit), 3)} ${UNIT_LABELS[unit]}`);
  }

  private setDistance(value: number): void {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-3) return;
    this.distance = value;
    if (this.autoOperation) this.operation = value > 0 ? "join" : "cut";
    this.placeArrow();
    this.render();
    this.schedulePreview();
  }

  /** A click on a corner, an edge or a face of a body: its measure becomes the distance. */
  protected override click(event: PointerEvent): void {
    const face = this.faces[0];
    if (!face) return;
    // The faces and edges of the tool's own preview are not references.
    const reference = this.reference.find(event, (id) => id === this.id || id.startsWith(`${this.id}#`));
    if (!reference) return;
    const taken = referenceDistance(reference, face.center, face.normal, getEdgeTake());
    if (!taken) return this.ctx.notify("Ce point est au niveau de la face : la distance serait nulle.", "info");
    this.setDistance(taken.value);
    this.ctx.notify(`Distance prise : ${formatLength(Math.abs(taken.value), this.ctx.unit())} (${taken.what}).`, "info");
  }

  protected feature(): ExtrudeFeature | string {
    if (!this.target || this.faces.length === 0) return "Sélectionnez une ou plusieurs faces planes du corps, puis Extrusion.";
    return {
      id: this.id,
      type: "extrude",
      name: this.name,
      faces: this.faces,
      ...(this.strip && this.stripOnly ? { strip: this.strip } : {}),
      target: this.target,
      distance: this.distance,
      operation: this.operation,
    };
  }

  /** The kernel cannot pull the face so (its message is on the panel): OK waits, and the body stays as it is. */
  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "Cette face ne peut pas être extrudée ainsi.") : null;
  }

  /** « Face tirée »: which face along the edge, named by where it looks. */
  private choiceRow(): HTMLElement | null {
    if (this.choices.length < 2) return null;
    const look = (n: Vec3) => {
      const i = [0, 1, 2].reduce((m, k) => (Math.abs(n[k]!) > Math.abs(n[m]!) ? k : m), 0);
      const side = [["droite", "gauche"], ["arrière", "avant"], ["dessus", "dessous"]][i]![n[i]! > 0 ? 0 : 1];
      return `${"XYZ"[i]}${n[i]! > 0 ? "+" : "−"} (${side})`;
    };
    const chosen = this.choices.findIndex((c) => c === this.faces[0]);
    return this.selectRow("Face tirée", String(chosen), this.choices.map((c, i): [string, string] => [String(i), `${i === 0 ? "Petite face" : "Grande face"}, vers ${look(c.normal)}`]), (v) => {
      this.faces = [this.choices[Number(v)]!];
      this.placeArrow();
      this.render();
      this.schedulePreview();
    });
  }

  /** How far the face goes before it touches another body in front of it (only the strip along the edge, if so). */
  private touchGap(): number | null {
    const face = this.faces[0];
    const box = face ? this.choiceBoxes[this.choices.indexOf(face)] : null;
    if (!face || !box) return null;
    const limited: Box = [[...box[0]], [...box[1]]];
    if (this.strip && this.stripOnly) {
      const d = [0, 1, 2].map((i) => this.strip!.to[i]! - this.strip!.from[i]!);
      const axis = [0, 1, 2].reduce((m, k) => (Math.abs(d[k]!) > Math.abs(d[m]!) ? k : m), 0);
      if (Math.abs(d[axis]!) > 0.999 * Math.hypot(...d)) {
        limited[0][axis] = Math.max(limited[0][axis]!, Math.min(this.strip.from[axis]!, this.strip.to[axis]!));
        limited[1][axis] = Math.min(limited[1][axis]!, Math.max(this.strip.from[axis]!, this.strip.to[axis]!));
      }
    }
    return gapAlong(limited, face.normal, this.others);
  }

  /** « Jusqu'au corps voisin »: the distance that brings the face against the body in front of it. */
  private touchRow(): HTMLElement | null {
    const gap = this.touchGap();
    if (gap === null) return null;
    const button = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, `Jusqu'au corps voisin (${formatLength(gap, this.ctx.unit())})`);
    button.addEventListener("click", () => this.setDistance(gap));
    return button;
  }

  /** From an edge: only the strip along it, or the whole face. */
  private stripRow(): HTMLElement | null {
    if (!this.strip) return null;
    const length = Math.hypot(...[0, 1, 2].map((i) => this.strip!.to[i]! - this.strip!.from[i]!));
    return this.selectRow("Tirer", this.stripOnly ? "strip" : "face", [["strip", `Le long de l'arête seulement (${formatLength(length, this.ctx.unit())})`], ["face", "Toute la face"]], (v) => {
      this.stripOnly = v === "strip";
      this.placeArrow();
      this.render();
      this.schedulePreview();
    });
  }

  protected rows(): (HTMLElement | null)[] {
    return [
      this.choiceRow(),
      this.stripRow(),
      this.touchRow(),
      this.info(`${this.faces.length} face(s) — tirez la flèche ou saisissez la distance (négative pour creuser).`),
      this.numberRow("Distance", this.distance, this.ctx.unit(), (v) => this.setDistance(v), true),
      this.info("Ou cliquez un point, une arête ou une face d'un corps : sa mesure devient la distance."),
      this.selectRow(
        "Arête",
        getEdgeTake(),
        [
          ["level", "Son niveau"],
          ["length", "Sa longueur"],
        ],
        (v) => setEdgeTake(v as EdgeTake),
      ),
      this.selectRow("Opération", this.operation, OPERATIONS, (v) => {
        this.operation = v as BooleanOperation;
        this.autoOperation = false;
        this.render();
        this.schedulePreview();
      }),
    ];
  }

  override down(event: PointerEvent): boolean {
    return this.arrow.dragStart(event);
  }

  override move(event: PointerEvent): void {
    const value = this.arrow.dragMove(event);
    if (value !== null) return this.setDistance(value);
    const overArrow = this.arrow.hovered(event);
    const stop = overArrow ? null : this.reference.find(event, (id) => id === this.id || id.startsWith(`${this.id}#`));
    this.marker.show(stop);
    this.ctx.viewport.renderer.domElement.style.cursor = overArrow ? "grab" : stop ? THIN_CROSSHAIR : "";
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) return true;
    return super.up(event, isClick);
  }

  protected override dispose(): void {
    this.arrow.dispose();
    this.marker.dispose();
    this.ctx.viewport.renderer.domElement.style.cursor = "";
  }
}
