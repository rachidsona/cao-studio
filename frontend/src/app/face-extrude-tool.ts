/**
 * Push/pull of selected planar faces (like desktop CAD tools): an arrow on
 * the face, dragged along its normal; pulling adds material (union), pushing
 * digs into the body (subtraction). The kernel result is previewed live.
 */
import { uniqueId, uniqueName } from "../document/operations";
import type { BooleanOperation, ExtrudeFeature, FaceRef } from "../document/types";
import { formatLength, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { openCalculator } from "../ui/calculator";
import { ArrowHandle } from "../viewport/arrow-handle";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";
import { getEdgeTake, referenceDistance, ReferencePicker, setEdgeTake, type EdgeTake } from "./reference-measure";

const OPERATIONS: [BooleanOperation, string][] = [
  ["join", "Union (ajouter)"],
  ["cut", "Soustraction (creuser)"],
  ["new", "Nouveau corps"],
  ["intersect", "Intersection"],
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
    this.reference = new ReferencePicker(ctx.viewport);
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

  private placeArrow(): void {
    const face = this.faces[0];
    if (!face) return;
    const unit = this.ctx.unit();
    this.arrow.place(face.center, face.normal, this.distance, `${trim(toDisplay(this.distance, unit), 3)} ${UNIT_LABELS[unit]}`);
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
      target: this.target,
      distance: this.distance,
      operation: this.operation,
    };
  }

  protected rows(): (HTMLElement | null)[] {
    return [
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
    if (value !== null) this.setDistance(value);
    else this.ctx.viewport.renderer.domElement.style.cursor = this.arrow.hovered(event) ? "grab" : "";
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) return true;
    return super.up(event, isClick);
  }

  protected override dispose(): void {
    this.arrow.dispose();
    this.ctx.viewport.renderer.domElement.style.cursor = "";
  }
}
