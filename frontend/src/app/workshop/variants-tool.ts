/**
 * « Variantes » : les versions gardées du projet, côte à côte avec la version en cours, leur image, leur prix et l'écart
 * de prix. On garde la version en cours sous un nom, on rouvre celle que le client préfère (Ctrl+Z revient en arrière),
 * ou on en supprime une (document/variants.ts).
 */
import { euros } from "../../document/quote";
import { openedVariant, withoutVariant, withVariant } from "../../document/variants";
import type { Variant } from "../../document/types";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { thumbnail } from "../library-panel";
import { partsOf } from "./workshop";
import { quoteTotal } from "./workshop-documents";
import { openModal } from "./workshop-ui";

const SMALL = "h-8 flex-1 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const CARD = "flex w-52 shrink-0 flex-col gap-1.5 border border-gray-200 p-2 text-xs dark:border-gray-700";

const price = (total: number | null) => (total === null ? "Pas de prix" : `${euros(total)} TTC`);
const gap = (total: number | null, current: number | null) => {
  if (total === null || current === null) return "";
  const d = total - current;
  return Math.abs(d) < 0.005 ? "même prix" : `${d > 0 ? "+" : "−"} ${euros(Math.abs(d))} par rapport au projet en cours`;
};

function picture(src: string | undefined): HTMLElement {
  return src ? el("img", { src, alt: "", class: "h-28 w-full object-contain" }) : el("div", { class: "h-28 w-full bg-gray-100 dark:bg-gray-800" });
}

export function bindVariants(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  const open = () => {
    const current = quoteTotal(viewport, editor);
    const parts = partsOf(viewport, editor.doc).length;
    const image = thumbnail(viewport);
    const name = el("input", { type: "text", class: "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-800", placeholder: "Nom de la variante", "aria-label": "Nom de la variante", value: `Variante ${(editor.doc.variants?.length ?? 0) + 1}` }) as HTMLInputElement;
    const keep = el("button", { type: "button", class: "h-8 btn-accent px-3 text-xs font-medium" }, "Garder cette version");
    const row = el("div", { class: "flex gap-2 overflow-x-auto pb-1", role: "list", "aria-label": "Variantes" });
    const again = (made: ReturnType<typeof withVariant>, done?: string) => {
      if (typeof made === "string") return editor.notify(made, "error");
      void editor.change(made).then(() => {
        if (done) editor.notify(done, "success");
        draw();
      });
    };
    const card = (v: Variant) => {
      const reopen = el("button", { type: "button", class: SMALL }, "Ouvrir");
      reopen.addEventListener("click", () => {
        again(openedVariant(editor.doc, v.id), `Variante ouverte : ${v.name}. Ctrl+Z revient en arrière.`);
        close();
      });
      const remove = el("button", { type: "button", class: SMALL, "aria-label": `Supprimer ${v.name}` }, "Supprimer");
      remove.addEventListener("click", () => again(withoutVariant(editor.doc, v.id)));
      return el(
        "div",
        { class: CARD, role: "listitem" },
        picture(v.image),
        el("strong", { class: "truncate text-sm", title: v.name }, v.name),
        el("span", { class: "font-semibold" }, price(v.total)),
        el("span", { class: "text-gray-500 dark:text-gray-400" }, `${v.parts} pièce${v.parts > 1 ? "s" : ""}`),
        el("span", { class: "min-h-8 text-gray-500 dark:text-gray-400" }, gap(v.total, current)),
        el("div", { class: "flex gap-1" }, reopen, remove),
      );
    };
    const draw = () =>
      row.replaceChildren(
        el(
          "div",
          { class: `${CARD} border-sky-500`, role: "listitem" },
          picture(image),
          el("strong", { class: "text-sm" }, "Projet en cours"),
          el("span", { class: "font-semibold" }, price(current)),
          el("span", { class: "text-gray-500 dark:text-gray-400" }, `${parts} pièce${parts > 1 ? "s" : ""}`),
        ),
        ...(editor.doc.variants ?? []).map(card),
      );
    keep.addEventListener("click", () => {
      again(withVariant(editor.doc, { name: name.value, total: current, parts, image }), `Variante gardée : ${name.value.trim()}.`);
      name.value = `Variante ${(editor.doc.variants?.length ?? 0) + 2}`;
    });
    draw();
    const close = openModal("Variantes", el("div", { class: "space-y-3" }, el("div", { class: "flex gap-2" }, name, keep), row));
  };
  root.querySelector('[data-workshop="variants"]')?.addEventListener("click", open);
}
