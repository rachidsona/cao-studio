/**
 * Les onglets de projets, comme dans Fusion : une barre au-dessus de la vue, un onglet par projet ouvert, et un + pour
 * en créer ou en ouvrir un autre. Le projet de la page est l'onglet de départ ; chaque autre projet s'ouvre dans son
 * propre éditeur, un cadre qui couvre la page et le reste, caché, quand on change d'onglet : son historique, sa vue et
 * ce qui n'est pas enregistré restent là. La liste est tenue par la page (`ProjectTabs`), chaque éditeur y dessine sa
 * barre ; elle est gardée dans ce navigateur, et un onglet retrouvé ne se charge qu'au premier clic.
 */
import { createProject, listProjects } from "../persistence/api";
import { askConfirm } from "../ui/confirm-dialog";
import { el, ref } from "../ui/dom";
import type { EditorConfig } from "./editor";
import type { DocumentSession } from "./session";

export interface OpenProject {
  id: string;
  name: string;
}

/** Beyond this, the browser starts dropping the 3D views of the first tabs. */
export const MOST_TABS = 8;
const KEY = "cao.open-projects";

/** What an editor open in a tab tells the list. */
interface OpenEditor {
  dirty(): boolean;
  save(): Promise<void>;
}

/** The tabs on opening: those kept that still exist, under their name of now, and the project of the page. */
export function restoredTabs(kept: OpenProject[], current: OpenProject, known: OpenProject[] | null): OpenProject[] {
  const names = new Map(known?.map((p) => [p.id, p.name]));
  const tabs = kept.filter((p) => !known || names.has(p.id)).map((p) => (p.id === current.id ? current : { ...p, name: names.get(p.id) ?? p.name }));
  return (tabs.some((t) => t.id === current.id) ? tabs : [...tabs, current]).slice(-MOST_TABS);
}

function readKept(): OpenProject[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? kept.filter((p: OpenProject) => typeof p?.id === "string" && typeof p.name === "string") : [];
  } catch {
    return [];
  }
}

function keep(tabs: OpenProject[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // Private window, full storage: the tabs just won't come back.
  }
}

/** The open projects: one list for the page and every editor in it. */
export class ProjectTabs {
  tabs: OpenProject[];
  active: string;
  private readonly home: string;
  private readonly frames = new Map<string, HTMLIFrameElement>();
  private readonly editors = new Map<string, OpenEditor>();
  private readonly listeners = new Set<() => void>();
  private readonly projects: string;

  constructor(current: OpenProject, projectsUrl: string) {
    this.tabs = [current];
    this.active = this.home = current.id;
    this.projects = projectsUrl;
  }

  /** The tabs of last time, now that the projects are known (null: they could not be read). */
  restore(known: OpenProject[] | null): void {
    this.tabs = restoredTabs(readKept(), this.tabs.find((t) => t.id === this.home) as OpenProject, known);
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    keep(this.tabs);
    for (const listener of this.listeners) listener();
  }

  attach(id: string, editor: OpenEditor): void {
    this.editors.set(id, editor);
  }

  editor(id: string): OpenEditor | undefined {
    return this.editors.get(id);
  }

  /** This project in a tab, opened if need be; false when there are too many. */
  open(project: OpenProject): boolean {
    if (!this.tabs.some((t) => t.id === project.id)) {
      if (this.tabs.length >= MOST_TABS) return false;
      this.tabs = [...this.tabs, project];
    }
    this.select(project.id);
    return true;
  }

  private url(id: string): string {
    return `${this.projects}${id}/editor/`;
  }

  select(id: string): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    this.active = id;
    if (id !== this.home && !this.frames.has(id)) this.frames.set(id, this.frame(id));
    for (const [key, frame] of this.frames) frame.style.visibility = key === id ? "visible" : "hidden";
    (this.frames.get(id)?.contentWindow ?? window).focus();
    history.replaceState(history.state, "", this.url(id));
    document.title = `${tab.name} · CAO Studio`;
    this.changed();
  }

  private frame(id: string): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.src = this.url(id);
    frame.title = this.tabs.find((t) => t.id === id)?.name ?? "";
    frame.dataset.projectFrame = id;
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#0b1419";
    document.body.append(frame);
    return frame;
  }

  /** Closes a tab. The page's own editor stays behind the others, unseen: its tab can come back at once. */
  close(id: string): void {
    const at = this.tabs.findIndex((t) => t.id === id);
    if (at < 0) return;
    const next = this.tabs[at + 1] ?? this.tabs[at - 1];
    this.tabs = this.tabs.filter((t) => t.id !== id);
    if (!next) {
      keep(this.tabs);
      return location.assign(this.projects);
    }
    if (this.active === id) this.select(next.id);
    else this.changed();
    this.frames.get(id)?.remove();
    this.frames.delete(id);
    if (id !== this.home) this.editors.delete(id);
  }
}

type TabsWindow = Window & { cadTabs?: ProjectTabs };

/** The open projects of the page (this editor's, or the one of the page around this frame). */
export function pageTabs(): ProjectTabs | undefined {
  return window.parent === window ? (window as TabsWindow).cadTabs : (window.parent as TabsWindow).cadTabs;
}

const TAB = "flex h-8 max-w-48 shrink-0 items-center border-r border-white/10 text-xs";

