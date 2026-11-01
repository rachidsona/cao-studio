/**
 * Outil « Recouvrement » (Menuiserie) : cliquer deux planches qui forment un angle — un côté et un dessus, un fond et
 * une joue — inverse laquelle passe devant le chant de l'autre (features/overlap-swap.ts) : celle qui passait est
 * raccourcie de l'épaisseur de l'autre, l'autre rallongée d'autant. Ce sont des Étirer (et un Déplacer pour un bout
 * bas) dans l'historique, en une annulation ; les usinages des planches les suivent comme pour tout étirement.
 */
import { bodyLabel } from "../document/operations";
import type { Feature, MoveFeature, StretchFeature } from "../document/types";
import type { Box } from "../features/joinery";
import { stretchOf, swapOverlap } from "../features/overlap-swap";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

export class OverlapTool extends PanelTool {
  private picked: string[];
  /** Boxes of the boards, taken when they were picked: the preview replaces the bodies in the view. */
  private readonly boxes = new Map<string, Box>();

  constructor(ctx: ToolContext, selected: string[] = []) {
    super(ctx, "Recouvrement", null);
    this.picked = selected.slice(0, 2);
    this.picked.forEach((id) => this.remember(id));
  }

  private remember(id: string): void {
    const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
    if (b) this.boxes.set(id, [[...b[0]], [...b[1]]]);
  }

  private features(): Feature[] | string {
    const [a, b] = this.picked;
    const [boxA, boxB] = [a && this.boxes.get(a), b && this.boxes.get(b)];
    if (!a || !b || !boxA || !boxB) return "Cliquez les deux planches de l'angle.";
    const changes = swapOverlap(boxA, boxB);
    if (typeof changes === "string") return changes;
    const doc = this.ctx.doc();
    const moves = changes.filter((c) => c.end === "low").length;
    const slots = freshFeatureIds(doc, "rc", "Recouvrement", changes.length + moves);
    const out: Feature[] = [];
    for (const change of changes) {
      const target = change.board === "a" ? a : b;
      const box = change.board === "a" ? boxA : boxB;
      const { position, distance, translate } = stretchOf(box, change);
      const slot = slots.shift()!;
      const stretch: StretchFeature = { id: slot.id, type: "stretch", name: slot.name, target, axis: change.axis, position, distance };
      out.push(stretch);
      if (translate) {
        const m = slots.shift()!;
        const move: MoveFeature = { id: m.id, type: "move", name: m.name, target: slot.id, translate };
        out.push(move);
      }
    }
    return out;
  }

  protected feature(): Feature | string {
    const made = this.features();
    return typeof made === "string" ? made : made[0]!;
  }

  protected override companions(): Feature[] {
    const made = this.features();
    return typeof made === "string" ? [] : made.slice(1);
  }

  protected override blocker(): string | null {
    const made = this.features();
    if (typeof made === "string") return null;
    const bad = made.map((f) => this.ctx.status(f.id)).find((s) => s && s.state !== "ok");
    return bad ? (bad.message ?? "Ce recouvrement est impossible.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const name = (i: number) => (this.picked[i] ? bodyLabel(doc, this.picked[i]!) : "—");
    const made = this.features();
    return [
      this.info(`Planche 1 : ${name(0)}`),
      this.info(`Planche 2 : ${name(1)}`),
      this.info(typeof made === "string" ? made : "Aperçu : la planche qui passait devant le chant de l'autre est raccourcie, l'autre rallongée."),
      this.info("Cliquez une planche pour la prendre ; un troisième clic recommence. Les usinages suivent les planches."),
    ];
  }

  override move(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    this.ctx.viewport.setHoverHighlight(target?.kind === "body" ? { bodies: [target.id] } : null);
  }

  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind !== "body") return;
    // A click on the preview of a board is a click on the board itself.
    const made = this.features();
    const list = typeof made === "string" ? [] : made;
    let id = target.id;
    // Back through the move and the stretch of the preview to the board.
    for (let f = list.find((x) => x.id === id); f && (f.type === "move" || f.type === "stretch"); f = list.find((x) => x.id === id)) id = f.target;
    if (this.picked.length >= 2) this.picked = [];
    if (!this.picked.includes(id)) {
      this.picked.push(id);
      this.remember(id);
    }
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
