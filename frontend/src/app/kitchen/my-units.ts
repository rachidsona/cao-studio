/**
 * « Mes meubles », en tête du panneau Meubles de cuisine : ses propres caissons, ajoutés à la liste.
 * - On les décrit : nom, sorte (bas, haut, colonne), cotes, socle, façades, étagères.
 * - Ou on reprend le caisson sélectionné dans le projet.
 *
 * Un clic sur l'un d'eux le pose dans la cuisine comme ceux du commerce (document/kitchen-catalog.ts) ; ✕ le retire
 * de la liste. La liste est gardée dans ce navigateur, pour tous les projets.
 */
import { KINDS, customEntry, entryFromCabinet, type CatalogEntry, type UnitKind } from "../../document/kitchen-catalog";
import type { CabinetFeature, CadDocument, DisplayUnit } from "../../document/types";
import { formatLength, fromDisplay, toDisplay } from "../../measurements/units";
import { el } from "../../ui/dom";

const KEY = "cao.kitchen-own-units";
const FIELD = "h-7 w-full min-w-0 border border-gray-300 bg-white px-1.5 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-7 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

/** One's own units, kept in this browser. */
export function myUnits(): CatalogEntry[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? (list as CatalogEntry[]).filter((e) => e && typeof e.id === "string" && e.custom && KINDS[e.kind]) : [];
  } catch {
    return [];
  }
}