function tabRow(tabs: ProjectTabs, tab: OpenProject, close: (tab: OpenProject) => void): HTMLElement {
  const active = tab.id === tabs.active;
  const select = el(
    "button",
    { type: "button", role: "tab", "aria-selected": String(active), class: "h-full min-w-0 flex-1 truncate pr-1 pl-3 text-left", title: tab.name },
    tab.name,
    tabs.editor(tab.id)?.dirty() ? " •" : "",
  );
  select.addEventListener("click", () => tabs.select(tab.id));
  const shut = el("button", { type: "button", class: "h-full w-7 shrink-0 text-gray-400 hover:text-white", title: `Fermer ${tab.name}`, "aria-label": `Fermer ${tab.name}` }, "×");
  shut.addEventListener("click", () => close(tab));
  return el("div", { class: `${TAB} ${active ? "bg-[#1d3442] font-semibold text-white shadow-[inset_0_2px_0_#38bdf8]" : "text-gray-300 hover:bg-white/5"}` }, select, shut);
}

/** The + of the bar: a new project, or one of the others. */
function addMenu(tabs: ProjectTabs, config: EditorConfig, notify: (message: string, kind?: "info" | "success" | "error") => void): HTMLElement {
  const collection = config.apiUrl.replace(/[^/]+\/$/, "");
  const opened = (project: OpenProject, menu: HTMLDetailsElement) => {
    menu.open = false;
    if (!tabs.open(project)) notify(`${MOST_TABS} onglets au plus : fermez-en un pour en ouvrir un autre.`, "info");
  };
  const list = el("div", { class: "max-h-64 space-y-0.5 overflow-y-auto", role: "group", "aria-label": "Ouvrir un projet" });
  const name = el("input", { type: "text", maxlength: "120", placeholder: "Nom du nouveau projet", "aria-label": "Nom du nouveau projet", class: "h-8 min-w-0 flex-1 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900" });
  name.addEventListener("keydown", (event) => event.stopPropagation());
  const create = el("button", { type: "submit", class: "tool-btn tool-btn-primary h-8 shrink-0 text-xs" }, "Créer");
  const form = el("form", { class: "flex gap-1.5" }, name, create);
  const menu = el(
    "details",
    { class: "relative shrink-0" },
    el("summary", { class: "flex h-8 w-9 cursor-pointer list-none items-center justify-center text-lg text-gray-300 hover:bg-white/5 hover:text-white", title: "Nouveau projet, ou ouvrir un autre projet", "aria-label": "Nouveau projet ou ouvrir un projet" }, "+"),
    el(
      "div",
      { class: "fixed z-40 mt-1 w-72 space-y-2 border border-gray-200 bg-white p-2 text-gray-900 shadow-xl [color-scheme:light] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:[color-scheme:dark]" },
      form,
      el("p", { class: "panel-title px-1" }, "Ouvrir un projet"),
      list,
    ),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const wanted = name.value.trim();
    if (!wanted) return notify("Donnez un nom au nouveau projet.", "info");
    create.disabled = true;
    createProject(collection, wanted)
      .then((project) => {
        name.value = "";
        opened(project, menu);
      })
      .catch((error: unknown) => notify(error instanceof Error ? error.message : "Ce projet n'a pas pu être créé.", "error"))
      .finally(() => (create.disabled = false));
  });
  menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    list.replaceChildren(el("p", { class: "px-1 text-xs text-gray-500" }, "Chargement…"));
    listProjects(collection)
      .then((projects) => {
        const others = projects.filter((p) => !tabs.tabs.some((t) => t.id === p.id));
        list.replaceChildren(
          ...(others.length
            ? others.map((p) => {
                const open = el("button", { type: "button", class: "tool-btn w-full justify-start truncate text-left text-xs" }, p.name);
                open.addEventListener("click", () => opened(p, menu));
                return open;
              })
            : [el("p", { class: "px-1 text-xs text-gray-500" }, "Tous vos projets sont ouverts.")]),
        );
      })
      .catch(() => list.replaceChildren(el("p", { class: "px-1 text-xs text-gray-500" }, "La liste des projets n'a pas pu être lue.")));
  });
  document.addEventListener("pointerdown", (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  return menu;
}

/** The bar of this editor, in the list of the page: the page's own, or the one of the page around this frame. */
export function bindProjectTabs(root: HTMLElement, config: EditorConfig, session: DocumentSession, notify: (message: string, kind?: "info" | "success" | "error") => void): void {
  const outer = window.parent === window ? undefined : (window.parent as TabsWindow).cadTabs;
  const current = { id: config.projectId, name: config.projectName };
  const tabs = outer ?? new ProjectTabs(current, config.projectsUrl);
  if (outer) document.head.append(el("base", { target: "_top" })); // A link leaves the tabs, it does not open a page in one.
  else {
    (window as TabsWindow).cadTabs = tabs;
    void listProjects(config.apiUrl.replace(/[^/]+\/$/, "")).catch(() => null).then((known) => tabs.restore(known));
  }
  tabs.attach(config.projectId, { dirty: () => session.dirty, save: () => session.save() });

  const close = async (tab: OpenProject) => {
    const editor = tabs.editor(tab.id);
    if (editor?.dirty()) {
      if (!(await askConfirm(`« ${tab.name} » a des modifications non enregistrées. Les enregistrer et fermer cet onglet ?`, "Enregistrer et fermer"))) return;
      await editor.save();
    }
    tabs.close(tab.id);
  };
  const strip = ref(root, "project-tabs");
  const row = el("div", { class: "cad-no-scrollbar flex min-w-0 overflow-x-auto", role: "tablist", "aria-label": "Projets ouverts" });
  strip.replaceChildren(row, addMenu(tabs, config, notify));
  const draw = () => row.replaceChildren(...tabs.tabs.map((tab) => tabRow(tabs, tab, (t) => void close(t))));
  const stop = tabs.subscribe(draw);
  window.addEventListener("pagehide", stop);
  draw();
  // The mark of a tab follows the state of its saving.
  new MutationObserver(() => tabs.changed()).observe(ref(root, "status-save"), { attributes: true, attributeFilter: ["data-state"] });
}
