/**
 * « Échanger » (groupe Modifier, comme le Composwapper de JHS PowerBar) : Alt + clic choisit l'élément source (ou
 * l'élément sélectionné en ouvrant l'outil) ; chaque clic ensuite remplace l'élément cliqué par une copie liée de la
 * source, calée à sa place (document/swap.ts), et Ctrl (⌘) + clic remplace d'un coup tous les éléments pareils — tous
 * les caissons de ce modèle, toutes les copies d'une pièce. Maj + clic rend un élément. L'élément sous le pointeur
 * s'éclaire avant le clic. Une chaise par une autre, un caisson par un autre modèle, une poignée par une autre, d'un
 * coup ; une seule annulation.
 */
import { bodyLabel, findFeature } from "../document/operations";
import { elementKey, elementsOf, sameModel, swapFeatures, type Anchor, type Box, type Element } from "../document/swap";
import type { CadDocument, Feature, Vec3 } from "../document/types";
import { freshFeatureIds } from "./curic-common";
import { PanelTool, type ToolContext } from "./panel-tool";

const ANCHORS: [Anchor, string][] = [
  ["floor", "Centré, sur le même sol"],
  ["center", "Centre sur centre"],
  ["corner", "Coin sur coin (bas, avant, gauche)"],
];

export class SwapTool extends PanelTool {
  private targets: Element[] = [];
  private replacement: Element | null = null;
  private anchor: Anchor = "floor";
  private keep = false;
  private slots: { id: string; name: string }[] = [];

  constructor(ctx: ToolContext, bodies: string[]) {
    super(ctx, "Échanger", null);
    const chosen = elementsOf(ctx.doc(), bodies, (id) => this.boxOf(id));
    // One element selected: it is the source; several: they are the elements to replace (the source by Alt + click).
    if (chosen.length === 1) this.replacement = chosen[0]!;
    else this.targets = chosen;
  }

  private boxOf(id: string): Box | null {
    const b = this.ctx.viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  }

  /** The displayed elements (the copies made by the tool left out). */
  private shown(): Element[] {
    const ours = (id: string) => this.slots.some((s) => s.id === id || id.startsWith(`${s.id}#`));
    return elementsOf(this.ctx.doc(), this.ctx.viewport.displayedBodies.filter((id) => !ours(id)), (id) => this.boxOf(id));
  }

  /** Every body shown of the element of `bodyId`. */
  private element(bodyId: string): Element | null {
    const key = elementKey(this.ctx.doc(), bodyId);
    return this.shown().find((e) => e.key === key) ?? null;
  }

  private name(e: Element): string {
    const f = findFeature(this.ctx.doc(), e.key);
    return f?.name ?? bodyLabel(this.ctx.doc(), e.bodies[0] ?? "");
  }

  private plan() {
    if (!this.replacement) return null;
    const doc = this.ctx.doc();
    if (this.slots.length < this.targets.length) this.slots = freshFeatureIds(doc, "ar", "Échange", this.targets.length);
    return swapFeatures(doc, this.targets, this.replacement, this.anchor, this.slots);
  }

  protected feature(): Feature | string {
    if (!this.replacement) return "Alt + clic sur l'élément source (celui qui remplace).";
    if (!this.targets.length) return "Cliquez un élément à remplacer (Ctrl ou ⌘ + clic : tous les pareils).";
    return this.plan()?.features[0] ?? "La source est le seul élément à remplacer.";
  }

  protected override companions(): Feature[] {
    return this.plan()?.features.slice(1) ?? [];
  }

  /** The elements replaced leave the model (unless kept). */
  protected override decorate(doc: CadDocument): CadDocument {
    const removed = this.keep ? [] : (this.plan()?.removed ?? []);
    return removed.length ? { ...doc, removedBodies: [...new Set([...(doc.removedBodies ?? []), ...removed])] } : doc;
  }

  /** The element under the pointer lights up: the one a click would take. */
  override move(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    const element = face ? this.element(face.bodyId) : null;
    this.ctx.viewport.setHoverHighlight(element ? { bodies: element.bodies } : null);
  }

  /**
   * Alt + click: the source. Click: replace that element; Ctrl (⌘) + click: every element like it; Maj + click: give
   * an element back. A copy made by the tool is not taken.
   */
  protected override click(event: PointerEvent): void {
    const face = this.ctx.viewport.pickFace(event);
    // Maj + click on a copy made by the tool: that element is given back.
    const slot = face ? this.slots.findIndex((s) => s.id === face.bodyId || face.bodyId.startsWith(`${s.id}#`)) : -1;
    if (slot >= 0 && event.shiftKey) {
      this.targets = this.targets.filter((_, i) => i !== slot);
      this.slots = [];
      this.render();
      return this.schedulePreview();
    }
    const element = face ? this.element(face.bodyId) : null;
    if (!element) return;
    const has = (e: Element) => this.targets.some((t) => t.key === e.key);
    if (event.altKey || !this.replacement) {
      this.replacement = element;
      this.targets = this.targets.filter((t) => t.key !== element.key);
    } else if (event.shiftKey) this.targets = has(element) ? this.targets.filter((t) => t.key !== element.key) : [...this.targets, element];
    else if (event.ctrlKey || event.metaKey) {
      const doc = this.ctx.doc();
      const like = this.shown().filter((e) => e.key !== this.replacement!.key && !has(e) && sameModel(doc, e, element));
      this.targets = [...this.targets, ...like];
    } else if (element.key !== this.replacement.key && !has(element)) this.targets = [...this.targets, element];
    this.slots = [];
    this.ctx.viewport.setHoverHighlight(null);
    this.render();
    this.schedulePreview();
  }

  protected override dispose(): void {
    this.ctx.viewport.setHoverHighlight(null);
  }

  protected rows(): (HTMLElement | null)[] {
    const changed = () => {
      this.render();
      this.schedulePreview();
    };
    const made = this.feature();
    return [
      this.info(this.replacement ? `Source : « ${this.name(this.replacement)} » (Alt + clic pour en prendre une autre).` : "Alt + clic sur l'élément source."),
      this.info(this.targets.length ? `Remplacés (${this.targets.length}) : ${this.targets.map((t) => this.name(t)).join(", ")}.` : "Clic : remplacer cet élément · Ctrl (⌘) + clic : tous les pareils · Maj + clic : le rendre."),
      this.selectRow("Calage", this.anchor, ANCHORS, (v) => ((this.anchor = v as Anchor), changed())),
      this.checkRow("Garder les originaux", this.keep, (v) => ((this.keep = v), changed())),
      this.info("Chaque remplaçant est une copie liée de la source : il la suit quand elle change."),
      typeof made === "string" ? this.info(made) : null,
    ];
  }
}
