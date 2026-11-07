/**
 * « Copier une niche » et « Aligner les étagères » : un clic sur la niche modèle, puis sur les niches à faire pareil, sur
 * le même mur ou sur un autre. Une niche entre deux étagères vaut pour toute sa colonne. Tout l'aménagement, en miroir pour le mur d'en face, ou seulement les hauteurs des
 * étagères. Chaque clic est une annulation ; ce que la niche visée contenait est remplacé.
 */
import { columnOf, emptyRecipe, mirrored, readRecipe, withAlignedShelves, withRecipe } from "../document/niche-recipe";
import { findFeature } from "../document/operations";
import type { SketchFeature } from "../document/types";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { frameOf } from "../sketcher/frame";
import { leafNiches, pathKey } from "../sketcher/partition-history";
import type { NicheBox } from "../sketcher/shelves";
import { JoineryView } from "../viewport/joinery-view";
import type { PointerHandler } from "../viewport/pointer-input";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { nicheUnderPointer, type PickedNiche } from "./niche-pick";

export type CopyMode = "all" | "mirror" | "heights";

const same = (a: NicheBox, b: NicheBox) => (["x0", "y0", "x1", "y1"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

export class NicheCopyTool implements PointerHandler {
  private readonly panel: HTMLElement;
  private readonly view: JoineryView;
  private model: PickedNiche | null = null;
  private readonly text = el("p", { class: "text-gray-600 dark:text-gray-300", "data-copy-state": "" });
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(
    private readonly viewport: Viewport,
    private readonly editor: Editor,
    container: HTMLElement,
    private mode: CopyMode,
    first: PickedNiche | null,
    private readonly closed: () => void,
  ) {
    this.view = new JoineryView(viewport.scene);
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-64 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Copier une niche" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    const choice = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-1 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Ce qui est copié" }, ...([["all", "Tout l'aménagement"], ["mirror", "Tout, en miroir"], ["heights", "Hauteurs des étagères"]] as const).map(([value, label]) => el("option", { value, selected: value === mode }, label)));
    choice.addEventListener("change", () => {
      this.mode = choice.value as CopyMode;
    });
    const end = el("button", { type: "button", class: "h-8 w-full border border-gray-300 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Terminer");
    end.addEventListener("click", () => this.close());
    this.panel.append(el("h2", { class: "panel-title" }, "Copier une niche"), this.text, choice, end);
    placePanel(container, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    viewport.setPointerHandler(this);
    if (first) this.choose(first);
    else this.say();
  }

  /** The model: the whole column of the niche clicked, when it holds something. */
  private choose(niche: PickedNiche): void {
    const column = { ...niche, ...columnOf(this.editor.doc, niche) };
    if (emptyRecipe(readRecipe(this.editor.doc, column))) this.editor.notify("Cette niche est vide : prenez une niche aménagée comme modèle.", "info");
    else this.model = column;
    this.say();
  }

  private say(): void {
    this.text.textContent = this.model ? "Cliquez les niches à faire pareil. Ce qu'elles contiennent sera remplacé." : "Cliquez la niche modèle.";
  }

  down(): boolean {
    return false;
  }

  move(event: PointerEvent): void {
    const niche = nicheUnderPointer(this.viewport, this.editor.doc, event);
    this.viewport.renderer.domElement.style.cursor = niche ? "pointer" : "";
    const sketch = niche ? (findFeature(this.editor.doc, niche.sketch) as SketchFeature) : null;
    if (!sketch || !niche) return this.view.clear();
    const leaves = leafNiches(sketch);
    this.view.show(frameOf(sketch), leaves[0]?.depth || 1, leaves.map(({ box }) => ({ box, state: this.model && this.model.sketch === sketch.id && same(this.model.box, box) ? "chosen" : same(niche.box, box) ? "hover" : "free" })), []);
  }

  up(event: PointerEvent, isClick: boolean): boolean {
    if (!isClick) return false;
    const niche = nicheUnderPointer(this.viewport, this.editor.doc, event);
    if (!niche) {
      this.editor.notify("Cliquez dans une niche.", "info");
      return true;
    }
    if (!this.model) {
      this.choose(niche);
      return true;
    }
    const target = columnOf(this.editor.doc, niche);
    if (this.model.sketch === target.sketch && pathKey(this.model.path) === pathKey(target.path)) return true;
    const recipe = readRecipe(this.editor.doc, this.model);
    const made = this.mode === "heights" ? withAlignedShelves(this.editor.doc, this.model, target) : withRecipe(this.editor.doc, target, this.mode === "mirror" ? mirrored(recipe) : recipe);
    if (typeof made === "string") this.editor.notify(made, "error");
    else {
      void this.editor.change(made);
      this.editor.notify(this.mode === "heights" ? "Étagères alignées." : "Niche copiée.", "success");
    }
    return true;
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.view.dispose();
    this.panel.remove();
    this.viewport.renderer.domElement.style.cursor = "";
    this.viewport.setPointerHandler(null);
    this.closed();
  }
}

let tool: NicheCopyTool | null = null;

/** Opens the tool, on this model if one is given. */
export function openNicheCopy(viewport: Viewport, editor: Editor, mode: CopyMode, model: PickedNiche | null = null): void {
  tool?.close();
  editor.sketches.cancelJoinery();
  tool = new NicheCopyTool(viewport, editor, viewport.renderer.domElement.parentElement as HTMLElement, mode, model, () => (tool = null));
}

export function bindNicheCopy(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="niche-copy"]')?.addEventListener("click", () => openNicheCopy(viewport, editor, "all"));
  root.querySelector('[data-workshop="niche-align"]')?.addEventListener("click", () => openNicheCopy(viewport, editor, "heights"));
}
