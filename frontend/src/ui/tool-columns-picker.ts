/**
 * La liste des outils qu'ouvre le « + » d'une colonne de la barre à sept colonnes (ui/tool-columns.ts) : tous les
 * outils du ruban et de la colonne Sélection et vue, rangés par groupe, avec une recherche. Un clic ajoute l'outil à
 * la colonne, ou l'en retire s'il y est déjà (coché) ; la liste reste ouverte pour en choisir plusieurs. Échap, un clic
 * dehors ou « Fermer » la referment.
 */
import { el } from "./dom";

export interface Tool {
  key: string;
  label: string;
  group: string;
  button: HTMLElement;
}

export interface PickerOptions {
  /** The column, counted from 1, in the title. */
  column: number;
  tools: readonly Tool[];
  chosen: (key: string) => boolean;
  toggle: (key: string) => void;
}

let closeOpen: (() => void) | null = null;

/** The tool's icon, copied from its button. */
export function iconOf(button: HTMLElement): Node | null {
  const icon = button.querySelector("svg")?.cloneNode(true) as SVGElement | undefined;
  icon?.setAttribute("aria-hidden", "true");
  return icon ?? null;
}

const normalized = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function openPicker(anchor: HTMLElement, options: PickerOptions): void {
  closeOpen?.();
  const input = el("input", { type: "search", placeholder: "Rechercher un outil…", "aria-label": "Rechercher un outil", class: "h-9 w-full border border-gray-300 bg-transparent px-2 text-sm outline-none dark:border-gray-600" });
  const list = el("div", { class: "mt-1 min-h-0 flex-1 overflow-y-auto" });
  const close = el("button", { type: "button", class: "ribbon-menu-reset" }, "Fermer");
  const panel = el(
    "div",
    { class: "ribbon-menu flex w-72 flex-col", role: "dialog", "aria-label": `Outils de la colonne ${options.column}`, "data-tool-picker": String(options.column - 1) },
    el("p", { class: "panel-title px-1 pb-1" }, `Colonne ${options.column} : choisir les outils`),
    input,
    list,
    el("div", { class: "ribbon-menu-footer" }, el("span", { class: "ribbon-menu-hint" }, "Clic : ajouter ou retirer"), close),
  );

  const draw = () => {
    const wanted = normalized(input.value.trim());
    const shown = options.tools.filter((t) => !wanted || normalized(`${t.label} ${t.group}`).includes(wanted));
    const groups = [...new Set(shown.map((t) => t.group))];
    list.replaceChildren(
      ...groups.flatMap((group) => [
        el("p", { class: "px-1.5 pt-2 pb-0.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400" }, group),
        ...shown
          .filter((t) => t.group === group)
          .map((tool) => {
            const on = options.chosen(tool.key);
            const row = el(
              "button",
              { type: "button", class: "ribbon-menu-run w-full hover:bg-gray-50 dark:hover:bg-gray-800", role: "menuitemcheckbox", "aria-checked": String(on), "data-tool-pick": tool.key, title: tool.button.title || tool.label },
              iconOf(tool.button),
              el("span", { class: "min-w-0 flex-1 truncate" }, tool.label),
              el("span", { class: "w-4 shrink-0 text-sky-700 dark:text-sky-300", "aria-hidden": "true" }, on ? "✓" : ""),
            );
            row.addEventListener("click", () => {
              options.toggle(tool.key);
              draw();
            });
            return row;
          }),
      ]),
      ...(shown.length ? [] : [el("p", { class: "px-1.5 py-2 text-gray-500" }, "Aucun outil de ce nom.")]),
    );
  };

  const outside = (event: PointerEvent) => {
    if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) dismiss();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    dismiss();
  };
  const dismiss = () => {
    panel.remove();
    anchor.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", key, true);
    if (closeOpen === dismiss) closeOpen = null;
    anchor.focus();
  };
  closeOpen = dismiss;
  close.addEventListener("click", dismiss);
  input.addEventListener("input", draw);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", key, true);

  draw();
  document.body.append(panel);
  // Beside the column, kept inside the window.
  const box = anchor.getBoundingClientRect();
  const height = Math.min(window.innerHeight * 0.7, 480);
  panel.style.left = `${Math.min(box.right + 4, window.innerWidth - panel.offsetWidth - 8)}px`;
  panel.style.top = `${Math.max(8, Math.min(box.top, window.innerHeight - height - 8))}px`;
  panel.style.height = `${height}px`;
  anchor.setAttribute("aria-expanded", "true");
  input.focus();
}
