/**
 * « Assemblage » : relier deux pièces face contre face, pour que l'une suive l'autre. On clique une face de la pièce
 * qui bouge, puis une face de la pièce fixe : des faces opposées se mettent en contact (avec un jeu si l'on veut), des
 * faces de même sens affleurent (ou en retrait) ; une liaison par axe, X, Y et Z, jusqu'à trois. Le résultat est un
 * alignement (AlignFeature, avec ses écarts) calculé sur les pièces elles-mêmes : quand la pièce fixe change (un
 * caisson élargi, une cote d'esquisse), l'autre suit. Il se rouvre dans Aligner.
 */
import { bodyLabel } from "../document/operations";
import type { AlignFeature, AlignMode, Axis, Feature } from "../document/types";
import type { Box, BoxFace } from "../features/joinery";
import { el } from "../ui/dom";
import { freshFeatureIds } from "./curic-common";
import { faceAt } from "./machining-tool";
import { PanelTool, type ToolContext } from "./panel-tool";

const AXES = ["X", "Y", "Z"];
const KINDS: [AlignMode, string][] = [
  ["after", "Contact, côté +"],
  ["before", "Contact, côté −"],
  ["max", "Affleurant, côté +"],
  ["min", "Affleurant, côté −"],
  ["center", "Centré"],
];
const REMOVE = "size-8 shrink-0 border border-gray-300 hover:bg-red-50 hover:text-red-700 dark:border-gray-600 dark:hover:bg-red-950";

interface Mate {
  axis: Axis;
  mode: AlignMode;
  gap: number;
}

/** The link two faces make along their axis (they must be parallel): contact for opposite faces, flush for alike. */
export function mateOf(moving: BoxFace, fixed: BoxFace): AlignMode | null {
  if (moving.axis !== fixed.axis) return null;
  if (moving.sign === -fixed.sign) return fixed.sign > 0 ? "after" : "before";
  return fixed.sign > 0 ? "max" : "min";
}

export class MateTool extends PanelTool {
  private moving: string | null;
  private fixed: string | null;
  private mates: Mate[] = [];
  /** The face of the moving part clicked, waiting for the face of the fixed one. */
  private pending: BoxFace | null = null;
  private slot: { id: string; name: string } | null = null;

  constructor(ctx: ToolContext, selected: string[] = []) {
    super(ctx, "Assemblage", null);
    this.moving = selected[0] ?? null;
    this.fixed = selected[1] ?? null;
  }

  protected feature(): Feature | string {
    if (!this.moving) return "Cliquez une face de la pièce qui bouge.";
    if (!this.fixed || !this.mates.length) return this.pending ? "Cliquez maintenant la face de la pièce fixe." : "Cliquez une face de la pièce qui bouge, puis une face de la pièce fixe.";
    this.slot ??= freshFeatureIds(this.ctx.doc(), "al", "Assemblage", 1)[0]!;
    const modes: AlignFeature["modes"] = ["none", "none", "none"];
    const gaps: [number, number, number] = [0, 0, 0];
    for (const m of this.mates) {
      modes[m.axis] = m.mode;
      gaps[m.axis] = m.gap;
    }
    return { ...this.slot, type: "align", target: this.moving, reference: this.fixed, modes, ...(gaps.some((g) => g !== 0) ? { gaps } : {}) };
  }

  protected override blocker(): string | null {
    const built = this.feature();
    const status = typeof built === "string" ? undefined : this.ctx.status(built.id);
    return status && status.state !== "ok" ? (status.message ?? "Cet assemblage est impossible.") : null;
  }

  private changed(): void {
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const doc = this.ctx.doc();
    const name = (id: string | null) => (id ? bodyLabel(doc, id) : "—");
    const list = [...this.mates]
      .sort((a, b) => a.axis - b.axis)
      .flatMap((m) => {
        const remove = el("button", { type: "button", class: REMOVE, title: "Retirer", "aria-label": `Retirer la liaison en ${AXES[m.axis]}` }, "✕");
        remove.addEventListener("click", () => ((this.mates = this.mates.filter((x) => x !== m)), this.changed()));
        const kind = this.selectRow(`En ${AXES[m.axis]}`, m.mode, KINDS, (v) => ((m.mode = v as AlignMode), this.changed()));
        return [
          el("div", { class: "flex items-center gap-1.5 border-t border-gray-200 pt-2 dark:border-gray-700" }, el("div", { class: "min-w-0 flex-1" }, kind), remove),
          this.numberRow(m.mode === "after" || m.mode === "before" ? "Jeu" : m.mode === "center" ? "Décalage" : "Retrait", m.gap, this.ctx.unit(), (v) => ((m.gap = v), this.changed()), true),
        ];
      });
    return [
      this.info(`Bouge : ${name(this.moving)}${this.pending ? ` (face ${this.pending.sign > 0 ? "+" : "−"}${AXES[this.pending.axis]})` : ""}`),
      this.info(`Fixe : ${name(this.fixed)}`),
      ...list,
      this.info("Une face de la pièce qui bouge, puis une face de la pièce fixe : opposées, elles se touchent ; de même sens, elles affleurent. Une liaison par axe ; la pièce suit ensuite la pièce fixe quand elle change."),
    ];
  }

  // Faces of bodies only: a sketch under a board (the one it is extruded from) does not take the click.
  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    this.ctx.viewport.setHoverHighlight(face ? { face } : null);
  }

  protected override click(event: PointerEvent): void {
    const picked = this.ctx.viewport.pickFace(event);
    if (!picked) return;
    // The preview of the moved part stands for the part itself.
    const id = this.slot && picked.bodyId === this.slot.id && this.moving ? this.moving : picked.bodyId;
    const b = this.ctx.viewport.bodyMesh(picked.bodyId)?.metrics.bbox;
    const face = b ? faceAt([[...b[0]], [...b[1]]] as Box, [picked.point.x, picked.point.y, picked.point.z]) : null;
    if (!face) return this.ctx.notify("Cliquez une face plane qui borde la pièce, parallèle aux axes (la face d'une planche).", "error");
    if (!this.pending) {
      // A new moving part starts a new assembly.
      if (id !== this.moving) {
        if (id === this.fixed) this.fixed = null;
        this.moving = id;
        this.mates = [];
      }
      this.pending = face;
    } else {
      if (id === this.moving) {
        this.pending = face;
        return this.changed();
      }
      const mode = mateOf(this.pending, face);
      if (!mode) {
        this.ctx.notify("Ces deux faces ne sont pas parallèles : choisissez des faces qui se regardent ou qui affleurent.", "error");
        return;
      }
      this.fixed = id;
      const axis = face.axis;
      this.mates = [...this.mates.filter((m) => m.axis !== axis), { axis, mode, gap: 0 }];
      this.pending = null;
    }
    this.changed();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
