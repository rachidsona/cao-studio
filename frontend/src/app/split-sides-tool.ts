/**
 * Outil « Séparer les côtés » : on clique un corps déjà creux — un cadre, un caisson sans fond, un contour fermé à
 * trou extrudé, carré, triangle ou polygone — et chacun de ses côtés droits devient un corps, un panneau par côté
 * (features/ring-sides.ts). Les côtés se rejoignent en onglet (à tout angle) ou bout à bout (les plus longs
 * traversent). C'est une étape « Vider un corps » sans épaisseur : le corps est déjà vide, il n'est que coupé ; son
 * étape de l'historique rouvre cet outil. Un corps plein se vide d'abord (« Vider un corps »).
 */
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { ShellFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

const JOINTS: [NonNullable<ShellFeature["joint"]>, string][] = [["miter", "En onglet (tout angle)"], ["butt", "Bout à bout (les plus longs traversent)"]];
/** Kept for the session: the joint last chosen. */
let lastJoint: NonNullable<ShellFeature["joint"]> = "miter";

/** A step that splits a body already hollow into its sides: « Vider un corps » without a thickness. */
export const isSideSplit = (f: { type: string; thickness?: number; sides?: string; faces?: unknown[]; back?: unknown }): boolean =>
  f.type === "shell" && f.thickness === 0 && f.sides === "separate" && !f.back && (f.faces?.length ?? 0) === 0;

export class SplitSidesTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | null;
  private joint: NonNullable<ShellFeature["joint"]>;

  constructor(ctx: ToolContext, editing: ShellFeature | null, bodies: readonly string[] = []) {
    super(ctx, "Séparer les côtés", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sh");
    this.name = editing?.name ?? uniqueName(doc, "Côtés séparés");
    this.target = editing?.target ?? bodies[0] ?? null;
    this.joint = editing?.joint ?? lastJoint;
  }

  protected feature(): ShellFeature | string {
    if (!this.target) return "Cliquez le corps creux à séparer : un cadre, un caisson sans fond, un contour à trou extrudé.";
    return { id: this.id, type: "shell", name: this.name, target: this.target, faces: [], thickness: 0, sides: "separate", joint: this.joint };
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const name = this.target ? (findFeature(doc, this.target)?.name ?? bodyLabel(doc, this.target)) : null;
    return [
      this.info(name ? `Corps : « ${name} ». Cliquez-en un autre pour le changer.` : "Cliquez le corps creux à séparer."),
      this.selectRow("Joints", this.joint, JOINTS, (v) => {
        this.joint = lastJoint = v as NonNullable<ShellFeature["joint"]>;
        this.render();
        this.schedulePreview();
      }),
      this.info("Chaque côté droit devient un corps : 4 pour un cadre, 3 pour un triangle, autant que de côtés pour un polygone. Un corps plein se vide d'abord (« Vider un corps »)."),
    ];
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { bodies: [face.bodyId] } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    this.target = face.bodyId;
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
