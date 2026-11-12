/**
 * La colonne « Projets », à gauche du Navigateur (grands écrans) : les projets du compte rangés dans leurs dossiers, les
 * mêmes que ceux de la page d'accueil (apps/projects/folders_api.py). Un clic sur un projet l'ouvre dans son onglet
 * (app/project-tabs.ts). On le range en le glissant sur un dossier, ou par son ⋯ (« Ranger dans… »). Le + crée un
 * dossier ; le ⋯ d'un dossier le renomme ou le supprime (ses projets restent, sans dossier). Un dossier se plie d'un
 * clic sur son nom. La flèche ‹ replie la colonne comme le Navigateur, et l'onglet « Projets » en bas du bord gauche de
 * la vue la rouvre. Ce qui est plié est retenu par le navigateur.
 */
import { createFolder, deleteFolder, listFolders, moveToFolder, renameFolder, type FolderList } from "../persistence/api";
import { askConfirm } from "../ui/confirm-dialog";
import { el } from "../ui/dom";
import { EDGE_TAB_CLASS, edgeTabs } from "../ui/edge-tabs";
import type { EditorConfig } from "./editor";
import { MOST_TABS, pageTabs, type ProjectTabs } from "./project-tabs";

type Notify = (message: string, kind?: "info" | "success" | "error") => void;
type Project = FolderList["projects"][number];
export interface ProjectGroup {
  /** The folder's id; null: the projects in no folder. */
  id: number | null;
  name: string;
  projects: Project[];
}

const FOLDED = "cao.projects-folded";
const SHUT = "cao.projects-shut-folders";
const DRAG = "application/x-cao-project";
const SPACES: Record<string, string> = { design: "Conception 3D", kitchen: "Cuisine", dressing: "Dressing" };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Only this visit.
  }
}

/** The groups of the column: each folder in its order, then the projects in none; a search keeps the groups that match. */
export function groupProjects(list: FolderList, search = ""): ProjectGroup[] {
  const wanted = search.trim().toLocaleLowerCase("fr");
  const matching = list.projects.filter((p) => !wanted || p.name.toLocaleLowerCase("fr").includes(wanted));
  const known = new Set(list.folders.map((f) => f.id));
  const groups: ProjectGroup[] = list.folders.map((f) => ({ id: f.id, name: f.name, projects: matching.filter((p) => p.folder === f.id) }));
  groups.push({ id: null, name: "Sans dossier", projects: matching.filter((p) => p.folder === null || !known.has(p.folder)) });
  return wanted ? groups.filter((g) => g.projects.length > 0) : groups;
}

