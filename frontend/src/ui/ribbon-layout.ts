/**
 * The toolbars, as in Fusion: each group shows the tools one uses most, and its name ("CRÉER ▾") opens a menu of
 * all its tools — a click runs one, the pin shows it in the bar or puts it away (it stays in the menu). By default
 * the less common tools are put away; the choice is remembered per toolbar (model, sketch) in the browser, and
 * "Par défaut" in a menu brings its group back to the default.
 *
 * The bar stays on one line: when the window is too narrow, icons fold away one by one (still in their group's
 * menu), the groups of FOLD_ORDER first — the documents first of all, the furniture last — each from its last icon.
 *
 * The star ★ of a menu puts the tool in "Mes outils", the favourites bar at the left of the view (favorites.ts).
 * Groups change places by dragging their name; the order is remembered per toolbar. An icon dragged out of the bar is
 * put away in its group's menu, as by its pin; dragged into another bar, it is put there too (ui/tool-drag.ts).
 *
 * Above the model's bar, the tabs of TABS, as Fusion's: each shows the groups of its work, has its own bar of
 * favourites and, clicked, its plan at the right (Plan de dressing, Plan de cuisine); the choice is remembered.
 */
import { bindFavorites } from "./favorites";
import { catalogue } from "./tool-catalogue";
import { draggableTool, registerBar } from "./tool-drag";

const HIDDEN = "cao.ribbon-hidden.";
const ORDER = "cao.ribbon-order.";
const UPGRADED = "cao.ribbon-groups-3";
const TAB = "cao.ribbon-tab";
/** Attributes that identify a tool button, in order of preference. */
const KEY_ATTRIBUTES = ["data-action", "data-sketch-tool", "data-sketch-command", "data-workshop", "data-new-sketch", "data-select-plus", "data-select-window", "data-section", "data-linked-copy", "data-library", "data-snap", "data-hidden-joints", "data-display-menu", "data-sketch-bodies"];

/** Tools put away (in their group's menu only) until the user pins them. */
const DEFAULT_HIDDEN: Record<string, string[]> = {
  model: [
    "data-action:revolve", "data-action:rect-array", "data-workshop:tech-plan", "data-workshop:worktop-bars", "data-action:snack", "data-workshop:plinth-tech", "data-workshop:inventory", "data-workshop:high-storage", "data-workshop:board",
    "data-action:hollow", "data-action:split-sides", "data-action:copy-ops", "data-action:bend-onto", "data-action:accessory", "data-workshop:furniture", "data-workshop:purchase-orders", "data-action:paneling", "data-action:loft", "data-action:modifier", "data-action:ffd", "data-action:swap", "data-action:spacing", "data-action:combine",
    "data-action:stretch", "data-action:rotate",
    "data-action:sweep", "data-action:extrude-path", "data-action:assembly", "data-action:overlap", "data-action:layout-copy", "data-workshop:replace", "data-workshop:standard", "data-action:cutout", "data-action:mate", "data-workshop:render", "data-workshop:scenes", "data-workshop:motion",
    "data-workshop:import-parts", "data-workshop:nesting", "data-workshop:offcuts", "data-workshop:batch", "data-workshop:drawing", "data-workshop:dxf", "data-workshop:gcode", "data-workshop:labels", "data-workshop:share",
    "data-action:dressing", "data-workshop:door-fronts", "data-workshop:edge-paint", "data-workshop:niche-copy", "data-workshop:niche-align", "data-workshop:dressing-style", "data-workshop:production-folder", "data-action:oi-intersect", "data-hidden-joints:", "data-library:", "data-workshop:hardware", "data-workshop:assembly", "data-workshop:sheets", "data-workshop:drill-templates", "data-workshop:progress", "data-workshop:check", "data-workshop:sag", "data-workshop:weight",
  ],
  sketch: [
    "data-sketch-tool:rectangle-center", "data-sketch-tool:rectangle-3pt", "data-sketch-tool:circle-2pt", "data-sketch-tool:circle-3pt", "data-sketch-tool:arc-3pt", "data-sketch-tool:arc-tangent",
    "data-sketch-tool:polygon", "data-sketch-tool:slot", "data-sketch-tool:oval", "data-sketch-tool:curve", "data-sketch-tool:text",
    "data-sketch-command:importdxf", "data-sketch-command:underlay", "data-sketch-command:skmirror", "data-sketch-command:skrotate", "data-sketch-command:skscale", "data-sketch-command:skpolar", "data-sketch-command:autodim", "data-sketch-command:skselectsimilar", "data-sketch-command:skselectchain", "data-sketch-command:joineryshapes", "data-sketch-tool:stretch", "data-sketch-command:dimRadius", "data-sketch-command:dimDiameter", "data-sketch-command:dimAngle", "data-sketch-command:dimChain", "data-sketch-command:fullydefine", "data-sketch-tool:extend", "data-sketch-tool:chamfer", "data-sketch-tool:project", "data-sketch-tool:intersect", "data-sketch-tool:break", "data-sketch-tool:array",
    "data-sketch-command:symmetric", "data-sketch-command:concentric", "data-sketch-command:fix", "data-sketch-command:pointOnCurve", "data-sketch-command:midpoint",
    "data-sketch-bodies:", "data-sketch-command:centerin",
  ],
};

