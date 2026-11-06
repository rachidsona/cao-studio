/**
 * « Façades communes » : un clic sur une case, un clic sur une autre, et une seule porte les couvre ; recliquer ces mêmes
 * cases rend leurs portes. Le sens d'ouverture se règle pour toute la Répartition : par paires en miroir, ou d'un côté.
 */
import { casesJoined, withCasesJoined, withDoorSwing, type DoorSwing } from "../document/door-fronts";
import { findFeature } from "../document/operations";
import type { SketchFeature } from "../document/types";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

class DoorFrontsTool implements PointerHandler {
  private readonly panel: HTMLElement;
  private first: PickedNiche | null = null;
  private last: PickedNiche | null = null;
  private readonly text = el("p", { class: "text-gray-600 dark:text-gray-300", "data-fronts-state": "" });
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(private readonly viewport: Viewport, private readonly editor: Editor, private readonly closed: () => void) {
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Façades communes" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    const swing = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Sens d'ouverture" }, ...([["pairs", "Par paires, en miroir"], ["left", "Toutes charnières à gauche"], ["right", "Toutes charnières à droite"]] as const).map(([value, label]) => el("option", { value }, label)));
    swing.addEventListener("change", () => {
      if (!this.last) return this.editor.notify("Cliquez d'abord une case de la Répartition.", "info");
      void this.editor.change(withDoorSwing(this.editor.doc, this.last.sketch, this.last.partition, swing.value as DoorSwing));
    });
    const end = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    end.addEventListener("click", () => this.close());
    this.panel.append(el("h2", { class: "text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400" }, "Façades communes"), this.text, el("label", { class: "block space-y-1" }, "Sens d'ouverture", swing), end);
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    viewport.setPointerHandler(this);
    this.say();
  }

  private say(): void {
    this.text.textContent = this.first ? `Case ${(this.first.path[0] as number) + 1} choisie : cliquez la dernière case de la façade.` : "Cliquez la première case de la façade, puis la dernière.";
  }

  down(): boolean {
    return false;
  }

  move(): void {}

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick) return false;
    const niche = nicheUnderPointer(this.viewport, this.editor.doc, event);
    if (!niche) {
      this.editor.notify("Cliquez dans une case de la Répartition.", "info");
      return true;
    }
    this.last = niche;
    const first = this.first;
    if ((findFeature(this.editor.doc, niche.sketch) as SketchFeature).clip) {
      this.editor.notify("Un angle coupé a sa propre porte : cochez-la dans le Plan de dressing.", "info");
      return true;
    }
    if (!first || first.sketch !== niche.sketch || first.partition !== niche.partition) {
      this.first = niche;
      this.say();
      return true;
    }
    this.first = null;
    this.say();
    const [a, b] = [first.path[0] as number, niche.path[0] as number];
    if (a === b) return true;
    const undo = casesJoined(this.editor.doc, niche.sketch, niche.partition, a, b);
    void this.editor.change(withCasesJoined(this.editor.doc, niche.sketch, niche.partition, a, b));
    this.editor.notify(undo ? "Portes séparées." : `Une seule porte sur ${Math.abs(a - b) + 1} cases.`, "success");
    return true;
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.panel.remove();
    this.viewport.setPointerHandler(null);
    this.closed();
  }
}

export function bindDoorFronts(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  let tool: DoorFrontsTool | null = null;
  root.querySelector('[data-workshop="door-fronts"]')?.addEventListener("click", () => {
    tool?.close();
    editor.sketches.cancelJoinery();
    tool = new DoorFrontsTool(viewport, editor, () => (tool = null));
  });
}
