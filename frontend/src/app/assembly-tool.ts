/**
 * Outil « Règles d'assemblage » : une règle (confirmat, tourillons ou excentriques Minifix, entraxe, marge ; celle du
 * standard de construction du projet pour commencer) appliquée d'un coup à toutes
 * les jonctions des planches choisies (la sélection, sinon toutes les planches visibles). Un clic sur une planche
 * l'ajoute ou la retire. Une opération « Usinage » par planche, dans une seule annulation ; la visserie va au devis.
 */
import { bodyInfo } from "../document/materials";
import { bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type CadDocument, type Feature, type MachiningFeature } from "../document/types";
import type { Viewport } from "../viewport/viewport";
import { ASSEMBLY_RULE, applyRule, type AssemblyRule, type Board } from "../features/assembly-rules";
import { findStandard } from "../document/standards";
import { workshopStandards } from "./standards-panel";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

/** A body is taken as a board when it fills most of its box (a few holes are fine). */
const BOARD_FILL = 0.9;

/** The boards of the carcasses among `ids`: plain boxes, not walls, fronts or the equipment of niches. */
export function carcassBoards(viewport: Viewport, doc: CadDocument, ids: readonly string[]): Board[] {
  return ids.flatMap((id): Board[] => {
    const m = viewport.bodyMesh(id)?.metrics;
    // Walls of the room, doors and drawers (hinged or on slides) and the equipment of niches (rods, inner drawers)
    // are not assembled to the carcass.
    if (!m || bodyInfo(doc, id).room || ["fronts", "niche"].includes(findFeature(doc, featureOfBody(bodyOrigin(doc, id)))?.type ?? "")) return [];
    const [lo, hi] = m.bbox;
    const boxVolume = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
    return boxVolume > 0 && m.volume / boxVolume >= BOARD_FILL ? [{ id, box: [[...lo], [...hi]] }] : [];
  });
}

export class AssemblyTool extends PanelTool {
  private readonly rule: AssemblyRule = { ...ASSEMBLY_RULE };
  private chosen: Set<string>;
  /** Boxes of the boards when the tool opened: the preview replaces the bodies in the view. */
  private readonly boards: Board[];

  constructor(ctx: ToolContext, selected: string[] = []) {
    super(ctx, "Règles d'assemblage", null);
    const doc = ctx.doc();
    // The project's standard says how its carcasses are assembled.
    const standard = findStandard(doc, doc.standard, workshopStandards());
    if (standard) Object.assign(this.rule, { joint: standard.joint, spacing: standard.jointSpacing });
    this.boards = carcassBoards(ctx.viewport, doc, ctx.bodies().map((b) => b.id));
    const known = new Set(this.boards.map((b) => b.id));
    const picked = selected.filter((id) => known.has(id));
    this.chosen = new Set(picked.length >= 2 ? picked : known);
  }

  private result() {
    return applyRule(this.boards.filter((b) => this.chosen.has(b.id)), this.rule);
  }

  private features(): MachiningFeature[] {
    const { ops } = this.result();
    const name = { confirmat: "Confirmat", dowel: "Tourillons", minifix: "Minifix" }[this.rule.joint];
    const slots = freshFeatureIds(this.ctx.doc(), "mc", name, ops.size);
    return [...ops].map(([target, list], i) => ({
      id: slots[i]!.id,
      type: "machining",
      name: slots[i]!.name,
      target,
      kind: this.rule.joint,
      ops: list,
      anchor: [...this.boards.find((b) => b.id === target)!.box[0]],
      anchorHigh: [...this.boards.find((b) => b.id === target)!.box[1]],
    }));
  }

  protected feature(): Feature | string {
    return this.features()[0] ?? "Aucune jonction entre ces planches (le chant de l'une contre la face de l'autre).";
  }

  protected override companions(): Feature[] {
    return this.features().slice(1);
  }

  protected override blocker(): string | null {
    const bad = this.features().map((f) => this.ctx.status(f.id)).find((s) => s && s.state !== "ok");
    return bad ? (bad.message ?? "Cet assemblage est impossible.") : null;
  }

  private changed(): void {
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const { junctions, fasteners } = this.result();
    const what = { confirmat: "vis confirmat", dowel: "tourillons", minifix: "excentriques" }[this.rule.joint];
    return [
      this.selectRow("Assemblage", this.rule.joint, [["confirmat", "Confirmat (vis Ø7)"], ["dowel", "Tourillons Ø8"], ["minifix", "Excentriques Minifix 15"]], (v) => {
        this.rule.joint = v as AssemblyRule["joint"];
        this.rule.spacing = v === "confirmat" ? 128 : v === "minifix" ? 256 : 96;
        this.changed();
      }),
      this.numberRow("Entraxe", this.rule.spacing, unit, (v) => ((this.rule.spacing = Math.max(16, v)), this.changed())),
      this.numberRow("Marge bouts", this.rule.margin, unit, (v) => ((this.rule.margin = Math.max(0, v)), this.changed())),
      this.numberRow("Ignorer sous", this.rule.minThickness, unit, (v) => ((this.rule.minThickness = Math.max(0, v)), this.changed())),
      this.info(`${this.chosen.size} planche(s) · ${junctions} jonction(s) · ${fasteners} ${what}.`),
      this.info("Cliquez une planche pour l'ajouter ou la retirer. Les panneaux plus minces que le seuil (fonds) sont ignorés."),
    ];
  }

  override move(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    this.ctx.viewport.setHoverHighlight(target?.kind === "body" ? { bodies: [target.id] } : null);
  }

  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind !== "body") return;
    // A click on the preview of a machined board is a click on the board itself.
    const id = this.features().find((f) => f.id === target.id)?.target ?? target.id;
    if (!this.boards.some((b) => b.id === id)) return this.ctx.notify("Ce corps n'est pas une planche (une boîte droite).", "error");
    if (this.chosen.has(id)) this.chosen.delete(id);
    else this.chosen.add(id);
    this.changed();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
