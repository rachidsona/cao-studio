/**
 * « Prolonger élément » : on sélectionne (ou on clique, l'outil ouvert) la face d'un caisson, d'une pièce d'une
 * Répartition ou de toute autre pièce (une plinthe, un fileur, un plan de travail), du côté à prolonger, puis la face
 * d'un autre élément, parallèle : l'élément s'allonge jusqu'à elle, ou se raccourcit, d'un coup
 * (document/extend-element.ts). Un caisson change de largeur, de profondeur ou de hauteur avec ses façades ; une
 * Répartition de longueur ou de hauteur avec ses cases ; une autre pièce a sa face tirée. Un meuble du Plan de cuisine
 * le fait suivre. Une seule annulation.
 */
import { bodyLabel } from "../document/operations";
import { extendable, extendElement, type ExtendFace } from "../document/extend-element";
import type { FaceRef, Feature, Vec3 } from "../document/types";
import { formatLength } from "../measurements/units";
import { el } from "../ui/dom";
import type { FacePick } from "../viewport/viewport";
import { PanelTool, type ToolContext } from "./panel-tool";

interface Picked extends ExtendFace {
  bodyId: string;
  /** The face as the kernel describes it: what is pulled on a piece that is no cabinet nor Répartition. */
  ref?: FaceRef;
}

const FIRST = "1. Cliquez la face à prolonger : d'un caisson, d'une Répartition ou d'une pièce (plinthe, fileur, plan de travail…).";

export class ExtendTool extends PanelTool {
  private moving: Picked | null = null;

  constructor(ctx: ToolContext, faces: readonly FacePick[]) {
    super(ctx, "Prolonger élément", null);
    if (faces[0]) void this.pick(faces[0]);
  }

  /** The face to extend first (of a cabinet or a Répartition); then the face to reach, and it is done at once. */
  private async pick(pick: FacePick): Promise<void> {
    try {
      const outline = await this.ctx.geometry.faceOutline(pick.bodyId, pick.faceIndex);
      if (outline.surface !== "PLANE") return this.ctx.notify("Choisissez une face plane.", "info");
      const face: Picked = { bodyId: pick.bodyId, point: [...outline.center] as Vec3, normal: [...outline.normal] as Vec3 };
      const doc = this.ctx.doc();
      const own = this.moving ? extendable(doc, this.moving.bodyId) : null;
      const other = extendable(doc, pick.bodyId);
      // The same element clicked again (its cabinet, its Répartition, or the piece itself): another face of it to extend.
      if (!this.moving || (own?.id ?? this.moving.bodyId) === (other?.id ?? pick.bodyId)) {
        // A piece on its own: its face is pulled, as the kernel describes it.
        if (!other) face.ref = (await this.ctx.geometry.describe(pick.bodyId, [], pick.faceIndex)).face ?? undefined;
        this.moving = face;
        return this.render();
      }
      const made = extendElement(doc, this.moving.bodyId, this.moving, face, this.moving.ref);
      if (typeof made === "string") return this.ctx.notify(made, "error");
      const verb = made.by > 0 ? "prolongé" : "raccourci";
      this.ctx.notify(`« ${own?.name ?? bodyLabel(doc, this.moving.bodyId)} » ${verb} de ${formatLength(Math.abs(made.by), this.ctx.unit())} jusqu'à « ${bodyLabel(doc, face.bodyId)} ».`, "success");
      const id = own?.id ?? made.id ?? this.moving.bodyId;
      this.close();
      this.ctx.commit(made.doc, id);
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  /** Nothing to preview: the second click does it. */
  protected feature(): Feature | string {
    return this.moving ? "2. Cliquez la face d'arrivée, sur un autre élément." : FIRST;
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const own = this.moving ? extendable(doc, this.moving.bodyId) : null;
    const restart = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Recommencer");
    restart.addEventListener("click", () => ((this.moving = null), this.render()));
    return [
      this.info(this.moving ? `À prolonger : « ${own?.name ?? bodyLabel(doc, this.moving.bodyId)} », par la face cliquée. 2. Cliquez la face où l'amener, sur un autre élément : il s'y allonge aussitôt.` : FIRST),
      this.info("Un caisson s'allonge en largeur, profondeur ou hauteur, avec ses façades ; une Répartition en longueur ou en hauteur, avec ses cases ; une autre pièce (plinthe, fileur, plan de travail, planche) par la face cliquée. Les deux faces doivent être parallèles."),
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