function save(list: CatalogEntry[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

interface Host {
  doc(): CadDocument;
  unit(): DisplayUnit;
  selected(): CabinetFeature | null;
  add(entry: CatalogEntry): void;
  notify(message: string, kind: "success" | "error" | "info"): void;
  refresh(): void;
}

/** What is being typed, kept across redraws of the panel. */
let draft: Omit<CatalogEntry, "id" | "custom"> = { name: "", kind: "base", width: 600, height: KINDS.base.height, depth: KINDS.base.depth, plinth: KINDS.base.plinth, layout: "door", drawers: 3, shelves: 1 };
let open = false;

export function myUnitsSection(host: Host): HTMLElement {
  const unit = host.unit();
  const list = myUnits();
  const keep = (next: CatalogEntry[], message: string) => {
    if (!save(next)) return host.notify("Impossible d'enregistrer la liste dans ce navigateur.", "error");
    host.notify(message, "success");
    host.refresh();
  };
  const rows = list.map((e) => {
    const put = el("button", { type: "button", class: `${BUTTON} min-w-0 flex-1 truncate text-left`, "data-own-unit": e.id, title: `Ajouter « ${e.name} » dans la cuisine` }, `${e.name} · ${formatLength(e.width, unit)} × ${formatLength(e.height ?? KINDS[e.kind].height, unit)}`);
    put.addEventListener("click", () => host.add(e));
    const drop = el("button", { type: "button", class: `${BUTTON} w-7 px-0`, "aria-label": `Retirer « ${e.name} » de ma liste` }, "✕");
    drop.addEventListener("click", () => keep(myUnits().filter((x) => x.id !== e.id), `« ${e.name} » retiré de vos meubles.`));
    return el("div", { class: "flex gap-1" }, put, drop);
  });
  const selected = host.selected();
  const fromSelection = selected ? el("button", { type: "button", class: `${BUTTON} w-full` }, `Ajouter « ${selected.name} » à ma liste`) : null;
  fromSelection?.addEventListener("click", () => {
    const e = entryFromCabinet(host.doc(), selected!);
    keep([...myUnits(), e], `« ${e.name} » est dans vos meubles.`);
  });
  const toggle = el("button", { type: "button", class: `${BUTTON} w-full`, "aria-expanded": String(open) }, open ? "Fermer le formulaire" : "＋ Décrire un nouveau meuble");
  toggle.addEventListener("click", () => ((open = !open), host.refresh()));
  return el(
    "section",
    { class: "space-y-1.5", "data-my-units": "" },
    el("h3", { class: "font-semibold text-gray-500 uppercase" }, "Mes meubles"),
    ...(rows.length ? rows : [el("p", { class: "text-[11px] text-gray-500" }, "Aucun pour l'instant : décrivez-en un, ou reprenez le caisson sélectionné.")]),
    fromSelection,
    toggle,
    open ? form(host, unit, (e) => keep([...myUnits(), e], `« ${e.name} » est dans vos meubles ; un clic le pose dans la cuisine.`)) : null,
  );
}

function form(host: Host, unit: DisplayUnit, done: (e: CatalogEntry) => void): HTMLElement {
  const stop = (input: HTMLElement) => input.addEventListener("keydown", (k) => k.stopPropagation());
  const line = (label: string, input: HTMLElement) => el("label", { class: "grid grid-cols-[6.5rem_1fr] items-center gap-1" }, el("span", { class: "text-gray-600 dark:text-gray-300" }, label), input);
  const length = (label: string, key: "width" | "height" | "depth" | "plinth") => {
    const input = el("input", { type: "number", step: "any", min: "0", class: FIELD, value: String(Number(toDisplay(draft[key] ?? 0, unit).toFixed(2))), "aria-label": label });
    stop(input);
    input.addEventListener("change", () => (draft = { ...draft, [key]: fromDisplay(Number(input.value), unit) }));
    return line(`${label} (${unit})`, input);
  };
  const count = (label: string, key: "shelves" | "drawers") => {
    const input = el("input", { type: "number", step: "1", min: "0", class: FIELD, value: String(draft[key] ?? 0), "aria-label": label });
    stop(input);
    input.addEventListener("change", () => (draft = { ...draft, [key]: Math.max(0, Math.round(Number(input.value))) }));
    return line(label, input);
  };
  const name = el("input", { type: "text", maxlength: "60", class: FIELD, value: draft.name, placeholder: "Bas poubelle 450", "aria-label": "Nom du meuble" });
  stop(name);
  name.addEventListener("input", () => (draft = { ...draft, name: name.value }));
  const kind = el("select", { class: FIELD, "aria-label": "Sorte de meuble" }, ...(["base", "wall", "tall"] as const).map((k) => el("option", { value: k, selected: draft.kind === k }, KINDS[k].label.replace(/^Meubles /, "").replace(/^./, (c) => c.toUpperCase()))));
  // A new sort: its usual height, depth and plinth.
  kind.addEventListener("change", () => {
    const k = kind.value as UnitKind;
    draft = { ...draft, kind: k, height: KINDS[k].height, depth: KINDS[k].depth, plinth: KINDS[k].plinth };
    host.refresh();
  });
  const fronts = el("select", { class: FIELD, "aria-label": "Façades" }, ...([["door", "Une porte"], ["doors", "Deux portes"], ["drawers", "Tiroirs"], ["none", "Aucune (niche, électroménager)"]] as const).map(([v, t]) => el("option", { value: v, selected: draft.layout === v }, t)));
  fronts.addEventListener("change", () => ((draft = { ...draft, layout: fronts.value as CatalogEntry["layout"] }), host.refresh()));
  const ok = el("button", { type: "button", class: "h-8 w-full btn-accent px-3 text-xs font-medium" }, "Ajouter à ma liste");
  ok.addEventListener("click", () => {
    const made = customEntry(draft);
    if (typeof made === "string") return host.notify(made, "error");
    open = false;
    draft = { ...draft, name: "" };
    done(made);
  });
  return el(
    "div",
    { class: "space-y-1 border border-gray-200 p-1.5 dark:border-gray-700", "data-own-form": "" },
    line("Nom", name),
    line("Sorte", kind),
    length("Largeur", "width"),
    length("Hauteur", "height"),
    length("Profondeur", "depth"),
    length("Socle", "plinth"),
    line("Façades", fronts),
    draft.layout === "drawers" ? count("Tiroirs", "drawers") : null,
    count("Étagères", "shelves"),
    ok,
  );
}