/** The groups whose icons fold away first when the bar is too narrow, in that order (then the others, from the right). */
const FOLD_ORDER: Record<string, string[]> = {
  model: ["Client", "Fabrication", "Atelier", "Modifier", "Pièce", "Meuble", "Créer", "Cuisine", "Dressing"],
  sketch: ["Affichage", "Contraintes", "Cotes", "Modifier", "Créer"],
};

/** The groups each tab of the model's bar shows. */
const TABS: Record<string, string[]> = {
  design: ["Créer", "Modifier", "Atelier", "Fabrication", "Client"],
  dressing: ["Modifier", "Pièce", "Dressing", "Fabrication", "Client"],
  kitchen: ["Modifier", "Pièce", "Cuisine", "Meuble", "Fabrication", "Client"],
};

/** Each onglet's own bar of favourites (Conception 3D keeps the model's), and what it starts with. */
const TAB_FAVORITES: Record<string, { name: string; seed: string[] }> = {
  design: { name: "model", seed: [] },
  dressing: { name: "model-dressing", seed: ["data-workshop:dressing-plan", "data-action:partition", "data-action:shelves", "data-action:penderie", "data-action:tiroirs", "data-action:fronts", "data-workshop:dressing-style", "data-workshop:doors-open", "data-action:push"] },
  kitchen: { name: "model-kitchen", seed: ["data-workshop:kitchen-plan", "data-workshop:kitchen-units", "data-action:appliances", "data-action:cutout", "data-workshop:doors-open", "data-workshop:drawers-open", "data-action:push", "data-action:move"] },
};

/** A stable name for a tool button ("data-action:array", "data-action:view:front"), or null for any other button. */
export function keyOf(button: HTMLElement): string | null {
  for (const attribute of KEY_ATTRIBUTES) {
    if (!button.hasAttribute(attribute)) continue;
    const view = button.getAttribute("data-view");
    return `${attribute}:${button.getAttribute(attribute) ?? ""}${view ? `:${view}` : ""}`;
  }
  return null;
}

/** The order of the groups from before Menuiserie split and Atelier gave up two: the furniture after Modifier. */
export function upgradedOrder(order: readonly string[]): string[] {
  const done = order.filter((n) => n !== "Menuiserie" && n !== "Pièce" && n !== "Meuble" && n !== "Dressing" && n !== "Fabrication" && n !== "Client").flatMap((n) => (n === "Atelier" ? [n, "Fabrication", "Client"] : [n]));
  done.splice(done.indexOf("Modifier") + 1, 0, "Pièce", "Cuisine", "Meuble", "Dressing");
  return done;
}

/** Once, what this browser remembers from then: the order of the groups, and the tools that came out or went in. */
function upgradeRibbon(): void {
  try {
    if (localStorage.getItem(UPGRADED)) return;
    localStorage.setItem(UPGRADED, "1");
    const order = readOrder("model");
    if (order.length) writeOrder("model", upgradedOrder(order));
    if (localStorage.getItem(HIDDEN + "model") === null) return;
    const hidden = readHidden("model");
    for (const key of ["data-action:room", "data-action:module", "data-action:niche", "data-workshop:dressing-plan"]) hidden.delete(key);
    writeHidden("model", hidden.add("data-action:dressing"));
  } catch {
    // Not remembered: the default.
  }
}

function readHidden(name: string): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN + name);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((k): k is string => typeof k === "string"));
  } catch {
    // Unreadable: the default.
  }
  return new Set(DEFAULT_HIDDEN[name] ?? []);
}

function writeHidden(name: string, hidden: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN + name, JSON.stringify([...hidden]));
  } catch {
    // Not remembered: only this session.
  }
}

