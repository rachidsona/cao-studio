/**
 * "Scinder le corps": choose the bodies to cut (clicked in the view, one or
 * several: each click adds or removes one), the cutting tool (a construction
 * plane, or the plane of a planar face clicked in the view) and the parts to
 * keep. Each body cut is a split of its own, all with the same tool.
 * The result is computed live by the kernel (the real cut, shown as separate
 * tinted bodies) and cannot be validated while it fails, e.g. when the tool
 * does not cross the body. A plane indicator and an arrow in the view show
 * where the cut is and set its offset.
 */
import * as THREE from "three";
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type FaceRef, type PlaneName, type SplitFeature, type SplitKeep, type SplitTool as CutTool, type Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import { closeCalculator, openCalculator } from "../ui/calculator";
import { sketchFrame } from "../sketcher/frame";
import { ArrowHandle } from "../viewport/arrow-handle";
import type { FacePick } from "../viewport/viewport";
import type { Feature } from "../document/types";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

const PLANES: [PlaneName, string][] = [
  ["XY", "XY — horizontal (+Z)"],
  ["XZ", "XZ — de face (−Y)"],
  ["YZ", "YZ — de côté (+X)"],
];
const KEEP: [SplitKeep, string][] = [
  ["both", "Les deux parties"],
  ["positive", "Côté positif (+) seulement"],
  ["negative", "Côté négatif (−) seulement"],
];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** "+Z" for an axis-aligned direction, else its components. */
function directionText(n: Vec3): string {
  const axis = n.findIndex((c) => Math.abs(c) > 1 - 1e-6);
  if (axis >= 0) return `${(n[axis] as number) > 0 ? "+" : "−"}${"XYZ"[axis]}`;
  return `(${n.map((c) => c.toFixed(2)).join(" ; ")})`;
}

