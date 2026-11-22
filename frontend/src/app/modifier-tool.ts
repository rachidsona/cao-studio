/**
 * Outil « Modificateur » (comme 3ds Max) sur une planche : cintrer (rayon), effiler (% de la section au bout) ou
 * vriller (angle au bout), avec l'aperçu du noyau ; la planche est celle sélectionnée, ou cliquée. Plusieurs planches
 * cliquées l'un après l'autre (ou sélectionnées avant) sont modifiées de même, une étape chacune, en une seule
 * annulation ; Maj + clic retire une planche choisie.
 */
import { bodyLabel, findFeature, uniqueId, uniqueName } from "../document/operations";
import type { ModifierFeature } from "../document/types";
import { chooseBody, freshFeatureIds, removing } from "./curic-common";
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
  /** The boards to modify, the first one this step's own, the others each a step made with it. */
  private targets: string[];
  private kind: ModifierFeature["kind"];
  private amount: number;

  constructor(ctx: ToolContext, editing: ModifierFeature | null, bodies: string[] = []) {
    super(ctx, "Modificateur", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "md");
    this.name = editing?.name ?? uniqueName(doc, "Modificateur");
    this.targets = editing ? [editing.target] : [...new Set(bodies)];
    this.kind = editing?.kind ?? "bend";
    this.amount = editing?.amount ?? DEFAULTS[this.kind];
  }

  private made(id: string, name: string, target: string): ModifierFeature {
    return { id, type: "modifier", name, target, kind: this.kind, amount: this.amount };
  }

  protected feature(): ModifierFeature | string {
    if (!this.targets[0]) return "Cliquez la planche à modifier.";
    return this.made(this.id, this.name, this.targets[0]);
  }

  /** The steps of the other boards chosen, ids after this one's. */
  private others(): { id: string; name: string }[] {
    const doc = this.docBefore();
    return freshFeatureIds({ ...doc, features: [...doc.features, this.made(this.id, this.name, this.targets[0] ?? "")] }, "md", "Modificateur", Math.max(0, this.targets.length - 1));
  }

  protected override companions(): ModifierFeature[] {
    return this.others().map((n, i) => this.made(n.id, n.name, this.targets[i + 1]!));
  }

  protected override blocker(): string | null {
    for (const id of [this.id, ...this.others().map((n) => n.id)]) {
      const status = this.ctx.status(id);
      if (status && status.state !== "ok") return status.message ?? "La planche ne se modifie pas ainsi.";
    }
    return null;
  }

  /** The boards to choose from, the one being modified included (the preview hides it from the model). */
  private boards(): [string, string][] {
    const target = this.targets[0];
    const list = this.ctx.bodies().filter((b) => b.id !== this.id).map((b): [string, string] => [b.id, b.name]);
    if (target && !list.some(([id]) => id === target)) list.unshift([target, bodyLabel(this.ctx.doc(), target)]);
    return list;
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    this.targets = chooseBody(this.targets, face.bodyId, [this.id, ...this.others().map((n) => n.id)], removing(event), !!this.editing);
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
    const doc = this.ctx.doc();
    const names = this.targets.map((t) => `« ${findFeature(doc, t)?.name ?? bodyLabel(doc, t)} »`);
    return [
      this.targets.length > 1
        ? this.info(`${names.length} planches : ${names.join(", ")}. Cliquez-en d'autres pour les ajouter ; Maj + clic sur une planche choisie la retire.`)
        : this.selectRow("Planche", this.targets[0] ?? "", this.boards(), (v) => {
            this.targets = [v];
            changed();
          }),
      this.editing || this.targets.length > 1 ? null : this.info("Cliquez d'autres planches l'une après l'autre : OK les modifie toutes, en une seule annulation."),
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
