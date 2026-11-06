/**
 * « Style du dressing » : un style choisi donne d'un coup leur matière à la carcasse, aux étagères et aux façades, et sa
 * poignée au projet ; on garde ses propres styles dans ce navigateur. Une annulation.
 */
import { STYLES, withStyle, type DressingStyle } from "../document/dressing-style";
import { HANDLE_MODELS } from "../document/hardware-catalog";
import { MATERIALS } from "../document/materials";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { openModal } from "./workshop-ui";

const KEY = "cao.dressing-styles";
const SELECT = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";

function readStyles(): DressingStyle[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? (kept as DressingStyle[]) : [];
  } catch {
    return [];
  }
}

function open(viewport: Viewport, editor: Editor): void {
  const swatch = (id: string) => el("span", { class: "inline-block size-4 border border-gray-300", style: `background:${MATERIALS.find((m) => m.id === id)?.color ?? "#fff"}` });
  const apply = (style: DressingStyle) => {
    void editor.change(withStyle(editor.doc, viewport.displayedBodies, style));
    editor.notify(`Style appliqué : ${style.name}.`, "success");
    close();
  };
  const row = (style: DressingStyle) => {
    const button = el("button", { type: "button", class: "flex w-full items-center gap-2 border border-gray-200 px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800" }, swatch(style.carcass), swatch(style.fronts), style.name);
    button.addEventListener("click", () => apply(style));
    return button;
  };
  const options = (selected: string) => MATERIALS.map((m) => el("option", { value: m.id, selected: m.id === selected }, m.name));
  const carcass = el("select", { class: SELECT, "aria-label": "Carcasse" }, ...options("melamine-white"));
  const fronts = el("select", { class: SELECT, "aria-label": "Façades" }, ...options("melamine-oak"));
  const handle = el("select", { class: SELECT, "aria-label": "Poignée" }, el("option", { value: "" }, "Poignée du projet"), ...HANDLE_MODELS.map((h) => el("option", { value: h.id }, h.label)));
  const name = el("input", { type: "text", class: SELECT, placeholder: "Nom du style", "aria-label": "Nom du style" });
  name.addEventListener("keydown", (event) => event.stopPropagation());
  const keep = el("button", { type: "button", class: "h-8 w-full border border-gray-300 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Garder et appliquer");
  keep.addEventListener("click", () => {
    const label = name.value.trim();
    if (!label) return editor.notify("Donnez un nom au style.", "info");
    const style: DressingStyle = { name: label, carcass: carcass.value, fronts: fronts.value, ...(handle.value ? { handle: handle.value } : {}) };
    try {
      localStorage.setItem(KEY, JSON.stringify([...readStyles().filter((s) => s.name !== label), style]));
    } catch {
      // Not kept: it is applied all the same.
    }
    apply(style);
  });
  const content = el(
    "div",
    { class: "space-y-3 text-sm", "data-style-panel": "" },
    el("p", { class: "text-xs text-gray-600 dark:text-gray-300" }, "S'applique aux pièces affichées : carcasse et étagères, puis façades. Les fonds gardent leur matière."),
    el("div", { class: "grid gap-1.5 sm:grid-cols-2" }, ...[...STYLES, ...readStyles()].map(row)),
    el("h3", { class: "text-xs font-semibold tracking-wide text-gray-500 uppercase" }, "Mon style"),
    el("div", { class: "grid gap-1.5 sm:grid-cols-2" }, carcass, fronts, handle, name),
    keep,
  );
  const close = openModal("Style du dressing", content, [{ label: "Fermer", run: () => close() }]);
}

export function bindStylePanel(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  root.querySelector('[data-workshop="dressing-style"]')?.addEventListener("click", () => open(viewport, editor));
}