const said = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** A small menu under a ⋯: a click on an item closes it and runs it; Échap or a click elsewhere closes it. */
function popup(anchor: HTMLElement, items: { label: string; run: () => void; danger?: boolean }[]): void {
  document.querySelector("[data-organizer-menu]")?.remove();
  const box = el("div", {
    role: "menu",
    "data-organizer-menu": "",
    class: "fixed z-50 w-52 border border-gray-200 bg-white p-1 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
  });
  const close = () => {
    box.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape, true);
  };
  const outside = (event: PointerEvent) => {
    if (!box.contains(event.target as Node) && event.target !== anchor) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close();
    anchor.focus();
  };
  for (const item of items) {
    const button = el("button", { type: "button", role: "menuitem", class: `tool-btn w-full justify-start truncate text-left text-xs${item.danger ? " text-red-700 dark:text-red-400" : ""}` }, item.label);
    button.addEventListener("click", () => {
      close();
      item.run();
    });
    box.append(button);
  }
  const at = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(4, Math.min(at.left, window.innerWidth - 212))}px`;
  box.style.top = `${at.bottom + 2}px`;
  document.body.append(box);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape, true);
  box.querySelector("button")?.focus();
}

/** A folder's name typed in place: Entrée keeps it, Échap gives up, leaving the field keeps what is typed. */
function nameField(initial: string, done: (name: string | null) => void): HTMLInputElement {
  const input = el("input", {
    type: "text",
    maxlength: "80",
    value: initial,
    placeholder: "Nom du dossier",
    "aria-label": "Nom du dossier",
    class: "h-7 min-w-0 flex-1 border border-sky-500 bg-white px-1.5 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100",
    "data-organizer-name": "",
  });
  let finished = false;
  const finish = (name: string | null) => {
    if (finished) return;
    finished = true;
    done(name);
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation(); // not the editor's shortcuts
    if (event.key === "Enter") finish(input.value.trim() || null);
    else if (event.key === "Escape") finish(null);
  });
  input.addEventListener("blur", () => finish(input.value.trim() || null));
  return input;
}

export function bindProjectOrganizer(root: HTMLElement, config: EditorConfig, notify: Notify): void {
  const tree = root.querySelector<HTMLElement>('[data-ref="panel-tree"]');
  const pile = edgeTabs(root);
  // « cao.tool-columns-off »: the view where it was before the columns (the older browser tests click it by coordinates).
  if (!tree || !pile || read("cao.tool-columns-off") === "1") return;
  const foldersUrl = config.foldersUrl ?? "/api/folders/";
  const projectsApi = config.apiUrl.replace(/[^/]+\/$/, "");
  let list: FolderList | null = null;
  let search = "";
  const shut = new Set<string>();
  try {
    for (const key of JSON.parse(read(SHUT) ?? "[]") as unknown[]) if (typeof key === "string") shut.add(key);
  } catch {
    // None folded.
  }

  const card = "cad-card mx-1.5 mb-1 flex min-h-10 items-center gap-1 border border-gray-200 bg-white px-3 py-1.5 shadow-[0_6px_18px_rgba(15,23,42,0.30)] dark:border-gray-700 dark:bg-gray-800 dark:shadow-[0_6px_20px_rgba(0,0,0,0.75)]";
  const small = "tool-btn min-h-8 min-w-8 px-1 text-base";
  const newFolder = el("button", { type: "button", class: small, title: "Nouveau dossier", "aria-label": "Nouveau dossier", "data-organizer-new-folder": "" }, "+");
  const fold = el("button", { type: "button", class: small, "aria-label": "Replier la colonne Projets", title: "Replier la colonne Projets : l'onglet « Projets » en bas à gauche de la vue la rouvre", "data-organizer-fold": "" }, "‹");
  const find = el("input", { type: "search", placeholder: "Chercher un projet", "aria-label": "Chercher un projet", class: "mx-1.5 mb-1 h-7 min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900" });
  const body = el("div", { class: "cad-no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3", "data-organizer-list": "" });
  const column = el(
    "aside",
    { class: "hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-800 dark:bg-gray-900 group-data-[render=on]/editor:hidden", "aria-label": "Projets et dossiers", "data-project-organizer": "" },
    el("div", { class: "flex flex-col px-2 pt-3" }, el("div", { class: card }, el("h2", { class: "panel-title flex-1" }, "Projets"), newFolder, fold), find),
    body,
  );
  tree.before(column);

  const move = async (id: string, folder: number | null) => {
    const project = list?.projects.find((p) => p.id === id);
    if (!project || project.folder === folder) return;
    const before = project.folder;
    project.folder = folder;
    shut.delete(String(folder ?? "none"));
    draw();
    try {
      await moveToFolder(projectsApi, id, folder);
    } catch (error) {
      project.folder = before;
      draw();
      notify(said(error, "Ce projet n'a pas pu être rangé."), "error");
    }
  };

  const act = async (work: () => Promise<unknown>, fallback: string) => {
    try {
      await work();
    } catch (error) {
      notify(said(error, fallback), "error");
    }
    if (loading) await loading; // a reading begun before the change would miss it
    await refresh();
  };

  const rename = (group: ProjectGroup, head: HTMLElement) => {
    const field = nameField(group.name, (name) => {
      if (name && name !== group.name && group.id !== null) void act(() => renameFolder(foldersUrl, group.id as number, name), "Ce dossier n'a pas pu être renommé.");
      else draw();
    });
    head.replaceChildren(field);
    field.focus();
    field.select();
  };

  const remove = async (group: ProjectGroup) => {
    if (group.id === null) return;
    const count = list?.projects.filter((p) => p.folder === group.id).length ?? 0;
    const rest = count > 1 ? ` Ses ${count} projets restent, sans dossier.` : count ? " Son projet reste, sans dossier." : "";
    if (!(await askConfirm(`Supprimer le dossier « ${group.name} » ?${rest}`, "Supprimer le dossier"))) return;
    await act(() => deleteFolder(foldersUrl, group.id as number), "Ce dossier n'a pas pu être supprimé.");
  };

  const dropOn = (target: HTMLElement, folder: number | null) => {
    target.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes(DRAG)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.dataset.drop = "on";
    });
    target.addEventListener("dragleave", () => delete target.dataset.drop);
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      delete target.dataset.drop;
      const id = event.dataTransfer?.getData(DRAG);
      if (id) void move(id, folder);
    });
  };

  const row = (project: Project, tabs: ProjectTabs | undefined) => {
    const here = project.id === config.projectId;
    const opened = !here && tabs?.tabs.some((t) => t.id === project.id);
    const changed = new Date(project.updated_at).toLocaleDateString("fr-FR");
    const open = el(
      "button",
      {
        type: "button",
        class: `flex min-h-7 min-w-0 flex-1 items-center gap-1 px-1.5 text-left text-xs ${here ? "font-bold text-sky-700 dark:text-sky-300" : "font-semibold text-gray-700 hover:text-green-700 dark:text-gray-300 dark:hover:text-green-400"}`,
        title: `${project.name} — ${SPACES[project.space] ?? project.space}, modifié le ${changed}`,
        "aria-current": here ? "page" : undefined,
        "data-organizer-open": project.id,
      },
      el("span", { class: "truncate" }, project.name),
      opened ? el("span", { class: "ml-auto shrink-0 text-[9px] text-sky-500", title: "Ouvert dans un onglet", "aria-label": "ouvert" }, "●") : null,
    );
    open.addEventListener("click", () => {
      const pages = pageTabs();
      if (!pages) return location.assign(`${config.projectsUrl}${project.id}/editor/`);
      if (!pages.open({ id: project.id, name: project.name })) notify(`${MOST_TABS} onglets au plus : fermez-en un pour en ouvrir un autre.`, "info");
    });
    const more = el("button", { type: "button", class: "tool-btn min-h-7 min-w-7 shrink-0 px-0.5 text-xs opacity-60 hover:opacity-100", title: "Ranger ce projet dans un dossier", "aria-label": `Ranger ${project.name}`, "data-organizer-move": project.id }, "⋯");
    more.addEventListener("click", () => {
      const folders = (list?.folders ?? []).filter((f) => f.id !== project.folder);
      const items: { label: string; run: () => void }[] = folders.map((f) => ({ label: `Ranger dans « ${f.name} »`, run: () => void move(project.id, f.id) }));
      if (project.folder !== null) items.push({ label: "Sortir du dossier", run: () => void move(project.id, null) });
      if (!items.length) items.push({ label: "Créer un dossier d'abord (+)", run: () => newFolder.click() });
      popup(more, items);
    });
    const item = el("li", { class: "group flex items-center", draggable: "true", "data-organizer-project": project.id }, open, more);
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(DRAG, project.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    return item;
  };

  const group = (g: ProjectGroup, tabs: ProjectTabs | undefined) => {
    const key = String(g.id ?? "none");
    const open = search !== "" || !shut.has(key);
    const toggle = el(
      "button",
      { type: "button", class: "flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-200", "aria-expanded": String(open), title: open ? `Plier « ${g.name} »` : `Déplier « ${g.name} »`, "data-folder-toggle": "" },
      el("span", { class: "w-3 shrink-0 text-gray-400", "aria-hidden": "true" }, open ? "▾" : "▸"),
      el("span", { "aria-hidden": "true" }, g.id === null ? "🗂" : "📁"),
      el("span", { class: "truncate" }, g.name),
      el("span", { class: "ml-auto shrink-0 font-normal text-gray-400" }, String(g.projects.length)),
    );
    toggle.addEventListener("click", () => {
      if (shut.has(key)) shut.delete(key);
      else shut.add(key);
      write(SHUT, shut.size ? JSON.stringify([...shut]) : null);
      draw();
    });
    const head = el("div", { class: "flex items-center gap-0.5 px-1 data-[drop=on]:bg-sky-100 data-[drop=on]:outline-2 data-[drop=on]:outline-sky-500 dark:data-[drop=on]:bg-sky-950", "data-folder-head": key }, toggle);
    if (g.id !== null) {
      const more = el("button", { type: "button", class: "tool-btn min-h-7 min-w-7 shrink-0 px-0.5 text-xs opacity-60 hover:opacity-100", title: "Renommer ou supprimer ce dossier", "aria-label": `Dossier ${g.name} : renommer ou supprimer`, "data-folder-more": "" }, "⋯");
      more.addEventListener("click", () =>
        popup(more, [
          { label: "Renommer", run: () => rename(g, head) },
          { label: "Supprimer le dossier", danger: true, run: () => void remove(g) },
        ]),
      );
      head.append(more);
    }
    dropOn(head, g.id);
    const section = el("section", { class: "mb-1", "aria-label": g.name, "data-folder-group": key }, head);
    if (open) {
      const rows = g.projects.length ? g.projects.map((p) => row(p, tabs)) : [el("li", { class: "px-2 py-1 text-xs text-gray-400" }, g.id === null ? "Aucun" : "Vide : glissez-y un projet")];
      section.append(el("ul", { class: "ml-2.5 border-l border-gray-200 pl-1 dark:border-gray-700" }, ...rows));
    }
    return section;
  };

  function draw(): void {
    if (!list) return;
    const tabs = pageTabs();
    body.replaceChildren(...groupProjects(list, search).map((g) => group(g, tabs)));
    if (search && !body.childElementCount) body.append(el("p", { class: "px-2 py-1 text-xs text-gray-500" }, "Aucun projet de ce nom."));
  }

  let loading: Promise<void> | null = null;
  function refresh(): Promise<void> {
    if (!list) body.replaceChildren(el("p", { class: "px-2 py-1 text-xs text-gray-500" }, "Chargement…"));
    loading ??= listFolders(foldersUrl)
      .then((fresh) => {
        list = fresh;
        draw();
      })
      .catch(() => {
        if (!list) body.replaceChildren(el("p", { class: "px-2 py-1 text-xs text-gray-500" }, "La liste des projets n'a pas pu être lue."));
      })
      .finally(() => (loading = null));
    return loading;
  }

  newFolder.addEventListener("click", () => {
    body.querySelector("[data-organizer-new]")?.remove();
    const field = nameField("", (name) => {
      holder.remove();
      if (name) void act(() => createFolder(foldersUrl, name), "Ce dossier n'a pas pu être créé.");
    });
    const holder = el("div", { class: "flex px-1 pb-1", "data-organizer-new": "" }, field);
    body.prepend(holder);
    field.focus();
  });
  find.addEventListener("keydown", (event) => event.stopPropagation());
  find.addEventListener("input", () => {
    search = find.value;
    draw();
  });

  const tab = el(
    "button",
    { type: "button", class: `${EDGE_TAB_CLASS} order-first max-lg:hidden`, "aria-label": "Déplier la colonne Projets", title: "Déplier la colonne Projets", "data-organizer-unfold": "" },
    el("span", { "aria-hidden": "true" }, "›"),
    el("span", { class: "edge-tab-vertical", "aria-hidden": "true" }, "Projets"),
  );
  pile.prepend(tab);
  const apply = (folded: boolean) => {
    column.dataset.folded = String(folded);
    tab.hidden = !folded;
    fold.setAttribute("aria-expanded", String(!folded));
    tab.setAttribute("aria-expanded", String(folded));
    if (!folded) void refresh();
  };
  fold.addEventListener("click", () => {
    write(FOLDED, "1");
    apply(true);
    tab.focus();
  });
  tab.addEventListener("click", () => {
    write(FOLDED, null);
    apply(false);
    fold.focus();
  });
  // Another tab may have sorted the projects: read again when this editor comes back.
  window.addEventListener("focus", () => {
    if (column.dataset.folded !== "true") void refresh();
  });
  const stop = pageTabs()?.subscribe(draw);
  if (stop) window.addEventListener("pagehide", stop);
  apply(read(FOLDED) === "1");
}
