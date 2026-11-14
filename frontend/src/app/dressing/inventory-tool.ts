/**
 * « Inventaire du client » (groupe Dressing) : on tape ce que le client doit ranger ; la fenêtre dit les mètres de
 * penderie courte et longue, de tablettes et les tiroirs qu'il faut, ce que le dressing dessiné offre déjà, ce qui
 * manque (avec 10 % de marge) et les modules à ajouter, avec la largeur qu'ils prennent (document/wardrobe-inventory.ts,
 * document/wardrobe-have.ts). L'inventaire est gardé par ce navigateur, pour ce projet.
 */
import { wardrobeHave } from "../../document/wardrobe-have";
import { compare, EMPTY_WARDROBE, needs, STORAGE_LABELS, WARDROBE_ITEMS, type Wardrobe } from "../../document/wardrobe-inventory";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { openModal } from "../workshop/workshop-ui";

const key = () => `cao.inventory.${location.pathname.match(/projects\/([^/]+)/)?.[1] ?? "projet"}`;

function load(): Wardrobe {
  try {
    const saved = JSON.parse(localStorage.getItem(key()) ?? "null") as Partial<Wardrobe> | null;
    return { ...EMPTY_WARDROBE, ...Object.fromEntries(Object.entries(saved ?? {}).filter(([k, v]) => k in EMPTY_WARDROBE && typeof v === "number" && v >= 0)) };
  } catch {
    return { ...EMPTY_WARDROBE };
  }
}

export function openInventory(editor: Editor): void {
  const w = load();
  const result = el("div", { class: "space-y-2", "data-inventory-result": "" });
  const amount = (what: keyof ReturnType<typeof needs>, v: number) => (what === "drawers" ? `${v}` : formatLength(v, editor.unit));
  const draw = () => {
    const need = needs(w);
    const { gaps, width } = compare(need, wardrobeHave(editor.doc));
    const row = (cells: string[], head = false) => el("tr", {}, ...cells.map((c, i) => el(head ? "th" : "td", { class: `border-b border-gray-200 px-2 py-1 dark:border-gray-700 ${i ? "text-right" : "text-left"}` }, c)));
    const missing = gaps.filter((g) => g.module);
    // The same in the words of « Remplir selon les besoins » of the Plan de dressing.
    const m = (mm: number) => (Math.ceil((mm * 1.1) / 100) / 10).toLocaleString("fr-FR");
    const knitShelves = Math.ceil(w.knits / 6) * 350;
    const forFill = el("p", { class: "text-xs text-gray-600 dark:text-gray-300", "data-inventory-fill": "" }, `Pour « Remplir selon les besoins » (Plan de dressing) : penderie longue ${m(need.longRod)} m, penderie courte ${m(need.shortRod)} m, chaussures ${w.shoes} paires, tiroirs ${w.drawers}, étagères ${m(knitShelves)} m.`);
    result.replaceChildren(
      el("table", { class: "w-full text-sm" }, row(["", "Il faut (+10 %)", "Dessiné", "Manque"], true), ...gaps.map((g) => row([STORAGE_LABELS[g.what], amount(g.what, g.need), amount(g.what, g.have), g.missing ? amount(g.what, g.missing) : "—"]))),
      missing.length
        ? el("div", { "data-inventory-proposal": "" }, el("p", { class: "font-medium" }, "À ajouter"), el("ul", { class: "list-disc pl-5" }, ...missing.map((g) => el("li", {}, `${g.module!.count} module${g.module!.count > 1 ? "s" : ""} « ${g.module!.label} » (${formatLength(g.module!.width, editor.unit)} de large)`))), el("p", { class: "text-xs text-gray-500" }, `Soit ${formatLength(width, editor.unit)} de dressing en plus. Posez-les avec « Modules à glisser » ou « Module ».`))
        : el("p", { class: "bg-emerald-50 px-2 py-1.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100", "data-inventory-ok": "" }, "Le dressing dessiné range tout l'inventaire."),
      forFill,
    );
  };
  const fields = WARDROBE_ITEMS.map(([k, label]) => {
    const input = el("input", { type: "number", min: "0", step: "1", value: String(w[k]), class: "h-8 w-20 border border-gray-300 bg-white px-2 text-right text-sm dark:border-gray-600 dark:bg-gray-900", "aria-label": label });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      w[k] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
      try {
        localStorage.setItem(key(), JSON.stringify(w));
      } catch {
        // For this window only.
      }
      draw();
    });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    return el("label", { class: "flex items-center justify-between gap-3" }, label, input);
  });
  draw();
  const content = el(
    "div",
    { class: "grid gap-4 text-sm md:grid-cols-[18rem_1fr]" },
    el("div", { class: "space-y-1.5" }, el("p", { class: "text-xs text-gray-500" }, "Ce que le client doit ranger :"), ...fields),
    el("div", { class: "space-y-2" }, result, el("p", { class: "text-xs text-gray-500" }, "Repères : 3 cm de tringle par chemise ou pantalon, 6 par veste, 4 par robe, 8 par manteau ; 35 cm de tablette pour 6 pulls pliés, 20 cm par paire de chaussures.")),
  );
  const close = openModal("Inventaire du client", content, [{ label: "Fermer", run: () => close() }]);
}

export function bindInventory(root: HTMLElement, editor: Editor): void {
  for (const b of root.querySelectorAll('[data-workshop="inventory"]')) b.addEventListener("click", () => openInventory(editor));
}
