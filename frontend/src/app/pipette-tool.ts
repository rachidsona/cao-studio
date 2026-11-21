/**
 * « Pipette » (Atelier), outil à part : un clic sur un corps de la vue prend son apparence telle qu'on la voit — celle
 * de sa matière comprise, sa couleur, la transparence d'un verre ou d'un plexiglas, ses faces peintes —, chaque clic
 * suivant la donne à un autre corps (appearance/assign.ts withLookCopied) — avec Ctrl (⌘ sur Mac), à tout le caisson
 * du corps cliqué : les panneaux de sa Répartition ou de son caisson, pas ses portes, tiroirs ni verres. « Reprendre » en prend une autre ; Échap ou
 * ✕ l'arrête. La matière des corps (débit, devis) ne change pas. Chaque clic est une annulation.
 */
import { withLookCopied } from "../appearance/assign";
import { bodyLabel, bodyOrigin, findFeature } from "../document/operations";
import { featureOfBody, type CadDocument } from "../document/types";
import { wholeOwner } from "./move-whole";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { panelHeader } from "../ui/panel-close";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";

/** The panels of the caisson a body belongs to (a Répartition's, a cabinet's), shown in the view; the body alone else. */
export function caissonOf(doc: CadDocument, body: string, displayed: readonly string[]): string[] {
  const owner = wholeOwner(doc, body);
  if (!owner) return [body];
  const panels = displayed.filter((b) => {
    const f = findFeature(doc, featureOfBody(bodyOrigin(doc, b)));
    return owner.kind === "cabinet" ? f?.type === "cabinet" && f.id === owner.id : f?.type === "extrude" && f.sketch === owner.id;
  });
  return panels.length ? panels : [body];
}

const BUTTON = "h-8 w-full border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

class PipetteTool implements PointerHandler {
  private readonly panel: HTMLElement;
  private readonly text = el("p", { class: "text-gray-700 dark:text-gray-200", "data-pipette-state": "" });
  private readonly again = el("button", { type: "button", class: BUTTON, "data-pipette-again": "", disabled: true, title: "Le prochain clic prend l'apparence d'un autre corps" }, "Reprendre une autre apparence");
  /** The body whose look was taken; none yet: the next click takes one. */
  private from: string | null = null;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly viewport: Viewport, private readonly editor: Editor, private readonly closed: () => void) {
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Pipette" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.again.addEventListener("click", () => ((this.from = null), this.say()));
    this.panel.append(panelHeader("Pipette", () => this.close()), this.text, this.again, el("p", { class: "text-2xs text-gray-500 dark:text-gray-400" }, "L'apparence seule : la matière des corps, leur débit et le devis ne changent pas. Échap pour finir."));
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    viewport.setPointerHandler(this);
    this.say();
  }

  private say(): void {
    this.text.textContent = this.from ? `Cliquez les corps qui prennent l'apparence de « ${bodyLabel(this.editor.doc, this.from)} » — Ctrl + clic : tout leur caisson.` : "Cliquez le corps dont vous prenez l'apparence.";
    this.again.disabled = !this.from;
  }

  down(): boolean {
    return false;
  }

  /** The bodies a click gives the look to: the one clicked, or with Ctrl (⌘) all of its caisson. */
  private targets(body: string, event: PointerEvent): string[] {
    return event.ctrlKey || event.metaKey ? caissonOf(this.editor.doc, body, this.viewport.displayedBodies) : [body];
  }

  move(event: PointerEvent): void {
    const body = this.viewport.pickFace(event)?.bodyId;
    this.viewport.setHoverHighlight(body ? { bodies: this.from ? this.targets(body, event) : [body] } : null);
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick) return false;
    const body = this.viewport.pickFace(event)?.bodyId;
    if (!body) return true;
    if (!this.from || this.from === body) {
      this.from = body;
      this.say();
    } else {
      void this.editor.change(withLookCopied(this.editor.doc, this.from, this.targets(body, event).filter((b) => b !== this.from)));
      // The view shows the appearances (« Rendu des matières » on), as Apparence does.
      const render = document.querySelector<HTMLButtonElement>('[data-workshop="render"]');
      if (render?.getAttribute("aria-pressed") === "false") render.click();
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

export function bindPipette(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  let tool: PipetteTool | null = null;
  const button = root.querySelector<HTMLButtonElement>('[data-workshop="pipette"]');
  button?.addEventListener("click", () => {
    if (tool) return tool.close();
    editor.sketches.cancelJoinery();
    tool = new PipetteTool(viewport, editor, () => ((tool = null), button.setAttribute("aria-pressed", "false")));
    button.setAttribute("aria-pressed", "true");
  });
}
