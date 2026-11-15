/**
 * Outil « Séparer les côtés » : on clique un corps — un cadre, un caisson sans fond, un contour fermé à trou extrudé,
 * carré, triangle ou polygone, côtés droits ou courbes, paroi régulière ou non — et chacun de ses côtés devient un
 * corps, un panneau par côté (features/ring-sides.ts). Un corps plein est d'abord vidé à l'« Épaisseur des côtés »,
 * ouvert aux deux bouts de son axe (le dessus et le dessous). Les côtés se rejoignent en onglet (à tout angle) ou bout à
 * bout (les plus longs traversent). C'est une étape « Vider un corps » marquée `frame` ; son étape de l'historique
 * rouvre cet outil.
 */
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { ShellFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

const JOINTS: [NonNullable<ShellFeature["joint"]>, string][] = [["miter", "En onglet (tout angle)"], ["butt", "Bout à bout (les plus longs traversent)"]];
/** Kept for the session: the joint last chosen. */
let lastJoint: NonNullable<ShellFeature["joint"]> = "miter";
let lastThickness = 18;

/** A « Séparer les côtés » step: « Vider un corps » marked `frame` (or, the first ones, without a thickness). */
export const isSideSplit = (f: { type: string; thickness?: number; sides?: string; faces?: unknown[]; back?: unknown; frame?: boolean }): boolean =>
  f.type === "shell" && (f.frame === true || f.thickness === 0) && f.sides === "separate" && !f.back && (f.faces?.length ?? 0) === 0;

export class SplitSidesTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | null;
  private joint: NonNullable<ShellFeature["joint"]>;
  /** The sides' thickness when the body is solid (it is emptied first); unused for a body already hollow. */
  private thickness: number;

  constructor(ctx: ToolContext, editing: ShellFeature | null, bodies: readonly string[] = []) {
    super(ctx, "Séparer les côtés", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sh");
    this.name = editing?.name ?? uniqueName(doc, "Côtés séparés");
    this.target = editing?.target ?? bodies[0] ?? null;
    this.joint = editing?.joint ?? lastJoint;
    this.thickness = editing?.thickness || lastThickness;
  }

  protected feature(): ShellFeature | string {
    if (!this.target) return "Cliquez le corps à séparer en ses côtés : un cadre, un caisson sans fond, un contour extrudé, plein ou creux.";
    return { id: this.id, type: "shell", name: this.name, target: this.target, faces: [], thickness: this.thickness, sides: "separate", joint: this.joint, frame: true };
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const name = this.target ? (findFeature(doc, this.target)?.name ?? bodyLabel(doc, this.target)) : null;
    return [
      this.info(name ? `Corps : « ${name} ». Cliquez-en un autre pour le changer.` : "Cliquez le corps à séparer en ses côtés."),
      this.numberRow("Épaisseur des côtés", this.thickness, this.ctx.unit(), (v) => {
        this.thickness = lastThickness = v;
        this.render();
        this.schedulePreview();
      }),
      this.selectRow("Joints", this.joint, JOINTS, (v) => {
        this.joint = lastJoint = v as NonNullable<ShellFeature["joint"]>;
        this.render();
        this.schedulePreview();
      }),
      this.info("Chaque côté devient un corps : 4 pour un cadre, 3 pour un triangle, autant que de côtés pour un polygone, un coin arrondi le sien. Un corps plein est vidé à l'épaisseur des côtés, ouvert dessus et dessous ; un corps déjà creux garde ses côtés tels qu'ils sont."),
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
