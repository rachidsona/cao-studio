/**
 * « Remplacer partout » de l'Atelier (le « Modify Style » de Polyboard) : une matière par une autre, ou une épaisseur
 * de chant par une autre, dans tout le projet d'un coup (document/replace.ts), en une annulation.
 */
import { EDGE_BANDS, MATERIALS, materialById } from "../document/materials";
import { materialsUsed, replaceEverywhere, type Replacement } from "../document/replace";
import { el } from "../ui/dom";
import type { Editor } from "./editor";
import { openModal } from "./workshop-ui";

const SELECT = "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 shrink-0 btn-accent px-3 text-xs font-medium";

function showReplace(editor: Editor): void {
  const used = materialsUsed(editor.doc);
  if (!used.size) return editor.notify("Aucune matière n'est encore choisie dans ce projet (Atelier › Matière et chants).", "info");
  const from = el("select", { class: SELECT, "aria-label": "Matière à remplacer" }, ...[...used].map(([id, n]) => el("option", { value: id }, `${materialById(id)?.name ?? id} (${n} corps)`)));
  const to = el("select", { class: SELECT, "aria-label": "Nouvelle matière" }, ...MATERIALS.map((m) => el("option", { value: m.id }, m.name)));
  const bandFrom = el("select", { class: SELECT, "aria-label": "Chant à remplacer" }, ...EDGE_BANDS.map((b) => el("option", { value: String(b) }, `Chant ${b} mm`)));
  const bandTo = el("select", { class: SELECT, "aria-label": "Nouveau chant" }, ...EDGE_BANDS.map((b) => el("option", { value: String(b), selected: b === 2 }, `Chant ${b} mm`)));
  const run = (r: Replacement, what: string) => {
    const { doc, bodies } = replaceEverywhere(editor.doc, r);
    if (!bodies) return editor.notify(`Aucun corps n'a ${what}.`, "info");
    void editor.change(doc);
    editor.notify(`${bodies} corps changé(s).`, "success");
    close();
  };
  const material = el("button", { type: "button", class: BUTTON }, "Remplacer");
  material.addEventListener("click", () => from.value !== to.value && run({ material: [from.value, to.value] }, "cette matière"));
  const band = el("button", { type: "button", class: BUTTON }, "Remplacer");
  band.addEventListener("click", () => bandFrom.value !== bandTo.value && run({ band: [Number(bandFrom.value), Number(bandTo.value)] }, "ce chant"));
  const content = el(
    "div",
    { class: "space-y-4 text-xs" },
    el("p", { class: "text-gray-600 dark:text-gray-300" }, "Change d'un coup tous les corps du projet, et les standards de construction du projet qui les nommaient. Une seule annulation (Ctrl+Z)."),
    el("div", { class: "space-y-1" }, el("h3", { class: "font-semibold" }, "Matière"), el("div", { class: "flex items-center gap-2" }, from, "→", to, material)),
    el("div", { class: "space-y-1" }, el("h3", { class: "font-semibold" }, "Chant"), el("div", { class: "flex items-center gap-2" }, bandFrom, "→", bandTo, band)),
  );
  const close = openModal("Remplacer partout", content, [{ label: "Fermer", run: () => close() }]);
}

export function bindReplace(root: HTMLElement, editor: Editor): void {
  root.querySelector('[data-workshop="replace"]')?.addEventListener("click", () => showReplace(editor));
}
