/**
 * Push/pull of selected planar faces (like desktop CAD tools): an arrow on
 * the face, dragged along its normal; pulling adds material (union), pushing
 * digs into the body (subtraction). The kernel result is previewed live. « Tirer une face » from a selected edge
 * opens it on one of the two faces along the edge (the smaller, the end of a board), the other one a choice away —
 * and only the strip of the face along the edge is pulled (as a line drawn on the face would split it), or the whole
 * face if asked. If another body stands in front of the face (a side of the cabinet, a wall), « Jusqu'au corps voisin »
 * pulls it right up to it (features/touch.ts). Faces of several bodies (selected before, or Maj + clic on another body)
 * are pulled alike, one step per body, in one undo; Maj + clic on a body chosen takes it off.
 */
import { THIN_CROSSHAIR } from "../ui/cursor";
import { uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type BooleanOperation, type ExtrudeFeature, type FaceRef, type Vec3 } from "../document/types";
import { freshFeatureIds, removing } from "./curic-common";
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
  /** The faces of the other bodies chosen, each body a step made with this one. */
  private more: { target: string; faces: FaceRef[] }[] = [];
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
    await this.take(picks);
    this.placeArrow();
    this.start();
  }

  /** The faces to pull, by body (the first one's this step's, each other one a step with it): read from the kernel. */
  private async take(picks: FacePick[]): Promise<void> {
    this.reference.capture();
    const [first] = picks;
    if (!this.editing && first) {
      this.target = first.bodyId;
      try {
        const groups = await Promise.all([...new Set(picks.map((p) => p.bodyId))].map(async (target) => {
          const refs = await Promise.all(picks.filter((p) => p.bodyId === target).map((p) => this.ctx.geometry.describe(p.bodyId, [], p.faceIndex)));
          return { target, faces: refs.flatMap((r) => (r.face && r.face.type === "PLANE" ? [r.face] : [])), all: refs.length };
        }));
        this.faces = groups[0]!.faces;
        this.more = groups.slice(1).filter((g) => g.faces.length).map(({ target, faces }) => ({ target, faces }));
        if (groups.some((g) => g.faces.length < g.all)) this.ctx.notify("Seules les faces planes peuvent être extrudées.", "info");
      } catch (error) {
        this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
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

  /** Maj + clic: a body chosen (or its preview) taken off, or the face clicked on another body pulled alike. */
  private async toggleBody(pick: FacePick): Promise<void> {
    const all = [...(this.target ? [{ target: this.target, faces: this.faces }] : []), ...this.more];
    const own = all.findIndex((g) => g.target === pick.bodyId);
    const at = own >= 0 ? own : this.ids().indexOf(featureOfBody(pick.bodyId));
    if (at >= 0 && at < all.length) all.splice(at, 1);
    else {
      const ref = (await this.ctx.geometry.describe(pick.bodyId, [], pick.faceIndex)).face;
      if (ref?.type !== "PLANE") return this.ctx.notify("Seules les faces planes peuvent être extrudées.", "info");
      all.push({ target: pick.bodyId, faces: [ref] });
    }
    const [first, ...rest] = all;
    this.target = first?.target;
    this.faces = first?.faces ?? [];
    this.more = rest;
    this.placeArrow();
    this.render();
    this.schedulePreview();
  }

  /** A click on a corner, an edge or a face of a body: its measure becomes the distance. */
  protected override click(event: PointerEvent): void {
    if (removing(event) && !this.editing && !this.strip) {
      const pick = this.ctx.viewport.pickFace(event);
      if (pick) void this.toggleBody(pick).catch((e: unknown) => this.ctx.notify(e instanceof Error ? e.message : String(e), "error"));
      return;
    }
    const face = this.faces[0];
    // No face yet (the tool afresh after « OK »): the click takes the face to pull.
    if (!face) {
      const pick = this.editing ? null : this.ctx.viewport.pickFace(event, (id) => id === this.id || id.startsWith(`${this.id}#`));
      if (!pick) return;
      void this.take([pick]).then(() => {
        this.placeArrow();
        this.render();
        this.schedulePreview();
      });
      return;
    }
    // The faces and edges of the tool's own preview are not references.
    const reference = this.reference.find(event, (id) => id === this.id || id.startsWith(`${this.id}#`));
    if (!reference) return;
    const taken = referenceDistance(reference, face.center, face.normal, getEdgeTake());
    if (!taken) return this.ctx.notify("Ce point est au niveau de la face : la distance serait nulle.", "info");
    this.setDistance(taken.value);
    this.ctx.notify(`Distance prise : ${formatLength(Math.abs(taken.value), this.ctx.unit())} (${taken.what}).`, "info");
  }

  private made(id: string, name: string, target: string, faces: FaceRef[]): ExtrudeFeature {
    return { id, type: "extrude", name, faces, ...(this.strip && this.stripOnly && id === this.id ? { strip: this.strip } : {}), target, distance: this.distance, operation: this.operation };
  }

  protected feature(): ExtrudeFeature | string {
    if (!this.target || this.faces.length === 0) return "Cliquez une face plane d'un corps à tirer ou pousser.";
    return this.made(this.id, this.name, this.target, this.faces);
  }

  /** The steps of the other bodies chosen, ids after this one's. */
  private steps(): { id: string; name: string }[] {
    const doc = this.docBefore();
    return freshFeatureIds({ ...doc, features: [...doc.features, this.made(this.id, this.name, this.target ?? "", this.faces)] }, "ex", "Extrusion", this.more.length);
  }

  private ids(): string[] {
    return [this.id, ...this.steps().map((n) => n.id)];
  }

  protected override companions(): ExtrudeFeature[] {
    return this.steps().map((n, i) => this.made(n.id, n.name, this.more[i]!.target, this.more[i]!.faces));
  }

  /** The kernel cannot pull the face so (its message is on the panel): OK waits, and the body stays as it is. */
  protected override blocker(): string | null {
    for (const id of this.ids()) {
      const status = this.ctx.status(id);
      if (status && status.state !== "ok") return status.message ?? "Cette face ne peut pas être extrudée ainsi.";
    }
    return null;
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
      this.info(`${this.faces.length + this.more.reduce((n, g) => n + g.faces.length, 0)} face(s)${this.more.length ? ` sur ${this.more.length + 1} corps` : ""} — tirez la flèche ou saisissez la distance (négative pour creuser).`),
      this.editing || this.strip ? null : this.info("Maj + clic sur la face d'un autre corps : elle est tirée de même, OK les fait toutes en une seule annulation ; Maj + clic sur un corps choisi le retire."),
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
