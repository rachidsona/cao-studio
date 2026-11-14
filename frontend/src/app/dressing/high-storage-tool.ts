/**
 * « Rangement en hauteur » (groupe Dressing) : le tableau des niches hors de portée — leur bas à 2 m du sol ou plus, ou
 * une tringle plus haute que 1,90 m —, ce qu'elles portent et ce qu'on en conseille (document/high-storage.ts) ; là
 * où une penderie escamotable (pantographe) tient, « Poser » la met à la place de la tringle, en une annulation.
 */
import { highNiches, withPullDown } from "../../document/high-storage";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { openModal } from "../workshop/workshop-ui";

export function openHighStorage(editor: Editor): void {
  const body = el("div", { class: "space-y-3 text-sm", "data-high-storage": "" });
  const length = (mm: number) => formatLength(mm, editor.unit);
  const draw = () => {
    const rows = highNiches(editor.doc, length);
    const cell = (content: string | HTMLElement, right = false) => el("td", { class: `border-b border-gray-200 px-2 py-1 align-top dark:border-gray-700 ${right ? "text-right" : ""}` }, content);
    const head = (text: string) => el("th", { class: "border-b border-gray-300 px-2 py-1 text-left dark:border-gray-600" }, text);
    body.replaceChildren(
      rows.length
        ? el(
            "table",
            { class: "w-full" },
            el("tr", {}, head("Niche"), head("Du sol"), head("Taille"), head("Contient"), head("Conseil")),
            ...rows.map((r) => {
              const advice = el("div", { class: "space-y-1" }, el("p", {}, r.advice));
              if (r.pulldown) {
                const put = el("button", { type: "button", class: "h-7 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800" }, "Poser une penderie escamotable");
                put.addEventListener("click", () => {
                  const made = withPullDown(editor.doc, r);
                  if (typeof made === "string") return editor.notify(made, "error");
                  void editor.change(made.doc).then(draw);
                  editor.notify(`« ${made.name} » posée dans ${r.name} : elle descend à hauteur de main.`, "success");
                });
                advice.append(put);
              }
              return el("tr", { "data-high-niche": r.name }, cell(r.name), cell(`${length(r.bottom)} à ${length(r.top)}`), cell(`${length(r.width)} × ${length(r.height)}`), cell(r.holds), cell(advice));
            }),
          )
        : el("p", { class: "bg-emerald-50 px-2 py-1.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" }, "Rien n'est hors de portée : pas de niche à 2 m du sol ou plus, ni de tringle plus haute que 1,90 m."),
      el("p", { class: "text-xs text-gray-500" }, "Repères : on attrape sans escabeau jusqu'à 2 m environ, une tringle se pose entre 1,70 m et 1,90 m. Une penderie escamotable (pantographe) tient dans une niche de 45 à 115 cm de large, 90 cm de haut et 47 cm de profondeur au moins ; elle va au devis."),
    );
  };
  draw();
  const close = openModal("Rangement en hauteur", body, [{ label: "Fermer", run: () => close() }]);
}

export function bindHighStorage(root: HTMLElement, editor: Editor): void {
  for (const b of root.querySelectorAll('[data-workshop="high-storage"]')) b.addEventListener("click", () => openHighStorage(editor));
}
