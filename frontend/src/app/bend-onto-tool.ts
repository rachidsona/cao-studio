/**
 * Outil « Cintrer contre » : on clique un panneau droit, puis la face ronde d'un autre corps (un fût, un angle
 * arrondi, l'intérieur d'un anneau) — le panneau s'y enroule, à son épaisseur, de sa longueur (features/bend-onto.ts).
 * C'est une étape « Modificateur » (cintrer, sur la face) ; son étape de l'historique rouvre cet outil.
 */
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import type { FaceRef, ModifierFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

export const isBendOnto = (f: { type: string; kind?: string; onto?: unknown }): boolean => f.type === "modifier" && f.kind === "bend" && !!f.onto;

export class BendOntoTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | null;
  private onto: { body: string; face: FaceRef } | null;

  constructor(ctx: ToolContext, editing: ModifierFeature | null, bodies: readonly string[] = []) {
    super(ctx, "Cintrer contre", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "md");
    this.name = editing?.name ?? uniqueName(doc, "Cintrage");
    this.target = editing?.target ?? bodies[0] ?? null;
    this.onto = editing?.onto ?? null;
  }

  protected feature(): ModifierFeature | string {
    if (!this.target) return "Cliquez le panneau droit à cintrer.";
    if (!this.onto) return "Cliquez la face ronde du corps contre lequel il se courbe.";
    return { id: this.id, type: "modifier", name: this.name, target: this.target, kind: "bend", amount: 0, onto: this.onto };
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    return [
      this.info(this.target ? `Panneau : « ${bodyLabel(doc, this.target)} ».` : "1. Cliquez le panneau droit à cintrer (posé à plat contre le corps rond)."),
      this.info(this.onto ? `Contre : « ${bodyLabel(doc, this.onto.body)} ». Cliquez une autre face ronde pour changer.` : "2. Cliquez la face ronde du corps : le panneau s'y enroule."),
      this.info("Il garde son épaisseur et sa hauteur ; sa longueur devient l'arc, centré là où il était. Contre l'extérieur d'un fût il s'enroule dehors, contre l'intérieur d'un anneau dedans."),
    ];
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? (this.target ? { face } : { bodies: [face.bodyId] }) : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    // The board first; then the round face of another body.
    if (!this.target || (!this.onto && face.bodyId === this.target)) {
      this.target = face.bodyId;
      this.render();
      return;
    }
    if (face.bodyId === this.target || face.bodyId.split("#")[0] === this.id) return this.ctx.notify("Cliquez la face ronde d'un autre corps.", "info");
    void this.ctx.geometry.describe(face.bodyId, [], face.faceIndex).then(({ face: ref }) => {
      if (!ref || ref.type !== "CYLINDRE") return this.ctx.notify("Cette face n'est pas ronde : cliquez la face cylindrique du corps (le tour d'un fût, un angle arrondi).", "info");
      this.onto = { body: face.bodyId, face: ref };
      this.render();
      this.schedulePreview();
    }).catch(() => this.ctx.notify("Cette face ne se lit pas : cliquez-en une autre.", "info"));
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
