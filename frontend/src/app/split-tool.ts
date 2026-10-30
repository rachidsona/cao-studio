/**
 * "Scinder le corps": choose the body, the cutting tool (a construction plane,
 * or the plane of a planar face clicked in the view) and the parts to keep.
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
  private target: string | undefined;
  private mode: "plane" | "face" = "plane";
  private plane: PlaneName = "XY";
  private offset = 0;
  private face: { body: string; ref: FaceRef; label: string } | null = null;
  private keep: SplitKeep = "both";
  /** "Choisir le corps dans la vue": the next click picks the body to split (not the cutting face). */
  private pickingBody = false;
  /** Centre and size of the target (for the plane indicator and the arrow). */
  private center: Vec3 = [0, 0, 0];
  private extent = 100;
  private readonly arrow: ArrowHandle;
  private indicator: THREE.Group | null = null;

  constructor(ctx: ToolContext, editing: SplitFeature | null, target?: string) {
    super(ctx, "Scinder le corps", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sp");
    this.name = editing?.name ?? uniqueName(doc, "Scission");
    this.target = editing?.target ?? target ?? ctx.bodies().at(-1)?.id;
    if (editing) {
      this.keep = editing.keep;
      if (editing.tool.kind === "plane") {
        this.plane = editing.tool.plane;
        this.offset = editing.tool.offset;
      } else {
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
      // The cut is made in another body when there is one: a body cut by its own face is only touched.
      const other = this.ctx.bodies().find((b) => b.id !== face.bodyId);
      if (!this.target || this.target === face.bodyId) this.target = other?.id ?? face.bodyId;
      this.mode = "face";
      await this.setFace(face);
    } else if (!this.editing) this.offset = this.centreOffset();
    this.measureTarget();
    this.start();
    this.sync();
  }

  // ---- geometry of the tool ---------------------------------------------------------

  /** Centre and size of the target while it is still displayed (the preview replaces it). */
  private measureTarget(): void {
    const bbox = this.target ? this.ctx.viewport.bodyMesh(this.target)?.metrics.bbox : undefined;
    if (!bbox) return;
    const [min, max] = bbox;
    this.center = [0, 1, 2].map((i) => ((min[i] as number) + (max[i] as number)) / 2) as Vec3;
    this.extent = 1.4 * Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]), 10);
  }

  /** Normal (positive side) and a point of the current cutting plane, or null while it is not chosen. */
  private planeNow(): { normal: Vec3; origin: Vec3 } | null {
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
      this.face = { body: pick.bodyId, ref: face, label: `Face plane de « ${bodyLabel(this.ctx.doc(), pick.bodyId)} » (normale ${directionText(face.normal)})` };
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  // ---- feature ---------------------------------------------------------------------

  protected feature(): SplitFeature | string {
    if (!this.target) return "Choisissez le corps à scinder.";
    if (this.mode === "face" && !this.face) return "Cliquez une face plane dans la vue : son plan coupe le corps.";
    const tool: CutTool = this.mode === "plane" || !this.face ? { kind: "plane", plane: this.plane, offset: this.offset } : { kind: "face", body: this.face.body, face: this.face.ref };
    return { id: this.id, type: "split", name: this.name, target: this.target, tool, keep: this.keep };
  }

  /** The result cannot be validated while the kernel refuses the cut. */
  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "La coupe est invalide.") : null;
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
    const bodies = this.ctx.bodies().filter((b) => featureOfBody(b.id) !== this.id);
    if (this.target && !bodies.some((b) => b.id === this.target)) bodies.push({ id: this.target, name: bodyLabel(this.ctx.doc(), this.target) });
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
            this.face ? this.linkButton("Choisir une autre face", () => ((this.face = null), this.sync())) : null,
          ];
    return [
      this.selectRow("Corps", this.target ?? "", bodies.map((b): [string, string] => [b.id, b.name]), (v) => this.setTarget(v)),
      this.pickingBody
        ? this.info("Cliquez dans la vue le corps à scinder (Échap : annuler).")
        : this.linkButton("Choisir le corps dans la vue (souris)", () => {
            this.pickingBody = true;
            this.render();
          }),
      this.selectRow("Outil", this.mode, [["plane", "Plan de construction"], ["face", "Face plane (clic dans la vue)"]], (v) => {
        this.mode = v as "plane" | "face";
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

  private setTarget(id: string): void {
    this.target = id;
    this.measureTarget();
    if (this.mode === "plane") this.offset = this.centreOffset();
    this.sync();
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
    if (this.mode !== "plane" || !this.target) {
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
    if (this.pickingBody) {
      // The body under the pointer lights up; the preview's pieces stand for the body already chosen.
      const pick = this.ctx.viewport.pickFace(event);
      const id = pick && featureOfBody(pick.bodyId) !== this.id ? pick.bodyId : null;
      this.ctx.viewport.setHoverHighlight(id ? { bodies: [id] } : null);
      this.ctx.viewport.renderer.domElement.style.cursor = id ? "pointer" : "";
      return;
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
    if (this.pickingBody) {
      const id = featureOfBody(pick.bodyId) === this.id ? this.target : pick.bodyId;
      this.stopPickingBody();
      if (id && id !== this.target) this.setTarget(id);
      return;
    }
    // The pieces of the preview are this feature's own result: they can be neither the body nor the tool.
    if (featureOfBody(pick.bodyId) === this.id) {
      this.ctx.notify("Choisissez une face d'un autre corps, ou passez à « Plan de construction ».", "info");
      return;
    }
    if (this.mode === "face") {
      void this.setFace(pick).then(() => this.sync());
      return;
    }
    if (pick.bodyId !== this.target) {
      this.target = pick.bodyId;
      this.measureTarget();
      this.offset = this.centreOffset();
      this.sync();
    }
  }
}
