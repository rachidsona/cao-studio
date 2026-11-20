/**
 * « Pipette de forme » (Atelier) : un clic sur un meuble, une porte, des tiroirs, un caisson ou une niche équipée prend
 * sa forme ; chaque clic suivant la donne telle quelle, cotes et apparence, à un autre élément de même sorte, qui garde
 * sa place, son orientation, son nom et son identité (document/form-copy.ts) — un meuble de cuisine prend le modèle,
 * les façades, l'intérieur et les cotes d'un autre ; un caisson ses cotes ; des façades leur disposition et leur style ;
 * une niche ses tiroirs, sa tringle ou son accessoire ; une porte de tout genre son style, son ouverture et sa poignée ;
 * un corps ses cotes, sa matière et son apparence ; une étagère ou une cloison la division de sa niche, à la niche
 * cliquée. « Reprendre » en prend une autre ; Échap ou ✕ l'arrête. Chaque clic est une annulation.
 */
import { formOf, withFormCopied, type FormSource } from "../document/form-copy";
import type { Vec3 } from "../document/types";
import { nicheUnderPointer } from "./dressing/niche-pick";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { panelHeader } from "../ui/panel-close";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

const BUTTON = "h-8 w-full border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

class FormPipetteTool implements PointerHandler {
  private readonly panel: HTMLElement;
  private readonly text = el("p", { class: "text-gray-700 dark:text-gray-200", "data-form-pipette-state": "" });
  private readonly again = el("button", { type: "button", class: BUTTON, "data-form-pipette-again": "", disabled: true, title: "Le prochain clic prend la forme d'un autre élément" }, "Reprendre une autre forme");
  /** The element whose form was taken; none yet: the next click takes one. */
  private from: FormSource | null = null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly viewport: Viewport, private readonly editor: Editor, private readonly closed: () => void) {
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Pipette de forme" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.again.addEventListener("click", () => ((this.from = null), this.say()));
    this.panel.append(
      panelHeader("Pipette de forme", () => this.close()),
      this.text,
      this.again,
      el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "Un meuble de cuisine, un caisson, des façades, une porte, des tiroirs, une penderie : chacun donne sa forme telle quelle, cotes et apparence, à un autre de même sorte, qui garde sa place et son nom. Une porte donne aussi son ouverture (de côté, relevante), sa poignée, son jeu et sa ferrure, à toute autre porte. Un corps donne ses cotes, sa matière et son apparence ; une étagère ou une cloison donne sa division à une niche vide, ou son épaisseur, sa matière et son apparence à une autre étagère (le nombre reste). Échap pour finir."),
    );
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    viewport.setPointerHandler(this);
    this.say();
  }

  private say(): void {
    this.text.textContent = this.from
      ? this.from.kind === "partition" ? `Cliquez une autre Répartition (un côté, une étagère, une niche) : elle prend l'organisation de « ${this.from.label} » — cases, côtés, étagères, cloisons, portes, ce que tient chaque case — en gardant ses cotes.`
      : this.from.kind === "division" ? `Cliquez une niche vide : elle prend la division de « ${this.from.label} » ; une autre étagère : elle prend son épaisseur, sa matière et son apparence.` : `Cliquez les éléments qui prennent la forme de « ${this.from.label} ».`
      : "Cliquez le meuble, la porte, les tiroirs, le caisson, l'étagère ou le corps dont vous prenez la forme.";
    this.again.disabled = !this.from;
  }

  down(): boolean {
    return false;
  }

  move(event: PointerEvent): void {
    const body = this.viewport.pickFace(event)?.bodyId;
    this.viewport.setHoverHighlight(body && formOf(this.editor.doc, body) ? { bodies: [body] } : null);
  }

  /** The box of a body in the view (world, mm). */
  private readonly boxOf = (id: string): [Vec3, Vec3] | null => {
    const b = this.viewport.bodyMesh(id)?.metrics.bbox;
    return b ? [[...b[0]] as Vec3, [...b[1]] as Vec3] : null;
  };

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick) return false;
    const body = this.viewport.pickFace(event)?.bodyId;
    // A division goes to the niche clicked: through its back, or its emptiness.
    const niche = this.from?.kind === "division" || this.from?.kind === "partition" ? nicheUnderPointer(this.viewport, this.editor.doc, event) : null;
    const picked = body ? formOf(this.editor.doc, body) : null;
    const form: FormSource | null = niche && picked?.kind !== "division" && picked?.kind !== "partition" ? { kind: "place", place: { sketch: niche.sketch, partition: niche.partition, path: niche.path }, label: "la niche" } : picked;
    if (!body && !form) return true;
    if (!form) {
      this.editor.notify("Cet élément n'a pas de forme à copier : cliquez un meuble, un caisson, une porte, des tiroirs ou une niche équipée.", "error");
      return true;
    }
    if (!this.from) {
      this.from = form;
      this.say();
      return true;
    }
    const notes: string[] = [];
    const next = withFormCopied(this.editor.doc, this.from, form, this.viewport.displayedBodies, this.boxOf, notes);
    if (typeof next === "string") this.editor.notify(next, "error");
    else {
      void this.editor.change(next);
      this.editor.notify(`« ${form.label} » prend la forme de « ${this.from.label} ».${notes.length ? ` Sauf : ${notes.join(" ")}` : ""}`, notes.length ? "info" : "success");
    }
    return true;
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.viewport.setHoverHighlight(null);
    this.panel.remove();
    this.viewport.setPointerHandler(null);
    this.closed();
  }
}

export function bindFormPipette(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  let tool: FormPipetteTool | null = null;
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="form-pipette"]');
  button?.addEventListener("click", () => {
    if (tool) return tool.close();
    editor.sketches.cancelJoinery();
    tool = new FormPipetteTool(viewport, editor, () => ((tool = null), button.setAttribute("aria-pressed", "false")));
    button.setAttribute("aria-pressed", "true");
  });
}
