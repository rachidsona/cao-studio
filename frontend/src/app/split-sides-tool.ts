/**
 * Outil « Séparer les côtés » : on clique un corps — un cadre, un caisson sans fond, un contour fermé à trou extrudé,
 * carré, triangle ou polygone, côtés droits ou courbes, paroi régulière ou non — et chacun de ses côtés devient un
 * corps, un panneau par côté (features/ring-sides.ts). Un corps plein est d'abord vidé à l'« Épaisseur des côtés »,
 * ouvert aux deux bouts de son axe (le dessus et le dessous). Les côtés se rejoignent en onglet (à tout angle) ou bout à
 * bout — les côtés passent, ou le dessus et le dessous, comme dans une Répartition, ou les plus longs. Un corps fait de
 * panneaux d'équerre joints (un caisson d'un seul corps) est redécoupé en ses panneaux (features/board-split.ts).
 * « Séparer seulement » ne vide jamais : le corps est coupé tel qu'il est (une façade à cadre en U et sa rainure de
 * verre en ses montants et sa traverse) ; « Vider et séparer » vide d'abord un corps plein (épaisseur 0 : séparer seulement).
 * C'est une étape « Vider un corps » marquée `frame` ; son étape de l'historique
 * rouvre cet outil.
 */
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import { featureOfBody, type ShellFeature, type Vec3 } from "../document/types";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";

/** The joints, and for butted ones which pass at the corners (as a Répartition's « Qui passe aux angles »). */
type Joint = "miter" | "butt" | "butt:sides" | "butt:boards";
const JOINTS: [Joint, string][] = [
  ["miter", "En onglet (tout angle)"],
  ["butt:sides", "Bout à bout : les côtés passent"],
  ["butt:boards", "Bout à bout : le dessus et le dessous passent"],
  ["butt", "Bout à bout : les plus longs passent"],
];
const jointOf = (f: { joint?: ShellFeature["joint"]; pass?: ShellFeature["pass"] }): Joint => (f.joint === "butt" ? (f.pass ? `butt:${f.pass}` : "butt") : "miter");
/** Kept for the session: the joint last chosen. */
let lastJoint: Joint = "miter";
let lastThickness = 18;
/** « Séparer seulement » (the body cut as it is) or « Vider et séparer » (a solid body emptied first). */
type Mode = "split" | "hollow";
let lastMode: Mode = "hollow";

/** A « Séparer les côtés » step: « Vider un corps » marked `frame` (or, the first ones, without a thickness). */
export const isSideSplit = (f: { type: string; thickness?: number; sides?: string; faces?: unknown[]; back?: unknown; frame?: boolean }): boolean =>
  f.type === "shell" && (f.frame === true || f.thickness === 0) && f.sides === "separate" && !f.back && (f.faces?.length ?? 0) === 0;

export class SplitSidesTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | null;
  private joint: Joint;
  /** The sides' thickness when the body is solid (it is emptied first); unused for a body already hollow. */
  private thickness: number;
  /** The way a solid body is opened: the normal of a face of it clicked (with the one facing it); null: top and bottom. */
  private open: Vec3 | null;
  private mode: Mode;

  constructor(ctx: ToolContext, editing: ShellFeature | null, bodies: readonly string[] = []) {
    super(ctx, "Séparer les côtés", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sh");
    this.name = editing?.name ?? uniqueName(doc, "Côtés séparés");
    this.target = editing?.target ?? bodies[0] ?? null;
    this.joint = editing ? jointOf(editing) : lastJoint;
    this.thickness = editing?.thickness || lastThickness;
    this.open = editing?.open ?? null;
    this.mode = editing ? (editing.thickness === 0 ? "split" : "hollow") : lastMode;
  }

  protected feature(): ShellFeature | string {
    if (!this.target) return "Cliquez le corps à séparer en ses côtés : un cadre, un caisson sans fond, un contour extrudé, plein ou creux.";
    const [joint, pass] = this.joint.split(":") as ["miter" | "butt", ("sides" | "boards")?];
    return { id: this.id, type: "shell", name: this.name, target: this.target, faces: [], thickness: this.mode === "split" ? 0 : this.thickness, sides: "separate", joint, ...(pass ? { pass } : {}), ...(this.open ? { open: this.open } : {}), frame: true };
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const name = this.target ? (findFeature(doc, this.target)?.name ?? bodyLabel(doc, this.target)) : null;
    return [
      this.info(name ? `Corps : « ${name} ». Cliquez-en un autre pour le changer.` : "Cliquez le corps à séparer en ses côtés."),
      this.selectRow("Le corps", this.mode, [["split", "Séparer seulement (tel qu'il est)"], ["hollow", "Vider et séparer"]], (v) => {
        this.mode = lastMode = v as Mode;
        this.render();
        this.schedulePreview();
      }),
      this.mode === "split" ? null : this.numberRow("Épaisseur des côtés", this.thickness, this.ctx.unit(), (v) => {
        this.thickness = lastThickness = v;
        this.render();
        this.schedulePreview();
      }),
      this.selectRow("Joints", this.joint, JOINTS, (v) => {
        this.joint = lastJoint = v as Joint;
        this.render();
        this.schedulePreview();
      }),
      this.mode === "split" ? null : this.info(this.open ? "Ouvert par la face cliquée et celle d'en face. Cliquez une autre face du corps pour l'ouvrir ailleurs." : "Ouvert dessus et dessous — ou, pour un panneau trop mince pour cela, par ses deux grandes faces. Pour l'ouvrir ailleurs, cliquez la face à vider sur le corps."),
      this.open && this.mode === "hollow" ? this.resetOpen() : null,
      this.info(this.mode === "split" ? "Le corps est coupé tel qu'il est, sans être vidé : un cadre en ses côtés, un caisson d'un seul corps en ses panneaux, une façade à cadre en U en ses deux montants et sa traverse (sa rainure de verre leur reste)." : "Chaque côté devient un corps : 4 pour un cadre, 3 pour un triangle, autant que de côtés pour un polygone, un coin arrondi le sien. Un corps plein est vidé à l'épaisseur des côtés ; un corps déjà creux garde ses côtés tels qu'ils sont."),
    ];
  }

  /** Back to the top and the bottom. */
  private resetOpen(): HTMLElement {
    const button = el("button", { type: "button", class: "h-8 w-full border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-split-open-reset": "" }, "Ouvrir dessus et dessous");
    button.addEventListener("click", () => {
      this.open = null;
      this.render();
      this.schedulePreview();
    });
    return button;
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { bodies: [face.bodyId] } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    // The body chosen (or a side of its preview) clicked again: that face opened, with the one facing it.
    const same = face.bodyId === this.target || featureOfBody(face.bodyId) === this.id;
    if (!this.target || !same) {
      this.target = face.bodyId;
      this.open = null;
      this.render();
      this.schedulePreview();
      return;
    }
    void this.ctx.geometry.describe(face.bodyId, [], face.faceIndex).then(({ face: ref }) => {
      if (ref?.type !== "PLANE") return this.ctx.notify("Cliquez une face plane du corps : elle s'ouvre avec celle d'en face.", "info");
      this.open = ref.normal.map((c) => Number(c.toFixed(6))) as Vec3;
      this.render();
      this.schedulePreview();
    }).catch(() => this.ctx.notify("Cette face ne se lit pas : cliquez-en une autre.", "info"));
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
