/**
 * La barre d'étapes des onglets Cuisine et Dressing, comme dans un logiciel de cuisiniste : Pièce → Plan → Meubles →
 * Électroménager → Finitions → Fabrication → Client (pour un dressing : Pièce → Plan → Aménagement → Façades →
 * Finitions → Fabrication → Client) ; les deux dernières séparent ce qui va à l'atelier de ce qui va au client. Chaque étape montre ses outils, avec leur nom, à la place du ruban entier ; « Tous les outils » le
 * remet (retenu par le navigateur). Une étape faite (une pièce posée, un plan, des meubles…) prend sa coche ; l'étape
 * choisie est retenue pour chaque onglet. Les boutons lancent les outils du ruban, même repliés, et en reprennent l'état.
 */
import type { CadDocument } from "../document/types";
import { el } from "../ui/dom";
import { keyOf } from "../ui/ribbon-layout";
import type { Editor } from "./editor";

interface Step {
  id: string;
  label: string;
  /** The ribbon's tools of this step, by key (`data-action:room`…). */
  tools: string[];
  /** Done in this document: the step gets its tick. */
  done?: (doc: CadDocument) => boolean;
  /** What opens with the step, when it is chosen (its panel). */
  open?: string;
}

const has = (doc: CadDocument, ...types: string[]) => doc.features.some((f) => types.includes(f.type));
const room: Step = { id: "room", label: "Pièce", tools: ["data-action:room", "data-workshop:layers"], done: (d) => has(d, "room") };
/** What goes to the workshop: checked, then cut, machined, labelled, assembled. */
const check: Step = { id: "check", label: "Fabrication", tools: ["data-workshop:check", "data-workshop:cutlist", "data-workshop:nesting", "data-workshop:production-folder", "data-workshop:drawing", "data-workshop:dxf", "data-workshop:labels", "data-workshop:assembly"] };
/** What goes to the client: the quote, its variants, the pictures, the link to say yes. */
const quote: Step = { id: "quote", label: "Client", tools: ["data-workshop:quote", "data-workshop:variants", "data-workshop:render", "data-workshop:scenes", "data-workshop:share", "data-workshop:comments"] };

export const STEPS: Record<string, Step[]> = {
  kitchen: [
    room,
    { id: "plan", label: "Plan", tools: ["data-workshop:kitchen-plan", "data-action:kitchen"], done: (d) => d.features.some((f) => f.type === "sketch" && !!f.kitchenPlan), open: '[data-workshop="kitchen-plan"]' },
    { id: "units", label: "Meubles", tools: ["data-workshop:kitchen-units", "data-action:cabinet", "data-action:fronts", "data-action:push", "data-action:move", "data-workshop:doors-open", "data-workshop:drawers-open"], done: (d) => has(d, "cabinet") },
    { id: "appliances", label: "Électroménager", tools: ["data-action:appliances", "data-action:cutout"], done: (d) => has(d, "appliance") },
    { id: "finish", label: "Finitions", tools: ["data-workshop:material", "data-workshop:appearance", "data-workshop:replace", "data-action:trim", "data-action:panels", "data-action:lighting", "data-workshop:hardware"], done: (d) => has(d, "trim") },
    check,
    quote,
  ],
  dressing: [
    room,
    { id: "plan", label: "Plan", tools: ["data-workshop:dressing-plan", "data-action:dressing"], done: (d) => d.features.some((f) => f.type === "sketch" && !!f.dressingPlan), open: '[data-workshop="dressing-plan"]' },
    { id: "layout", label: "Aménagement", tools: ["data-action:partition", "data-action:shelves", "data-action:cloisons", "data-action:niche", "data-action:penderie", "data-action:tiroirs", "data-action:accessory", "data-action:module", "data-workshop:module-palette"], done: (d) => has(d, "niche") },
    { id: "fronts", label: "Façades", tools: ["data-action:fronts", "data-workshop:dressing-style", "data-workshop:doors-open", "data-workshop:drawers-open", "data-action:push"], done: (d) => d.features.some((f) => f.type === "fronts" || (f.type === "niche" && (f.fill === "doors" || f.fill === "door"))) },
    { id: "finish", label: "Finitions", tools: ["data-workshop:material", "data-workshop:appearance", "data-workshop:replace", "data-action:trim", "data-action:lighting", "data-workshop:hardware"], done: (d) => has(d, "trim") },
    check,
    quote,
  ],
};

const RIBBON = "cao.steps-ribbon";
const CHOSEN = "cao.steps-step.";
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Only this visit.
  }
};

/** The ribbon's buttons by key (the first of a key: the one of its tab's group when there are two). */
function toolsByKey(ribbon: HTMLElement): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  for (const b of ribbon.querySelectorAll<HTMLElement>("button")) {
    const key = keyOf(b);
    if (!key) continue;
    // A tool in two groups (Façades): the one shown on this tab wins.
    const shown = !b.closest<HTMLElement>(".ribbon-group")?.hidden;
    if (!map.has(key) || shown) map.set(key, b);
  }
  return map;
}

