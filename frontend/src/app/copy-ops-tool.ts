/**
 * Outil « Copier les opérations » : on clique le corps dont on veut les opérations (une découpe, un perçage, des côtés
 * séparés…), on coche celles à recopier, puis on clique un ou plusieurs corps : elles y sont refaites à la même place
 * par rapport à chacun, tournées au besoin pour que leurs côtés se répondent (« Autre orientation » en propose une
 * autre). Chaque opération recopiée est une étape à elle (document/copy-operations.ts).
 */
import { comesFrom, operationsOf, placing, turnsBetween, withOperationsCopied, type BodyOperations, type Box, type Turn } from "../document/copy-operations";
import { bodyLabel } from "../document/operations";
import { featureOfBody, type CadDocument, type Feature, type Vec3 } from "../document/types";
import { el } from "../ui/dom";
import { PanelTool, type ToolContext } from "./panel-tool";

interface Target {
  id: string;
  box: Box;
  turns: Turn[];
}

export class CopyOpsTool extends PanelTool {
  private source: { id: string; box: Box; ops: BodyOperations } | null = null;
  private chosen = new Set<string>();
  private targets: Target[] = [];
  /** Which of the fitting orientations each target takes (they go round together). */
  private orientation = 0;
  private made: { key: string; doc: CadDocument; features: Feature[]; notes: string[]; owner: Map<string, string> } | null = null;

  constructor(ctx: ToolContext, bodies: readonly string[] = []) {
    super(ctx, "Copier les opérations", null);
    if (bodies[0]) this.pickSource(bodies[0]);
  }

  /** The box of these bodies, as shown. */
  private boxOf(ids: readonly string[]): Box | null {
    const boxes = ids.map((id) => this.ctx.viewport.bodyMesh(id)?.metrics.bbox).filter((b): b is [Vec3, Vec3] => !!b);
    if (!boxes.length) return null;
    return [[0, 1, 2].map((i) => Math.min(...boxes.map((b) => b[0][i]!))) as Vec3, [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b[1][i]!))) as Vec3];
  }

  private pickSource(bodyId: string): void {
    const doc = this.ctx.doc();
    const ops = operationsOf(doc, bodyId);
    if (!ops.ops.length) {
      this.ctx.notify("Ce corps n'a pas d'opération à recopier : cliquez un corps découpé, percé, séparé…", "info");
      return;
    }
    // The box of what the operations made of it: every body shown that comes from it.
    const box = this.boxOf(this.ctx.bodies().map((b) => b.id).filter((id) => comesFrom(doc, id, ops.base)));
    if (!box) return;
    this.source = { id: bodyId, box, ops };
    this.chosen = new Set(ops.ops.filter((o) => o.chain && o.copyable).map((o) => o.id));
    this.targets = [];
  }

  private toggleTarget(bodyId: string): void {
    if (!this.source) return;
    if (comesFrom(this.ctx.doc(), bodyId, this.source.ops.base)) {
      this.ctx.notify("C'est le corps d'origine : cliquez un autre corps.", "info");
      return;
    }
    const at = this.targets.findIndex((t) => t.id === bodyId);
    if (at >= 0) {
      this.targets.splice(at, 1);
      return;
    }
    const box = this.boxOf([bodyId]);
    if (box) this.targets.push({ id: bodyId, box, turns: turnsBetween(this.source.box, box) });
  }

  /** The copies on every target, worked out once for these settings. */
  private copies(): { features: Feature[]; notes: string[]; owner: Map<string, string> } {
    const key = JSON.stringify([this.source?.id, [...this.chosen], this.targets.map((t) => t.id), this.orientation]);
    const before = this.docBefore();
    if (this.made?.key === key && this.made.doc === before) return this.made;
    let doc = before;
    const owner = new Map<string, string>();
    const features: Feature[] = [];
    const notes = new Set<string>();
    if (this.source) {
      const chosen = this.source.ops.ops.filter((o) => this.chosen.has(o.id)).map((o) => o.id);
      for (const t of this.targets) {
        const turn = t.turns[this.orientation % t.turns.length]!;
        const turned = turn.some((row, i) => row[i] !== 1);
        const r = withOperationsCopied(doc, this.source.ops.base, chosen, t.id, placing(this.source.box, t.box, turn), turned);
        doc = r.doc;
        features.push(...r.made);
        r.made.forEach((f) => owner.set(f.id, t.id));
        r.notes.forEach((n) => notes.add(n));
      }
    }
    this.made = { key, doc: before, features, notes: [...notes], owner };
    return this.made;
  }

  protected feature(): Feature | string {
    if (!this.source) return "Cliquez le corps dont vous voulez recopier les opérations.";
    if (!this.chosen.size) return "Cochez au moins une opération à recopier.";
    if (!this.targets.length) return "Cliquez le corps (ou les corps) où les refaire.";
    const { features, notes } = this.copies();
    return features[0] ?? (notes.join(" ") || "Rien à recopier sur ces corps.");
  }

  protected override companions(): Feature[] {
    return this.copies().features.slice(1);
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    this.ctx.viewport.setChosen([...(this.source ? [{ body: this.source.id, role: "first" as const }] : []), ...this.targets.map((t) => ({ body: t.id, role: "second" as const }))]);
    if (!this.source) return [this.info("Cliquez le corps dont vous voulez recopier les opérations (découpe, perçage, côtés séparés, congé, usinage…).")];
    const source = this.source;
    const several = this.targets.some((t) => t.turns.length > 1);
    const again = el("button", { type: "button", class: "h-7 w-full border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-copy-ops-turn": "" }, "Autre orientation ↻");
    again.addEventListener("click", () => {
      this.orientation++;
      this.render();
      this.schedulePreview();
    });
    const other = el("button", { type: "button", class: "h-7 w-full border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Changer de corps d'origine");
    other.addEventListener("click", () => {
      this.source = null;
      this.targets = [];
      this.render();
      this.schedulePreview();
    });
    const notes = this.targets.length ? this.copies().notes : [];
    return [
      this.info(`Corps d'origine : « ${bodyLabel(doc, source.id)} ».`),
      el("p", { class: "font-medium" }, "Opérations à recopier"),
      ...source.ops.ops.map((o) => {
        const row = this.checkRow(o.copyable ? o.name : `${o.name} (ne se recopie pas)`, this.chosen.has(o.id), (on) => {
          if (on) this.chosen.add(o.id);
          else this.chosen.delete(o.id);
          this.render();
          this.schedulePreview();
        });
        row.dataset.copyOp = o.id;
        if (!o.copyable) row.querySelector("input")!.disabled = true;
        return row;
      }),
      this.info(this.targets.length ? `Sur : ${this.targets.map((t) => `« ${bodyLabel(doc, t.id)} »`).join(", ")}. Recliquez un corps pour le retirer.` : "Cliquez le corps (ou les corps) où les refaire."),
      several ? again : null,
      ...notes.map((n) => el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, n)),
      other,
    ];
  }

  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { bodies: [face.bodyId] } : null);
  }

  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    if (!face) return;
    if (!this.source) this.pickSource(face.bodyId);
    // A copy shown on a target stands for that target.
    else this.toggleTarget(this.made?.owner.get(featureOfBody(face.bodyId)) ?? face.bodyId);
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
