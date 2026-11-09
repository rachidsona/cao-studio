/**
 * Outil « Copier l'aménagement » (le copier-coller d'intérieur de Polyboard) : un clic sur un caisson modèle, puis sur
 * les caissons à aménager pareil — ils prennent son nombre d'étagères et ses façades (une porte, deux portes ou des
 * tiroirs, leur pose, leur jeu, leur épaisseur, charnières et poignées), qui s'adaptent à leurs propres cotes. En une
 * annulation ; chaque caisson garde ses dimensions et sa place.
 */
import { bodyInfo } from "../../document/materials";
import { bodyOrigin, uniqueId, uniqueName } from "../../document/operations";
import { PART_SEPARATOR, featureOfBody, type CabinetFeature, type CadDocument, type Feature, type FrontsFeature } from "../../document/types";
import { frontsMaterials } from "../../features/fronts-parts";
import { PanelTool, type ToolContext } from "../panel-tool";

export class LayoutCopyTool extends PanelTool {
  private source: string | null = null;
  private readonly targets = new Set<string>();

  constructor(ctx: ToolContext, selected: string[] = []) {
    super(ctx, "Copier l'aménagement", null);
    const cabinets = [...new Set(selected.map((id) => this.cabinetOf(id)).filter((c): c is string => !!c))];
    this.source = cabinets[0] ?? null;
    for (const c of cabinets.slice(1)) this.targets.add(c);
  }

  /** The cabinet a body belongs to: one of its parts, or one of its fronts. */
  private cabinetOf(bodyId: string): string | null {
    const doc = this.ctx.doc();
    const f = doc.features.find((x) => x.id === featureOfBody(bodyOrigin(doc, bodyId)));
    return f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : null;
  }

  private cabinet(id: string | null): CabinetFeature | undefined {
    return this.ctx.doc().features.find((f): f is CabinetFeature => f.id === id && f.type === "cabinet");
  }

  private frontsOf(doc: CadDocument, cabinet: string): FrontsFeature | undefined {
    return doc.features.find((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === cabinet && !f.suppressed);
  }

  private features(): Feature[] | string {
    const source = this.cabinet(this.source);
    if (!source) return "Cliquez le caisson modèle.";
    if (!this.targets.size) return "Cliquez les caissons à aménager pareil.";
    let doc = this.ctx.doc();
    const model = this.frontsOf(doc, source.id);
    const out: Feature[] = [];
    for (const id of this.targets) {
      const target = this.cabinet(id);
      if (!target) continue;
      if (target.shelves !== source.shelves) out.push({ ...target, shelves: source.shelves });
      if (!model) continue;
      const own = this.frontsOf(doc, id);
      const { id: _i, name: _n, cabinet: _c, expressions: _e, ...settings } = model;
      const fronts: FrontsFeature = own ? { ...own, ...settings, id: own.id, name: own.name, cabinet: id } : { ...settings, id: uniqueId(doc, "fr"), name: uniqueName(doc, "Façades"), cabinet: id };
      out.push(fronts);
      // Reserve the new id before the next cabinet's.
      doc = { ...doc, features: [...doc.features, fronts] };
    }
    return out.length ? out : "Ces caissons ont déjà le même aménagement.";
  }

  protected feature(): Feature | string {
    const made = this.features();
    return typeof made === "string" ? made : made[0]!;
  }

  protected override companions(): Feature[] {
    const made = this.features();
    return typeof made === "string" ? [] : made.slice(1);
  }

  /** New fronts get the material of the model's fronts. */
  protected override decorate(doc: CadDocument): CadDocument {
    const source = this.cabinet(this.source);
    const model = source && this.frontsOf(doc, source.id);
    const info = { ...doc.bodyInfo };
    for (const f of doc.features) {
      if (f.type !== "fronts" || !this.targets.has(f.cabinet)) continue;
      const cabinet = doc.features.find((c): c is CabinetFeature => c.id === f.cabinet && c.type === "cabinet");
      if (!cabinet) continue;
      const materials = frontsMaterials(f, cabinet, bodyInfo(doc, `${cabinet.id}${PART_SEPARATOR}0`).material);
      materials.forEach((material, i) => {
        const id = `${f.id}${PART_SEPARATOR}${i}`;
        const from = model ? bodyInfo(doc, `${model.id}${PART_SEPARATOR}${i}`).material : undefined;
        if (!info[id]?.material && (from ?? material)) info[id] = { ...info[id], material: from ?? material };
      });
    }
    return { ...doc, bodyInfo: info };
  }

  protected override blocker(): string | null {
    const made = this.features();
    if (typeof made === "string") return null;
    const bad = made.map((f) => this.ctx.status(f.id)).find((s) => s && s.state !== "ok");
    return bad ? (bad.message ?? "Cet aménagement ne tient pas dans un des caissons.") : null;
  }

  protected rows(): (HTMLElement | null)[] {
    const source = this.cabinet(this.source);
    const names = [...this.targets].map((id) => this.cabinet(id)?.name ?? id);
    return [
      this.info(`Modèle : ${source ? source.name : "cliquez un caisson"}`),
      this.info(`À aménager : ${names.length ? names.join(", ") : "cliquez un ou plusieurs caissons"}`),
      this.info("Les étagères et les façades du modèle s'adaptent aux cotes de chaque caisson. Un clic sur un caisson déjà pris le retire ; sur le modèle, recommence."),
    ];
  }

  override move(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    this.ctx.viewport.setHoverHighlight(target?.kind === "body" ? { bodies: [target.id] } : null);
  }

  protected override click(event: PointerEvent): void {
    const target = this.ctx.viewport.hoverTargetForTool(event);
    if (target?.kind !== "body") return;
    const cabinet = this.cabinetOf(target.id);
    if (!cabinet) return this.ctx.notify("Ce corps n'appartient pas à un caisson (Menuiserie › Caisson).", "error");
    if (!this.source || cabinet === this.source) {
      this.source = cabinet;
      this.targets.clear();
    } else if (this.targets.has(cabinet)) this.targets.delete(cabinet);
    else this.targets.add(cabinet);
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }
}