function readOrder(name: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ORDER + name) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function writeOrder(name: string, order: string[]): void {
  try {
    localStorage.setItem(ORDER + name, JSON.stringify(order));
  } catch {
    // Not remembered: only this visit.
  }
}

export function bindRibbonLayout(root: HTMLElement): void {
  // The former "Mes outils" bar and its layouts are gone.
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("cao.ribbon-layout.")) localStorage.removeItem(key);
  } catch {
    // Nothing to clean.
  }
  upgradeRibbon();
  for (const toolbar of root.querySelectorAll<HTMLElement>("[data-ribbon]")) bindToolbar(toolbar, toolbar.dataset.ribbon as string);
}

function bindToolbar(toolbar: HTMLElement, name: string): void {
  const hidden = readHidden(name);
  const groups = [...toolbar.querySelectorAll<HTMLElement>(".ribbon-group")].map((group) => {
    const tools = [...group.querySelectorAll<HTMLElement>(".ribbon-row > button")].flatMap((button) => {
      const key = keyOf(button);
      return key ? [{ key, button }] : [];
    });
    return { group, name: group.getAttribute("aria-label") ?? "", tools };
  });

  /** Tools folded away for lack of room (not remembered: the window's width decides). */
  const folded = new Set<string>();
  /** Put-away and folded tools leave the row; a group whose icons are all gone keeps only its menu. */
  const tidyGroup = (g: (typeof groups)[number]) => {
    for (const t of g.tools) t.button.hidden = hidden.has(t.key) || folded.has(t.key);
    const row = g.group.querySelector<HTMLElement>(".ribbon-row");
    g.group.dataset.empty = String(!!row && ![...row.children].some((c) => !(c as HTMLElement).hidden));
  };
  const tidy = () => groups.forEach(tidyGroup);

  /** Folds icons away, one at a time in FOLD_ORDER, until the bar fits on its line. */
  const fit = () => {
    folded.clear();
    tidy();
    const overflows = () => toolbar.clientWidth > 0 && toolbar.scrollWidth > toolbar.clientWidth + 1;
    if (!overflows()) return;
    const listed = FOLD_ORDER[name] ?? [];
    const ordered = [...listed.flatMap((n) => groups.filter((g) => g.name === n)), ...groups.filter((g) => !listed.includes(g.name)).reverse()];
    for (const g of ordered) {
      if (g.group.hidden) continue;
      for (const t of [...g.tools].reverse()) {
        if (hidden.has(t.key)) continue;
        folded.add(t.key);
        tidyGroup(g);
        if (!overflows()) return;
      }
    }
  };
  const save = () => {
    tidy();
    writeHidden(name, hidden);
    fit();
  };
  tidy();

  const host = document.querySelector<HTMLElement>("#main");
  const favorites = host
    ? bindFavorites(host, name, new Map([
        ...groups.flatMap((g) => g.tools.map((t): [string, HTMLElement] => [t.key, t.button])),
        // The model's favourites may hold the tools of the column beside the view too.
        ...(name === "model" ? catalogue(document.body).map((t): [string, HTMLElement] => [t.key, t.button]) : []),
      ]), name === "sketch" ? "hidden group-data-[mode=sketch]/editor:flex" : "flex group-data-[mode=sketch]/editor:hidden")
    : null;

  let open: { caption: HTMLElement; close: () => void } | null = null;
  const label = (button: HTMLElement) => button.getAttribute("aria-label") ?? button.dataset.tip ?? button.title ?? "";

  // Dragged out of the bar, an icon is put away in its group's menu; dragged back onto it, it is shown again.
  const own = new Set(groups.flatMap((g) => g.tools.map((t) => t.key)));
  for (const t of groups.flatMap((g) => g.tools)) {
    draggableTool(t.button, () => ({ key: t.key, label: label(t.button), bar: toolbar, keep: true, remove: () => (hidden.add(t.key), save()) }));
  }
  registerBar({
    element: toolbar,
    accepts: (key) => own.has(key),
    mark: (event) => (event ? (toolbar.dataset.drop = "end") : delete toolbar.dataset.drop),
    drop: (key) => {
      hidden.delete(key);
      save();
    },
  });

  const show = (g: (typeof groups)[number], caption: HTMLElement): void => {
    open?.close();
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `Outils : ${g.name}`);
    menu.className = "ribbon-menu";
    const render = () => {
      const rows = g.tools.map(({ key, button }) => {
        const pinned = !hidden.has(key);
        const row = document.createElement("div");
        row.className = "ribbon-menu-item";
        const run = document.createElement("button");
        run.type = "button";
        run.setAttribute("role", "menuitem");
        run.className = "ribbon-menu-run";
        // Its key: a new tool's line has the dot too (ui/new-tools.ts).
        run.dataset.newTool = key;
        run.disabled = (button as HTMLButtonElement).disabled;
        const icon = button.querySelector("svg")?.cloneNode(true);
        const text = document.createElement("span");
        text.textContent = label(button);
        run.append(...(icon ? [icon] : []), text);
        run.addEventListener("click", () => {
          open?.close();
          button.click();
        });
        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "ribbon-menu-toggle";
        pin.setAttribute("aria-pressed", String(pinned));
        pin.title = pinned ? "Ranger dans ce menu (retirer de la barre)" : "Afficher dans la barre";
        pin.setAttribute("aria-label", `${pinned ? "Retirer de la barre" : "Afficher dans la barre"} : ${label(button)}`);
        pin.textContent = "📌";
        pin.addEventListener("click", () => {
          if (pinned) hidden.add(key);
          else hidden.delete(key);
          save();
          render();
        });
        const star = document.createElement("button");
        star.type = "button";
        star.className = "ribbon-menu-toggle";
        const favorite = favorites?.has(key) ?? false;
        star.setAttribute("aria-pressed", String(favorite));
        star.title = favorite ? "Retirer de Mes outils (barre à gauche de la vue)" : "Ajouter à Mes outils (barre à gauche de la vue)";
        star.setAttribute("aria-label", `${favorite ? "Retirer de Mes outils" : "Ajouter à Mes outils"} : ${label(button)}`);
        star.textContent = "⭐";
        star.addEventListener("click", () => {
          favorites?.toggle(key);
          render();
        });
        row.append(run, star, pin);
        return row;
      });
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "ribbon-menu-reset";
      reset.textContent = "Par défaut";
      reset.title = "Remettre ce groupe comme à l'origine";
      reset.addEventListener("click", () => {
        const defaults = new Set(DEFAULT_HIDDEN[name] ?? []);
        for (const { key } of g.tools) {
          if (defaults.has(key)) hidden.add(key);
          else hidden.delete(key);
        }
        save();
        render();
      });
      const hint = document.createElement("p");
      hint.className = "ribbon-menu-hint";
      hint.textContent = "⭐ : dans Mes outils (à gauche de la vue). 📌 : dans la barre du haut.";
      const footer = document.createElement("div");
      footer.className = "ribbon-menu-footer";
      footer.append(hint, reset);
      menu.replaceChildren(...rows, footer);
    };
    render();
    document.body.append(menu);
    const r = caption.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${r.bottom + 4}px`;
    caption.setAttribute("aria-expanded", "true");
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node) && !caption.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const close = () => {
      menu.remove();
      caption.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      open = null;
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    open = { caption, close };
    menu.querySelector<HTMLElement>(".ribbon-menu-run:not(:disabled)")?.focus();
  };

  for (const g of groups) {
    const old = g.group.querySelector<HTMLElement>(".ribbon-caption");
    // A group of one tool needs no menu.
    if (!old || g.tools.length < 2) continue;
    const caption = document.createElement("button");
    caption.type = "button";
    caption.className = "ribbon-caption ribbon-caption-menu";
    caption.textContent = `${old.textContent ?? g.name} ▾`;
    caption.setAttribute("aria-label", `Outils du groupe ${g.name}`);
    caption.setAttribute("aria-haspopup", "menu");
    caption.setAttribute("aria-expanded", "false");
    caption.title = `Tous les outils « ${g.name} » ; l'épingle choisit ceux de la barre`;
    caption.addEventListener("click", () => (open?.caption === caption ? open.close() : show(g, caption)));
    old.replaceWith(caption);
  }
  // ---- groups in the order the user chose (drag a group's name) ---------------------------
  /** One separator between two groups, wherever they are now. */
  const separate = () => {
    for (const sep of [...toolbar.querySelectorAll(":scope > .ribbon-sep")]) sep.remove();
    const placed = [...toolbar.querySelectorAll<HTMLElement>(":scope > .ribbon-group:not([hidden])")];
    placed.slice(1).forEach((g) => g.before(Object.assign(document.createElement("span"), { className: "ribbon-sep", ariaHidden: "true" })));
  };
  const saveOrder = () => writeOrder(name, [...toolbar.querySelectorAll<HTMLElement>(":scope > .ribbon-group")].map((g) => g.getAttribute("aria-label") ?? ""));
  const stored = readOrder(name);
  if (stored.length) {
    const rank = (g: (typeof groups)[number]) => (stored.includes(g.name) ? stored.indexOf(g.name) : stored.length + groups.indexOf(g));
    for (const g of [...groups].sort((a, b) => rank(a) - rank(b))) toolbar.append(g.group);
    separate();
  }
  let dragged: HTMLElement | null = null;
  for (const g of groups) {
    const caption = g.group.querySelector<HTMLElement>(".ribbon-caption-menu");
    if (!caption) continue;
    caption.draggable = true;
    caption.title += " — glissez le nom pour déplacer le groupe";
    caption.addEventListener("dragstart", (event) => {
      dragged = g.group;
      open?.close();
      event.dataTransfer?.setData("text/plain", g.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => g.group.classList.add("opacity-40"));
    });
    caption.addEventListener("dragend", () => {
      g.group.classList.remove("opacity-40");
      dragged = null;
      separate();
      saveOrder();
      fit();
    });
  }
  toolbar.addEventListener("dragover", (event) => {
    if (!dragged) return;
    event.preventDefault();
    const over = (event.target as HTMLElement).closest<HTMLElement>(".ribbon-group");
    if (!over || over === dragged || over.parentElement !== toolbar) return;
    const box = over.getBoundingClientRect();
    if (event.clientX < box.left + box.width / 2) over.before(dragged);
    else over.after(dragged);
  });
  toolbar.addEventListener("drop", (event) => {
    if (dragged) event.preventDefault();
  });

  // ---- the tabs of the bar --------------------------------------------------------------
  const tabs = name === "model" ? [...document.querySelectorAll<HTMLElement>("[data-ribbon-tab]")] : [];
  const choose = (tab: HTMLElement) => {
    const shown = TABS[tab.dataset.ribbonTab as string] ?? [];
    for (const g of groups) g.group.hidden = !shown.includes(g.name);
    for (const t of tabs) t.setAttribute("aria-selected", String(t === tab));
    const bar = TAB_FAVORITES[tab.dataset.ribbonTab as string];
    if (bar) favorites?.use(bar.name, bar.seed);
    separate();
    fit();
  };
  // The project's space (a kitchen, a dressing, a 3D design): its tab; another tab opens a project of its own
  // (app/space-switch.ts), unless its tools were borrowed for this project.
  // « cao.free-spaces »: every tab in every project, as before the spaces (the older browser tests).
  let free = false;
  try {
    free = localStorage.getItem("cao.free-spaces") === "1";
  } catch {
    // Spaces kept apart.
  }
  const space = free ? undefined : document.getElementById("editor")?.dataset.space;
  const borrowed = new Set<string>(space ? [space] : []);
  document.addEventListener("cad:use-space", (event) => {
    const wanted = (event as CustomEvent<string>).detail;
    const tab = tabs.find((t) => t.dataset.ribbonTab === wanted);
    if (!tab) return;
    borrowed.add(wanted);
    tab.click();
  });
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      open?.close();
      const wanted = tab.dataset.ribbonTab as string;
      if (space && !borrowed.has(wanted)) {
        document.dispatchEvent(new CustomEvent("cad:other-space", { detail: wanted }));
        return;
      }
      choose(tab);
      // Its work's panel, at the right (app/tab-panels.ts).
      document.dispatchEvent(new CustomEvent("cad:ribbon-tab", { detail: tab.dataset.ribbonTab }));
      try {
        localStorage.setItem(TAB, tab.dataset.ribbonTab as string);
      } catch {
        // Not remembered: only this visit.
      }
    });
  }
  let first: string | null = null;
  try {
    first = localStorage.getItem(TAB);
  } catch {
    // The first tab.
  }
  // A kitchen or a dressing just made from the home page: its tab (?onglet=kitchen), then kept as any choice.
  const asked = new URLSearchParams(location.search).get("onglet");
  if (asked && tabs.some((t) => t.dataset.ribbonTab === asked)) {
    first = asked;
    try {
      localStorage.setItem(TAB, asked);
    } catch {
      // Only this visit.
    }
  }
  // A project of a space opens on its tab.
  if (space && tabs.some((t) => t.dataset.ribbonTab === space)) first = space;
  const opening = tabs.find((t) => t.dataset.ribbonTab === first) ?? tabs[0];
  if (opening) choose(opening);

  let width = -1;
  new ResizeObserver(() => {
    if (toolbar.clientWidth === width) return;
    width = toolbar.clientWidth;
    fit();
  }).observe(toolbar);
  fit();
}
