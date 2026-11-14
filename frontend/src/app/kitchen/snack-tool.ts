/**
 * « Snack et comptoir » (groupe Cuisine) : un plan pour s'asseoir, qui déborde d'un plan de travail — au dos d'un îlot
 * ou au bout d'un plan —, à sa hauteur ou relevé en bar, porté par des consoles (features/snack-parts.ts). Une
 * opération « Finitions » marquée snack (elle se rouvre ici), dans la matière du plan de travail ; le panneau dit
 * combien de tabourets tiennent et à quelle hauteur d'assise. Les consoles vont au devis.
 */
import { bodyInfo, setBodyInfo } from "../../document/materials";
import { uniqueId, uniqueName } from "../../document/operations";
import { worktops } from "../../document/tech-plan";
import type { CadDocument, Feature, TrimFeature } from "../../document/types";
import { SNACK_DEFAULTS, snackParts, type SnackSettings } from "../../features/snack-parts";
import { PanelTool, type ToolContext } from "../panel-tool";

const SIDES: [SnackSettings["side"], string][] = [
  ["back", "Au dos (côté opposé aux façades)"],
  ["start", "Au bout, au début du plan"],
  ["end", "Au bout, à la fin du plan"],
];
const HEIGHTS: [SnackSettings["height"], string][] = [
  ["counter", "Comptoir (à la hauteur du plan)"],
  ["bar", "Bar (105 cm, sur une rehausse)"],
];

export class SnackTool extends PanelTool {
  private readonly id: string;
  private readonly name: string;
  private s: SnackSettings;
  private notes: string[] = [];
  private problems: string[] = [];

  constructor(ctx: ToolContext, editing: TrimFeature | null) {
    super(ctx, "Snack et comptoir", editing);
    const doc = ctx.doc();
    this.id = editing?.id ?? uniqueId(doc, "sn");
    this.name = editing?.name ?? uniqueName(doc, "Snack");
    // The island's worktop when there is one, else the last.
    const tops = worktops(doc);
    this.s = editing?.snack ? { ...editing.snack } : { ...SNACK_DEFAULTS, worktop: (tops.find((t) => /îlot|^Plan de travail I\d*$/.test(t.name)) ?? tops.at(-1))?.id ?? "" };
  }

  /** The worktop's front: where its cut-outs say its fronts are, else its low side. */
  private frontOf(doc: CadDocument, id: string): -1 | 1 {
    const cut = doc.features.find((f) => f.type === "machining" && f.kind === "cutout" && f.target === id);
    return cut?.type === "machining" && cut.frontSign === 1 ? 1 : -1;
  }

  protected feature(): Feature | string {
    const doc = this.ctx.doc();
    const top = worktops(doc).find((t) => t.id === this.s.worktop);
    if (!top) return "Choisissez un plan de travail (posez la cuisine d'abord).";
    const { parts, notes, problems } = snackParts(top.box, this.frontOf(doc, top.id), this.s, top.box[1][2] - top.box[0][2]);
    [this.notes, this.problems] = [notes, problems];
    if (!parts.length) return problems[0] ?? "Rien à poser.";
    return { id: this.id, type: "trim", name: this.name, parts, snack: { ...this.s } } satisfies TrimFeature;
  }

  /** The boards of the worktop's material; the consoles are bought. */
  protected override decorate(doc: CadDocument): CadDocument {
    const material = bodyInfo(doc, this.s.worktop).material;
    const f = doc.features.find((x) => x.id === this.id);
    if (!material || f?.type !== "trim") return doc;
    const boards = f.parts.flatMap((p, i) => (p.hardware ? [] : [`${this.id}#${i}`])).filter((id) => !bodyInfo(doc, id).material);
    return boards.length ? setBodyInfo(doc, boards, { material }) : doc;
  }

  private set(change: Partial<SnackSettings>): void {
    Object.assign(this.s, change);
    this.render();
    this.schedulePreview();
  }

  protected rows(): (HTMLElement | null)[] {
    const unit = this.ctx.unit();
    const tops = worktops(this.ctx.doc());
    this.feature();
    return [
      tops.length ? this.selectRow("Plan de travail", this.s.worktop, tops.map((t): [string, string] => [t.id, t.name]), (v) => this.set({ worktop: v })) : this.info("Aucun plan de travail : posez la cuisine d'abord."),
      this.selectRow("Où", this.s.side, SIDES, (v) => this.set({ side: v as SnackSettings["side"] })),
      this.selectRow("Hauteur", this.s.height, HEIGHTS, (v) => this.set({ height: v as SnackSettings["height"] })),
      this.numberRow("Débord", this.s.overhang, unit, (v) => this.set({ overhang: v })),
      this.numberRow(this.s.side === "back" ? "Longueur (0 : tout le plan)" : "Largeur (0 : la profondeur du plan)", this.s.length, unit, (v) => v >= 0 && this.set({ length: v }), true),
      ...this.notes.map((n) => this.info(n)),
      ...this.problems.map((p) => this.info(`⚠ ${p}`)),
    ];
  }

  open(): void {
    this.start();
    this.schedulePreview();
  }
}
