/**
 * « Assistant meuble » : un meuble entier en quelques choix — meuble TV, bibliothèque, bureau, banc d'entrée ou tête
 * de lit —, à la largeur, la hauteur et la profondeur voulues, dans la matière voulue (document/furniture-models.ts).
 * OK le pose à droite de ce qui est déjà là, son dos sur le plan Y = 0 ; l'assistant reste ouvert pour en poser un
 * autre, « Terminer » le ferme. Ses caissons sont des Répartitions : étagères, tiroirs, portes et modules s'y
 * retouchent ensuite comme dans un dressing.
 */
import { withFurniture } from "../document/furniture-build";
import { FURNITURE, furnitureModel, furnitureProblem, type FurnitureAsk, type FurnitureKind } from "../document/furniture-models";
import { bodyInfo, MATERIALS } from "../document/materials";
import type { Vec3 } from "../document/types";
import { formatLength, fromDisplay, parseNumber, toDisplay, trim, UNIT_LABELS } from "../measurements/units";
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { panelFooter, panelHeader } from "../ui/panel-close";
import type { Viewport } from "../viewport/viewport";
import { FIELD, ROW } from "./dressing/module-options";
import type { Editor } from "./editor";

/** Room left between the furniture already there and the new one (mm). */
const SPACING = 300;

/** Kept for the session: the last furniture asked for, and its material. */
let last: FurnitureAsk = { kind: "tv", ...furnitureModel("tv").size, thickness: 18, option: furnitureModel("tv").options[0]![0] };
let lastMaterial = "melamine-white";

class FurnitureTool {
  private readonly panel: HTMLElement;
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || (event.target as HTMLElement | null)?.closest("input, select")) return;
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(
    private readonly viewport: Viewport,
    private readonly editor: Editor,
    private readonly closed: () => void,
  ) {
    this.panel = el("div", { class: "absolute top-2 right-2 z-30 w-72 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Assistant meuble" });
    this.panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(viewport.renderer.domElement.parentElement as HTMLElement, this.panel);
    window.addEventListener("keydown", this.onKey, true);
    this.draw();
  }

  /** Where the new furniture goes: its front left corner, right of every body but the room's, its back at Y = 0. */
  private place(): Vec3 {
    const doc = this.editor.doc;
    const right = this.viewport.displayedBodies
      .filter((id) => !bodyInfo(doc, id).room)
      .map((id) => this.viewport.bodyMesh(id)?.metrics.bbox[1][0])
      .filter((x): x is number => x !== undefined && Number.isFinite(x));
    const x = right.length ? Math.ceil((Math.max(...right) + SPACING) / 10) * 10 : 0;
    const depth = last.kind === "headboard" ? (last.option === "with" ? last.thickness + last.depth : 150) : last.depth;
    return [x, -depth, 0];
  }

  private draw(): void {
    const unit = this.editor.unit;
    const model = furnitureModel(last.kind);
    const number = (label: string, mm: number, set: (mm: number) => void): HTMLElement => {
      const input = el("input", { type: "text", inputmode: "decimal", class: `${FIELD} text-right font-mono`, value: trim(toDisplay(mm, unit), 4), "aria-label": label });
      const apply = () => {
        const parsed = parseNumber(input.value);
        const ok = parsed !== null && parsed > 0;
        input.setAttribute("aria-invalid", String(!ok));
        if (!ok) return;
        set(fromDisplay(parsed, unit));
        this.draw();
      };
      input.addEventListener("change", apply);
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") apply();
      });
      return el("label", { class: ROW }, `${label} (${UNIT_LABELS[unit]})`, input);
    };
    const select = (label: string, value: string, options: readonly (readonly [string, string])[], set: (v: string) => void): HTMLElement => {
      const list = el("select", { class: FIELD, "aria-label": label }, ...options.map(([v, text]) => el("option", { value: v, selected: v === value }, text)));
      list.addEventListener("change", () => {
        set(list.value);
        this.draw();
      });
      return el("label", { class: ROW }, label, list);
    };
    const problem = furnitureProblem(last);
    const range = (key: "width" | "height" | "depth") => model.limits[key].map((v) => formatLength(v, unit)).join(" à ");
    const rows: (HTMLElement | null)[] = [
      panelHeader("Assistant meuble", () => this.close()),
      select("Meuble", last.kind, FURNITURE.map((m): [string, string] => [m.kind, m.label]), (v) => {
        const m = furnitureModel(v as FurnitureKind);
        // Another furniture starts at its usual size.
        last = { kind: m.kind, ...m.size, thickness: last.thickness, option: m.options[0]![0] };
      }),
      el("p", { class: "text-gray-600 dark:text-gray-300", "data-furniture-what": "" }, model.what),
      number("Largeur", last.width, (v) => (last = { ...last, width: v })),
      number("Hauteur", last.height, (v) => (last = { ...last, height: v })),
      number(last.kind === "headboard" ? "Profondeur des chevets" : "Profondeur", last.depth, (v) => (last = { ...last, depth: v })),
      el("p", { class: "text-[11px] text-gray-500" }, `Largeur de ${range("width")}, hauteur de ${range("height")}, profondeur de ${range("depth")}.`),
      select(model.choice, last.option, model.options, (v) => (last = { ...last, option: v })),
      number("Épaisseur des panneaux", last.thickness, (v) => (last = { ...last, thickness: v })),
      select("Matière", lastMaterial, MATERIALS.filter((m) => m.kind === "panel").map((m): [string, string] => [m.id, m.name]), (v) => (lastMaterial = v)),
      problem ? el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100" }, problem) : null,
      el("p", { class: "text-[11px] text-gray-500" }, "Ses caissons sont des Répartitions : étagères, tiroirs, portes et modules s'y retouchent ensuite (clic droit dans une niche)."),
      panelFooter(() => this.close(), () => this.confirm(), problem !== null),
    ];
    this.panel.replaceChildren(...rows.filter((r): r is HTMLElement => r !== null));
  }

  /** OK: the furniture added (one undo step), the view on it; the assistant stays for another. */
  private confirm(): void {
    const made = withFurniture(this.editor.doc, last, this.place(), lastMaterial);
    if (typeof made === "string") return this.editor.notify(made, "error");
    void this.editor.change(made.doc).then(() => this.viewport.fit());
    this.editor.notify(`« ${made.name} » posé : clic droit dans une de ses niches pour l'aménager.`, "success");
  }

  close(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.panel.remove();
    this.closed();
  }
}

let tool: FurnitureTool | null = null;

export function openFurnitureTool(viewport: Viewport, editor: Editor): void {
  tool?.close();
  tool = new FurnitureTool(viewport, editor, () => (tool = null));
}

export function bindFurnitureTool(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="furniture"]')?.addEventListener("click", () => openFurnitureTool(viewport, editor));
}
