/**
 * Un projet par espace : une cuisine se travaille dans un projet de cuisine, un placard ou un dressing dans un projet de
 * dressing, un meuble libre dans un projet 3D. L'onglet d'un autre espace (Cuisine, depuis un placard) n'affiche donc
 * pas le projet ouvert : il propose d'ouvrir un projet de cet espace, ou d'en créer un, dans un autre onglet de projet.
 * Ses outils peuvent tout de même servir dans ce projet, sur demande (« cad:use-space », ui/ribbon-layout.ts).
 */
import { createProject, listProjects } from "../persistence/api";
import { el } from "../ui/dom";
import type { EditorConfig } from "./editor";
import { MOST_TABS, pageTabs } from "./project-tabs";
import { openModal } from "./workshop/workshop-ui";

const SPACES: Record<string, { name: string; one: string; new: string; placeholder: string }> = {
  design: { name: "Conception 3D", one: "un projet 3D", new: "Nouveau projet 3D", placeholder: "Ex. : Meuble télé" },
  kitchen: { name: "Cuisine", one: "une cuisine", new: "Nouvelle cuisine", placeholder: "Ex. : Cuisine M. Dupont" },
  dressing: { name: "Dressing", one: "un dressing ou un placard", new: "Nouveau dressing", placeholder: "Ex. : Placard de l'entrée" },
};

export function bindSpaceSwitch(config: EditorConfig, space: string | undefined, notify: (message: string, kind?: "info" | "success" | "error") => void): void {
  const collection = config.apiUrl.replace(/[^/]+\/$/, "");
  document.addEventListener("cad:other-space", (event) => {
    const wanted = (event as CustomEvent<string>).detail;
    const target = SPACES[wanted];
    const here = SPACES[space ?? "design"];
    if (!target || !here) return;
    const open = (project: { id: string; name: string }) => {
      const tabs = pageTabs();
      close();
      // In a tab of its own; without the tabs (an old page), the page itself.
      if (!tabs) return location.assign(`${config.projectsUrl}${project.id}/editor/`);
      if (!tabs.open(project)) notify(`${MOST_TABS} onglets au plus : fermez-en un pour en ouvrir un autre.`, "info");
    };
    const list = el("div", { class: "max-h-64 space-y-1 overflow-y-auto", role: "group", "aria-label": `Ouvrir ${target.one}`, "data-space-list": wanted }, el("p", { class: "text-sm text-gray-500" }, "Chargement…"));
    const name = el("input", { type: "text", maxlength: "120", placeholder: target.placeholder, "aria-label": `Nom : ${target.new.toLowerCase()}`, class: "h-9 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-900", "data-space-name": "" });
    name.addEventListener("keydown", (e) => e.stopPropagation());
    const create = el("button", { type: "submit", class: "tool-btn tool-btn-primary h-9 shrink-0 px-3 text-sm" }, `Créer`);
    const form = el("form", { class: "flex gap-2", "data-space-new": wanted }, name, create);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const wantedName = name.value.trim();
      if (!wantedName) return notify(`Donnez un nom : ${target.new.toLowerCase()}.`, "info");
      create.disabled = true;
      createProject(collection, wantedName, wanted)
        .then(open)
        .catch((error: unknown) => notify(error instanceof Error ? error.message : "Ce projet n'a pas pu être créé.", "error"))
        .finally(() => (create.disabled = false));
    });
    const borrow = el("button", { type: "button", class: "text-left text-xs text-gray-500 underline hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100", "data-space-borrow": wanted }, `Utiliser les outils ${target.name} dans ce projet-ci`);
    borrow.addEventListener("click", () => {
      close();
      document.dispatchEvent(new CustomEvent("cad:use-space", { detail: wanted }));
    });
    const content = el(
      "div",
      { class: "w-[min(32rem,calc(100vw-3rem))] space-y-4 text-sm", "data-space-switch": wanted },
      el("p", {}, `« ${config.projectName} » est ${here.one} (${here.name}). ${target.name === "Cuisine" ? "Une cuisine" : target.name === "Dressing" ? "Un dressing" : "Un projet 3D"} se travaille dans son propre projet, à côté, dans un autre onglet :`),
      el("div", { class: "space-y-1.5" }, el("p", { class: "panel-title" }, target.new), form),
      el("div", { class: "space-y-1.5" }, el("p", { class: "panel-title" }, `Ouvrir ${target.one}`), list),
      borrow,
    );
    const close = openModal(target.name, content);
    name.focus();
    listProjects(collection)
      .then((projects) => {
        const mine = projects.filter((p) => (p.space ?? "design") === wanted && p.id !== config.projectId);
        list.replaceChildren(
          ...(mine.length
            ? mine.map((p) => {
                const b = el("button", { type: "button", class: "tool-btn w-full justify-start truncate text-left text-sm" }, p.name);
                b.addEventListener("click", () => open(p));
                return b;
              })
            : [el("p", { class: "text-sm text-gray-500" }, `Aucun pour le moment : créez-en ${target.one.startsWith("un ") ? "un" : "une"} au-dessus.`)]),
        );
      })
      .catch(() => list.replaceChildren(el("p", { class: "text-sm text-gray-500" }, "La liste des projets n'a pas pu être lue.")));
  });
}