export class SplitTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  /** The bodies to cut: the first is this split, the others its companions (one split each, same tool). */
  private targets: string[];
  /** Boxes of the bodies to cut, taken while they are displayed (the preview replaces them). */
  private readonly boxes = new Map<string, [Vec3, Vec3]>();
  private mode: "plane" | "face" = "plane";
  private plane: PlaneName = "XY";
  private offset = 0;
  private face: { body: string; ref: FaceRef; label: string } | null = null;
  /** Where the cutting face was clicked: marked in blue while the tool is open. */
  private facePick: FacePick | null = null;
  private keep: SplitKeep = "both";
  /** A cut by a line traced on a face (« Magie extrusion »), edited here: kept until another tool is chosen. */
  private line: Extract<CutTool, { kind: "line" }> | null = null;
  /** In "Face plane", clicks choose the cutting face until there is one, then the bodies to cut. */
  private pickingBody = false;
  /** Centre and size of the target (for the plane indicator and the arrow). */
  private center: Vec3 = [0, 0, 0];
  private extent = 100;
  private readonly arrow: ArrowHandle;
  private indicator: THREE.Group | null = null;

  constructor(ctx: ToolContext, editing: SplitFeature | null, selected: string[] = []) {
    super(ctx, "Scinder le corps", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sp");
    this.name = editing?.name ?? uniqueName(doc, "Scission");
    const last = ctx.bodies().at(-1)?.id;
    this.targets = editing ? [editing.target] : selected.length ? [...selected] : last ? [last] : [];
    if (editing) {
      this.keep = editing.keep;
      if (editing.tool.kind === "plane") {
        this.plane = editing.tool.plane;
        this.offset = editing.tool.offset;
      } else if (editing.tool.kind === "line") this.line = editing.tool;
      else {
        this.mode = "face";
        this.face = { body: editing.tool.body, ref: editing.tool.face, label: `Face plane de « ${bodyLabel(doc, editing.tool.body)} »` };
      }
    }
    // The arrow sets the offset of a construction plane; its value opens the keypad.
    this.arrow = new ArrowHandle(ctx.viewport, (anchor) =>
      openCalculator({
        container: ctx.container,
        anchor,
        value: this.offset,
        unit: ctx.unit(),
        title: "Décalage du plan de coupe",
        locked: true,
        allowNegative: true,
        onSubmit: (value) => {
          this.setOffset(value);
          return true;
        },
      }),
    );
  }

  /** Opens the tool; a planar face already selected in the model becomes the cutting face. */
  async open(faces: FacePick[]): Promise<void> {
    this.measureTarget();
    const face = faces[0];
    if (!this.editing && face) {
      // The cut is made in other bodies when there are some: a body cut by its own face is only touched.
      const other = this.ctx.bodies().find((b) => b.id !== face.bodyId);
      this.targets = this.targets.filter((t) => t !== face.bodyId);
      if (!this.targets.length) this.targets = [other?.id ?? face.bodyId];
      this.mode = "face";
      await this.setFace(face);
      // The face given, clicks choose the bodies to cut.
      this.pickingBody = this.face !== null;
    } else if (!this.editing) this.offset = this.centreOffset();
    this.measureTarget();
    this.start();
    this.sync();
  }

  // ---- geometry of the tool ---------------------------------------------------------

  /** Centre and size of the bodies to cut while they are still displayed (the preview replaces them). */
  private measureTarget(): void {
    for (const t of this.targets) {
      const b = this.ctx.viewport.bodyMesh(t)?.metrics.bbox;
      if (b && !this.boxes.has(t)) this.boxes.set(t, [[...b[0]] as Vec3, [...b[1]] as Vec3]);
    }
    const boxes = this.targets.map((t) => this.boxes.get(t)).filter((b) => b !== undefined);
    if (!boxes.length) return;
    const min = [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i] as number))) as Vec3;
    const max = [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i] as number))) as Vec3;
    this.center = [0, 1, 2].map((i) => ((min[i] as number) + (max[i] as number)) / 2) as Vec3;
    this.extent = 1.4 * Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]), 10);
  }

  /** Normal (positive side) and a point of the current cutting plane, or null while it is not chosen. */
  private planeNow(): { normal: Vec3; origin: Vec3 } | null {
    if (this.line) return this.line;
    if (this.mode === "plane") {
      const frame = sketchFrame(this.plane, this.offset);
      return { normal: frame.normal, origin: frame.origin };
    }
    return this.face ? { normal: this.face.ref.normal, origin: this.face.ref.center } : null;
  }

  /** Offset of the plane through the centre of the target: the first cut is a real one. */
  private centreOffset(): number {
    const normal = sketchFrame(this.plane, 0).normal;
    return Number(dot(this.center, normal).toFixed(3));
  }

  private setOffset(value: number): void {
    this.offset = value;
    this.sync();
  }

  private async setFace(pick: FacePick): Promise<void> {
    try {
      const { face } = await this.ctx.geometry.describe(pick.bodyId, [], pick.faceIndex);
      if (!face || face.type !== "PLANE") {
        this.ctx.notify("Choisissez une face plane : le moteur coupe un solide par des plans.", "error");
        return;
      }
      this.facePick = pick;
      this.face = { body: pick.bodyId, ref: face, label: `Face plane de « ${bodyLabel(this.ctx.doc(), pick.bodyId)} » (normale ${directionText(face.normal)})` };
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  // ---- feature ---------------------------------------------------------------------

  /** Whether the cutting plane goes through a body's box (a body it misses is left whole). */
  private crosses(id: string): boolean {
    const box = this.boxes.get(id);
    const plane = this.planeNow();
    if (!box || !plane || this.editing) return true;
    const levels = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => dot([box[k & 1 ? 1 : 0][0], box[k & 2 ? 1 : 0][1], box[k & 4 ? 1 : 0][2]], plane.normal));
    const at = dot(plane.origin, plane.normal);
    return Math.min(...levels) < at - 1e-6 && Math.max(...levels) > at + 1e-6;
  }

  /** The split of each body to cut that the plane crosses (the first one this tool's own), all with the same tool. */
  private splits(): SplitFeature[] {
    if (this.mode === "face" && !this.face) return [];
    const crossed = this.targets.filter((t) => this.crosses(t));
    const tool: CutTool = this.line ?? (this.mode === "plane" || !this.face ? { kind: "plane", plane: this.plane, offset: this.offset } : { kind: "face", body: this.face.body, face: this.face.ref });
    // Fresh ids after this one's for the others (the first fresh one is this tool's own).
    const more = this.editing ? [] : freshFeatureIds(this.ctx.doc(), "sp", "Scission", crossed.length).slice(1);
    return crossed.map((target, i) => ({ ...(i === 0 ? { id: this.id, name: this.name } : more[i - 1]!), type: "split", target, tool, keep: this.keep }));
  }

  protected feature(): SplitFeature | string {
    if (!this.targets.length) return "Cliquez dans la vue le ou les corps à couper.";
    if (this.mode === "face" && !this.face) return "Cliquez une face plane dans la vue : son plan coupe les corps.";
    return this.splits()[0] ?? "Le plan de coupe ne traverse aucun des corps choisis : déplacez-le ou choisissez-en d'autres.";
  }

  protected override companions(): Feature[] {
    return this.splits().slice(1);
  }

  /** The result cannot be validated while the kernel refuses one of the cuts. */
  protected override blocker(): string | null {
    for (const f of this.splits()) {
      const status = this.ctx.status(f.id);
      if (status && status.state !== "ok") return `${bodyLabel(this.ctx.doc(), f.target)} : ${status.message ?? "la coupe est invalide."}`;
    }
    return null;
  }

  override confirm(): void {
    const reason = this.blocker();
    if (reason) {
      this.ctx.notify(reason, "error");
      return;
    }
    super.confirm();
  }

  // ---- panel -----------------------------------------------------------------------

  protected rows(): (HTMLElement | null)[] {
    const sides = this.planeNow();
    const cutRows =
      this.mode === "plane"
        ? [
            this.selectRow("Plan", this.plane, PLANES, (v) => {
              this.plane = v as PlaneName;
              this.offset = this.centreOffset();
              this.sync();
            }),
            this.numberRow("Décalage", this.offset, this.ctx.unit(), (v) => this.setOffset(v), true),
          ]
        : [
            this.info(this.face ? this.face.label : "Cliquez une face plane dans la vue."),
            this.face ? this.linkButton("Choisir une autre face", () => ((this.face = null), (this.pickingBody = false), this.sync())) : null,
          ];
    const doc = this.ctx.doc();
    const names = this.targets.map((t) => bodyLabel(doc, t));
    const choosing = this.mode === "plane" || this.pickingBody;
    return [
      this.info(names.length ? `Corps à couper (${names.length}) : ${names.join(", ")}` : "Aucun corps à couper."),
      ...(() => {
        // Those the plane misses are left whole.
        const missed = this.targets.filter((t) => !this.crosses(t)).map((t) => bodyLabel(doc, t));
        return missed.length ? [this.info(`Pas traversé${missed.length > 1 ? "s" : ""} par le plan, laissé${missed.length > 1 ? "s" : ""} entier${missed.length > 1 ? "s" : ""} : ${missed.join(", ")}`)] : [];
      })(),
      choosing
        ? this.info(this.editing ? "Cliquez un autre corps pour le couper à la place." : "Cliquez dans la vue les corps à couper : un clic ajoute, un second retire.")
        : this.linkButton("Choisir les corps à couper (clic dans la vue)", () => {
            this.pickingBody = true;
            this.render();
          }),
      names.length > 1 ? this.linkButton("Ne garder que le premier", () => this.setTargets(this.targets.slice(0, 1))) : null,
      this.selectRow("Outil", this.mode, [["plane", "Plan de construction"], ["face", "Face plane (clic dans la vue)"]], (v) => {
        this.mode = v as "plane" | "face";
        this.line = null;
        this.face = null; // pick again: the target is shown whole until a face is chosen
        if (this.mode === "plane") this.offset = this.centreOffset();
        this.sync();
      }),
      ...cutRows,
      this.selectRow("Conserver", this.keep, KEEP, (v) => {
        this.keep = v as SplitKeep;
        this.sync();
      }),
      sides ? this.info(`Côté + : vers ${directionText(sides.normal)}. Chaque morceau séparé devient un corps.`) : null,
    ];
  }

  private setTargets(ids: string[]): void {
    this.targets = ids;
    this.measureTarget();
    if (this.mode === "plane") this.offset = this.centreOffset();
    this.sync();
  }

  /** A body clicked: added to the bodies to cut, or taken out (one only when editing a split). */
  private toggleTarget(id: string): void {
    if (this.editing) return this.setTargets([id]);
    if (this.targets.includes(id)) {
      if (this.targets.length === 1) return this.ctx.notify("Il faut au moins un corps à couper.", "info");
      return this.setTargets(this.targets.filter((t) => t !== id));
    }
    this.setTargets([...this.targets, id]);
  }

  /** The body a click is on: a piece of the preview stands for the body it was cut from. */
  private bodyOf(bodyId: string): string {
    const split = this.splits().find((f) => f.id === featureOfBody(bodyId));
    return split ? split.target : bodyId;
  }

  override handleKey(event: KeyboardEvent): boolean {
    if (event.key === "Escape" && this.pickingBody) {
      this.stopPickingBody();
      return true;
    }
    return super.handleKey(event);
  }

  private stopPickingBody(): void {
    this.pickingBody = false;
    this.ctx.viewport.setHoverHighlight(null);
    this.ctx.viewport.renderer.domElement.style.cursor = "";
    this.render();
  }

  private linkButton(label: string, run: () => void): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-left text-sky-700 underline hover:text-sky-900 dark:text-sky-300";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  /** Redraws the panel, the plane indicator and the arrow, and asks for a new preview. */
  private sync(): void {
    // The bodies to cut stay marked in orange, the cutting face in blue.
    const face = this.mode === "face" && this.face && this.facePick ? [{ face: this.facePick, role: "second" as const }] : [];
    this.ctx.viewport.setChosen([...this.targets.map((body) => ({ body, role: "first" as const })), ...face]);
    this.render();
    this.placeIndicator();
    this.placeArrow();
    this.schedulePreview();
  }

  // ---- view: plane indicator and arrow --------------------------------------------

  private placeIndicator(): void {
    this.removeIndicator();
    const now = this.planeNow();
    if (!now) return;
    const { normal, origin } = now;
    // The plane n·x = n·origin, drawn around the centre of the target.
    const along = dot(normal, origin) - dot(normal, this.center);
    const at = new THREE.Vector3(...this.center).addScaledVector(new THREE.Vector3(...normal), along);
    const group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(this.extent, this.extent);
    const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xd97706, depthTest: false }));
    fill.renderOrder = 14;
    outline.renderOrder = 15;
    group.add(fill, outline);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...normal));
    group.position.copy(at);
    this.ctx.viewport.scene.add(group);
    this.indicator = group;
  }

  private removeIndicator(): void {
    if (!this.indicator) return;
    this.ctx.viewport.scene.remove(this.indicator);
    this.indicator.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.indicator = null;
  }

  private placeArrow(): void {
    if (this.mode !== "plane" || !this.targets.length) {
      this.arrow.object.visible = false;
      return;
    }
    const normal = sketchFrame(this.plane, 0).normal;
    // Axis through the centre of the target along the plane normal: the arrow sits where it meets the plane.
    const base: Vec3 = [0, 1, 2].map((i) => (this.center[i] as number) - (normal[i] as number) * dot(this.center, normal)) as Vec3;
    this.arrow.place(base, normal, this.offset, formatLength(this.offset, this.ctx.unit()));
  }

  protected override dispose(): void {
    closeCalculator();
    this.ctx.viewport.setHoverHighlight(null);
    this.removeIndicator();
    this.arrow.dispose();
  }

  // ---- pointer -----------------------------------------------------------------------

  override down(event: PointerEvent): boolean {
    return this.mode === "plane" && this.arrow.dragStart(event);
  }

  override move(event: PointerEvent): void {
    if (this.pickingBody || this.mode === "plane") {
      // The body under the pointer lights up (a click adds or removes it).
      const pick = this.ctx.viewport.pickFace(event);
      this.ctx.viewport.setHoverHighlight(pick ? { bodies: [pick.bodyId] } : null);
      if (this.pickingBody) {
        this.ctx.viewport.renderer.domElement.style.cursor = pick ? "pointer" : "";
        return;
      }
    }
    const dragged = this.arrow.dragMove(event);
    if (dragged !== null) {
      this.setOffset(dragged);
      return;
    }
    this.ctx.viewport.renderer.domElement.style.cursor = this.arrow.hovered(event) ? "grab" : "";
  }

  override up(event: PointerEvent, isClick: boolean): boolean {
    if (this.arrow.dragEnd()) return true;
    if (isClick) this.click(event);
    return isClick;
  }

  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (!pick) return;
    // Choosing the bodies to cut: each click adds one or takes it out.
    if (this.mode === "plane" || this.pickingBody) return this.toggleTarget(this.bodyOf(pick.bodyId));
    // The pieces of the preview are this tool's own result: they cannot be the cutting face.
    if (this.splits().some((f) => f.id === featureOfBody(pick.bodyId))) {
      this.ctx.notify("Choisissez une face d'un autre corps, ou passez à « Plan de construction ».", "info");
      return;
    }
    // The face chosen, the next clicks choose the bodies to cut.
    void this.setFace(pick).then(() => {
      if (this.face) this.pickingBody = true;
      this.sync();
    });
  }
}
