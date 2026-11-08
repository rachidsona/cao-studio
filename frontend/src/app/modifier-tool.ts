/**
 * Outil « Modificateur » (comme 3ds Max) sur une planche : cintrer (rayon), effiler (% de la section au bout) ou
 * vriller (angle au bout), avec l'aperçu du noyau ; la planche est celle sélectionnée, ou cliquée.
 */
import { bodyLabel, uniqueId, uniqueName } from "../document/operations";
import type { ModifierFeature } from "../document/types";
import { PanelTool, type ToolContext } from "./panel-tool";

const KINDS: [ModifierFeature["kind"], string][] = [
  ["bend", "Cintrer"],
  ["taper", "Effiler"],
  ["twist", "Vriller"],
];
const DEFAULTS: Record<ModifierFeature["kind"], number> = { bend: 500, taper: 50, twist: 45, ffd: 0, points: 0, "face-scale": 0 };

export class ModifierTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private target: string | undefined;
  private kind: ModifierFeature["kind"];
  private amount: number;

  constructor(ctx: ToolContext, editing: ModifierFeature | null, bodies: string[] = []) {
    super(ctx, "Modificateur", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "md");
    this.name = editing?.name ?? uniqueName(doc, "Modificateur");
    this.target = editing?.target ?? bodies[0];
    this.kind = editing?.kind ?? "bend";
    this.amount = editing?.amount ?? DEFAULTS[this.kind];
  }

  protected feature(): ModifierFeature | string {
    if (!this.target) return "Cliquez la planche à modifier.";
    return { id: this.id, type: "modifier", name: this.name, target: this.target, kind: this.kind, amount: this.amount };
  }

  protected override blocker(): string | null {
    const status = this.ctx.status(this.id);
    return status && status.state !== "ok" ? (status.message ?? "La planche ne se modifie pas ainsi.") : null;
  }

  /** The boards to choose from, the one being modified included (the preview hides it from the model). */
  private boards(): [string, string][] {
    const list = this.ctx.bodies().filter((b) => b.id !== this.id).map((b): [string, string] => [b.id, b.name]);
    if (this.target && !list.some(([id]) => id === this.target)) list.unshift([this.target, bodyLabel(this.ctx.doc(), this.target)]);
    return list;
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face || face.bodyId === this.id) return;
    this.target = face.bodyId;
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const amount =
      this.kind === "bend"
        ? this.numberRow("Rayon", this.amount, this.ctx.unit(), (v) => ((this.amount = v), this.schedulePreview()), true)
        : this.kind === "taper"
          ? this.numberRow("Bout (%)", this.amount, "plain", (v) => ((this.amount = v), this.schedulePreview()))
          : this.numberRow("Angle", this.amount, "deg", (v) => ((this.amount = v), this.schedulePreview()), true);
    return [
      this.selectRow("Planche", this.target ?? "", this.boards(), (v) => {
        this.target = v;
        changed();
      }),
      this.selectRow("Effet", this.kind, KINDS, (v) => {
        this.kind = v as ModifierFeature["kind"];
        this.amount = DEFAULTS[this.kind];
        changed();
      }),
      amount,
      this.info(
        this.kind === "bend"
          ? "La planche s'enroule sur sa longueur (rayon au milieu de l'épaisseur ; négatif : de l'autre côté)."
          : this.kind === "taper"
            ? "La section au bout est réduite à ce pourcentage (100 % : planche droite)."
            : "La section tourne peu à peu jusqu'à cet angle au bout.",
      ),
    ];
  }
}
