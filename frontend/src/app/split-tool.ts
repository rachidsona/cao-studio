/**
 * Split tool: choose the body to split, then click planar faces whose
 * (infinite) planes cut it — e.g. the two inner faces of a frame's front and
 * back boards give four separate boards. The kernel result is previewed live.
 */
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type SplitFeature, type Vec3 } from "../document/types";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";

interface Plane {
  point: Vec3;
  normal: Vec3;
  /** Text shown in the panel. */
  label: string;
}

const AXES = ["X", "Y", "Z"];

function planeLabel(point: Vec3, normal: Vec3): string {
  const axis = normal.findIndex((c) => Math.abs(c) > 1 - 1e-6);
  if (axis >= 0) return `Plan ${AXES[axis]} = ${Number(point[axis]!.toFixed(3))} mm`;
  return "Plan incliné";
}

export class SplitTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private planes: Plane[];

  constructor(ctx: ToolContext, editing: SplitFeature | null, target?: string) {
    super(ctx, "Scinder un corps", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sp");
    this.name = editing?.name ?? uniqueName(doc, "Scission");
    this.target = editing?.target ?? target ?? ctx.bodies().at(-1)?.id;
    this.planes = (editing?.planes ?? []).map((p) => ({ ...p, label: planeLabel(p.point, p.normal) }));
  }

  /** Opens the tool, using faces already picked in the model as cutting planes. */
  async open(faces: FacePick[]): Promise<void> {
    if (!this.editing && faces[0]) this.target = faces[0].bodyId;
    for (const face of faces) await this.addPlane(face);
    this.start();
  }

  protected feature(): SplitFeature | string {
    if (!this.target) return "Choisissez le corps à scinder.";
    if (this.planes.length === 0) return "Cliquez une ou plusieurs faces planes : leur plan coupe le corps.";
    return {
      id: this.id,
      type: "split",
      name: this.name,
      target: this.target,
      planes: this.planes.map(({ point, normal }) => ({ point, normal })),
    };
  }

  protected rows(): (HTMLElement | null)[] {
    const bodies = this.ctx.bodies().filter((b) => featureOfBody(b.id) !== this.id);
    if (this.target && !bodies.some((b) => b.id === this.target)) bodies.push({ id: this.target, name: bodyLabel(this.ctx.doc(), this.target) });
    const list = this.planes.map((plane, i) =>
      this.checkRow(plane.label, true, (on) => {
        if (!on) this.planes.splice(i, 1);
        this.render();
        this.schedulePreview();
      }),
    );
    return [
      this.selectRow("Corps", this.target ?? "", bodies.map((b): [string, string] => [b.id, b.name]), (v) => {
        this.target = v;
        this.render();
        this.schedulePreview();
      }),
      this.info(this.planes.length ? "Plans de coupe (décochez pour retirer) :" : "Cliquez des faces planes pour définir les plans de coupe."),
      ...list,
    ];
  }

  private async addPlane(pick: FacePick): Promise<void> {
    try {
      const { face } = await this.ctx.geometry.describe(pick.bodyId, [], pick.faceIndex);
      if (!face || face.type !== "PLANE") {
        this.ctx.notify("Choisissez une face plane : son plan sert de coupe.", "error");
        return;
      }
      const same = this.planes.some(
        (p) =>
          Math.abs(p.normal[0] * face.normal[0] + p.normal[1] * face.normal[1] + p.normal[2] * face.normal[2]) > 1 - 1e-9 &&
          Math.abs((face.center[0] - p.point[0]) * p.normal[0] + (face.center[1] - p.point[1]) * p.normal[1] + (face.center[2] - p.point[2]) * p.normal[2]) < 1e-6,
      );
      if (same) return;
      this.planes.push({ point: face.center, normal: face.normal, label: planeLabel(face.center, face.normal) });
    } catch (error) {
      this.ctx.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  protected override click(event: PointerEvent): void {
    const pick = this.ctx.viewport.pickFace(event);
    if (!pick) return;
    // Faces of the preview pieces still define planes, but never become the body to split.
    if (!this.target && featureOfBody(pick.bodyId) !== this.id) this.target = pick.bodyId;
    void this.addPlane(pick).then(() => {
      this.render();
      this.schedulePreview();
    });
  }
}
