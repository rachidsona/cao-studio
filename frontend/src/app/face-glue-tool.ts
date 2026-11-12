/**
 * « Coller par face » : on sélectionne une face de l'élément à déplacer (ou on la clique, l'outil ouvert), puis on clique
 * une face d'un autre élément, et le premier vient s'y coller, d'un coup. Des faces opposées se mettent en contact (le
 * côté d'un caisson contre le côté du voisin), des faces de même sens affleurent (deux façades, deux dessus) ; seul le
 * déplacement nécessaire est fait, le long de la face d'arrivée (features/face-glue.ts). Un caisson bouge avec ses
 * façades, une pièce seule si on le veut (ou si les deux faces sont du même caisson) — comme « Point sur point »
 * (document/spacing.ts). Un jeu les écarte, ou les met en retrait. Une seule annulation.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { movesNeeded, spacingFeatures, type Moving } from "../document/spacing";
import { elementKey } from "../document/swap";
import type { Feature, Vec3 } from "../document/types";
import { glueShift } from "../features/face-glue";
import { el } from "../ui/dom";
import type { FacePick } from "../viewport/viewport";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

/** A planar face clicked: its body, a point of its plane, its outward normal. */
interface Picked {
  bodyId: string;
  point: Vec3;
  normal: Vec3;
}

/** Kept for the session: whether the whole cabinet moves, and the gap. */
let lastWhole = true;
let lastGap = 0;

export class FaceGlueTool extends PanelTool {
  private moving: Picked | null = null;
  private movingPick: FacePick | null = null;
  private fixed: Picked | null = null;
  private whole = lastWhole;
  private gap = lastGap;
  private slots: { id: string; name: string }[] = [];

  constructor(ctx: ToolContext, faces: readonly FacePick[]) {
    super(ctx, "Coller par face", null);
    if (faces[0]) void this.pick(faces[0]);
  }

  /** The face that moves first; then the face it goes on, and it is glued at once. */
  private async pick(pick: FacePick): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane.", "info");
      const face: Picked = { bodyId: pick.bodyId, point: [...outline.center] as Vec3, normal: [...outline.normal] as Vec3 };
      if (!this.moving || pick.bodyId === this.moving.bodyId) {
        this.moving = face;
        this.movingPick = pick;
        this.slots = [];
        // The face that moves stays marked in orange; the one it goes on, in blue.
        this.ctx.viewport.setChosen([{ face: pick, role: "first" }]);
        return this.render();
      }
      this.fixed = face;
      this.ctx.viewport.setChosen([{ face: this.movingPick ?? pick, role: "first" }, { face: pick, role: "second" }]);
      const made = this.made();
      if (typeof made === "string") {
        this.ctx.notify(made, "error");
        this.fixed = null;
        this.ctx.viewport.setChosen(this.movingPick ? [{ face: this.movingPick, role: "first" }] : []);
        return this.render();
      }
      const glue = glueShift(this.moving, face, this.gap);
      const how = typeof glue !== "string" && glue.meet === "flush" ? "à fleur de" : "contre";
      this.ctx.notify(`« ${this.movingName()} » collé ${how} « ${bodyLabel(this.ctx.doc(), face.bodyId)} ».`, "success");
      this.finish();
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** What moves, by name: the cabinet (or the element), or the piece alone. */
  private movingName(): string {
    const doc = this.ctx.doc();
    if (!this.moving) return "";
    return (this.movesWhole() ? findFeature(doc, elementKey(doc, this.moving.bodyId))?.name : undefined) ?? bodyLabel(doc, this.moving.bodyId);
  }

  /** The whole element moves, unless asked otherwise or both faces are of one element (a shelf against its side). */
  private movesWhole(): boolean {
    const doc = this.ctx.doc();
    return this.whole && !!this.moving && !(this.fixed && elementKey(doc, this.fixed.bodyId) === elementKey(doc, this.moving.bodyId));
  }

  /** The cabinet moved in place, or the moves of the bodies; or what is still missing. */
  private made(): Feature[] | string {
    if (!this.moving) return "1. Cliquez la face de l'élément à déplacer (ou sélectionnez-la avant d'ouvrir l'outil).";
    if (!this.fixed) return "2. Cliquez la face où la coller, sur un autre élément.";
    const glue = glueShift(this.moving, this.fixed, this.gap);
    if (typeof glue === "string") return glue;
    const doc = this.ctx.doc();
    const whole = this.movesWhole();
    const key = whole ? elementKey(doc, this.moving.bodyId) : this.moving.bodyId;
    const bodies = whole ? this.ctx.viewport.displayedBodies.filter((id) => elementKey(doc, id) === key) : [this.moving.bodyId];
    const moving: Moving[] = [{ key, bodies, whole, shift: glue.shift }];
    const needed = movesNeeded(doc, moving);
    if (this.slots.length < needed) this.slots = freshFeatureIds(doc, "mv", "Déplacement", needed);
    const made = spacingFeatures(doc, moving, this.slots);
    return made.length ? made : "Ces deux faces se touchent déjà.";
  }

  protected feature(): Feature | string {
    const made = this.made();
    return typeof made === "string" ? made : made[0]!;
  }

  protected override companions(): Feature[] {
    const made = this.made();
    return typeof made === "string" ? [] : made.slice(1);
  }

  protected rows(): (HTMLElement | null)[] {
    const restart = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Recommencer");
    restart.addEventListener("click", () => {
      this.moving = this.fixed = null;
      this.ctx.viewport.setChosen([]);
      this.render();
    });
    const doc = this.ctx.doc();
    return [
      this.info(this.moving ? `Face qui bouge : « ${bodyLabel(doc, this.moving.bodyId)} ». 2. Cliquez la face où la coller, sur un autre élément : il s'y colle aussitôt.` : "1. Cliquez la face de l'élément à déplacer."),
      this.selectRow("Ce qui bouge", this.whole ? "whole" : "piece", [["whole", "Le meuble entier (caisson et façades)"], ["piece", "La pièce seule"]], (v) => {
        this.whole = lastWhole = v === "whole";
        this.render();
      }),
      this.numberRow("Jeu", this.gap, this.ctx.unit(), (v) => {
        this.gap = lastGap = Math.max(0, v);
        this.render();
      }),
      this.info("Faces opposées : elles se touchent. Faces de même sens : elles affleurent. Seule la distance entre les deux faces change."),
      this.moving ? restart : null,
    ];
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { face } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (face) void this.pick(face);
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