export function bindWorkflowSteps(root: HTMLElement, editor: Editor): void {
  const ribbon = root.querySelector<HTMLElement>('[data-ribbon="model"]');
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-ribbon-tab]")];
  if (!ribbon || !tabs.length) return;
  const bar = root.querySelector<HTMLElement>("[data-steps]");
  if (!bar) return;
  let showAll = read(RIBBON) === "1";
  let watchers: MutationObserver[] = [];

  const tab = () => tabs.find((t) => t.getAttribute("aria-selected") === "true")?.dataset.ribbonTab ?? "design";
  const stepOf = (steps: Step[], t: string) => steps.find((s) => s.id === read(CHOSEN + t)) ?? steps[0]!;

  const render = () => {
    for (const w of watchers.splice(0)) w.disconnect();
    const t = tab();
    const steps = STEPS[t];
    // Conception 3D: the ribbon only.
    bar.hidden = !steps;
    // The steps' bar hidden (menu ⋯): the ribbon shows every tool of the tab.
    const stepsShown = root.dataset.stepsBar !== "off";
    ribbon.hidden = !!steps && !showAll && stepsShown;
    if (!steps) return;
    const current = stepOf(steps, t);
    const doc = editor.doc;
    const chips = steps.map((s, i) => {
      const done = s.done?.(doc) ?? false;
      const on = s === current;
      const b = el("button", { type: "button", "aria-pressed": String(on), "data-step": s.id, title: done ? `${s.label} : fait` : s.label, class: `flex h-8 items-center gap-1 border px-2 text-xs font-medium whitespace-nowrap ${on ? "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-100" : "border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"}` },
        el("span", { class: `flex size-4 items-center justify-center text-3xs ${done ? "bg-emerald-600 text-white" : "border border-current"}` }, done ? "✓" : String(i + 1)),
        s.label,
      );
      b.addEventListener("click", () => choose(s));
      return [b, i < steps.length - 1 ? el("span", { class: "text-gray-400", "aria-hidden": "true" }, "›") : null];
    }).flat().filter((n): n is HTMLElement => n !== null);
    const tools = toolsByKey(ribbon);
    const buttons = current.tools.flatMap((key) => {
      const source = tools.get(key);
      if (!source) return [];
      const label = source.getAttribute("aria-label") ?? source.title;
      const b = el("button", { type: "button", class: "tool-btn h-9 gap-1.5 px-2 text-xs", title: source.title || label, "aria-label": label, "data-step-tool": key });
      const icon = source.querySelector("svg")?.cloneNode(true) as SVGElement | undefined;
      if (icon) b.append(icon);
      b.append(el("span", { class: "whitespace-nowrap" }, label));
      const sync = () => {
        b.disabled = (source as HTMLButtonElement).disabled;
        const pressed = source.getAttribute("aria-pressed");
        if (pressed === null) b.removeAttribute("aria-pressed");
        else b.setAttribute("aria-pressed", pressed);
      };
      sync();
      const watcher = new MutationObserver(sync);
      watcher.observe(source, { attributes: true, attributeFilter: ["aria-pressed", "disabled"] });
      watchers.push(watcher);
      b.addEventListener("click", () => source.click());
      return [b];
    });
    const next = steps[steps.indexOf(current) + 1];
    const nextButton = next ? el("button", { type: "button", class: "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800", "data-step-next": "" }, `${next.label} ›`) : null;
    nextButton?.addEventListener("click", () => choose(next!));
    const all = el("button", { type: "button", "aria-pressed": String(showAll), class: "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 aria-pressed:border-sky-500 aria-pressed:bg-sky-50 dark:border-gray-600 dark:hover:bg-gray-800 dark:aria-pressed:bg-sky-950", title: "Le ruban entier, avec tous les outils de l'onglet", "data-steps-all": "" }, "Tous les outils");
    all.addEventListener("click", () => {
      showAll = !showAll;
      write(RIBBON, showAll ? "1" : "0");
      render();
    });
    bar.replaceChildren(
      el("div", { class: "flex flex-wrap items-center gap-1", role: "group", "aria-label": "Les étapes" }, ...chips),
      el("span", { class: "mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700", "aria-hidden": "true" }),
      el("div", { class: "flex flex-wrap items-center gap-0.5", role: "group", "aria-label": `Outils : ${current.label}` }, ...buttons),
      el("span", { class: "flex-1" }),
      ...(nextButton ? [nextButton] : []),
      all,
    );
  };

  const choose = (s: Step) => {
    write(CHOSEN + tab(), s.id);
    render();
    if (s.open) {
      // Its panel: shown if open, else opened.
      document.dispatchEvent(new CustomEvent("cad:ribbon-tab", { detail: tab() }));
    }
  };

  // The tab changes (a click, or the page opening on the one kept): the bar follows.
  document.addEventListener("cad:top-bars", render);
  const observer = new MutationObserver(render);
  for (const t of tabs) observer.observe(t, { attributes: true, attributeFilter: ["aria-selected"] });
  editor.afterRender(() => {
    // Only the ticks change with the model.
    for (const s of STEPS[tab()] ?? []) {
      const chip = bar.querySelector(`[data-step="${s.id}"] span`);
      const done = s.done?.(editor.doc) ?? false;
      if (chip && (chip.textContent === "✓") !== done) return render();
    }
  });
  render();
}
