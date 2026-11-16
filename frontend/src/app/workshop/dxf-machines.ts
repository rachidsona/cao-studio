/**
 * Les calques du DXF pour la commande numérique, réglés comme la machine les attend : un modèle tout fait
 * (io/dxf.ts LAYER_PROFILES : générique, woodWOP, ABF, Vectric…), ou une machine de l'atelier enregistrée sous son nom
 * (« Weeke de l'atelier »), chacun avec ses trois noms de calques (contours, poches et rainures, perçages) et ses
 * contours enchaînés ou non. Le dernier réglage et les machines sont gardés par le navigateur. Le panneau qui les
 * règle est celui de l'export DXF (workshop-cnc.ts).
 */
import { DEFAULT_POCKET, LAYER_PROFILES, layerName, type LayerProfile } from "../../io/dxf";
import { el } from "../../ui/dom";

const LAYERS_KEY = "cao.dxf-layers";
const MACHINES_KEY = "cao.dxf-machines";

export interface Machine {
  name: string;
  profile: LayerProfile;
}

const clean = (p: Partial<LayerProfile> | null | undefined): LayerProfile => {
  const base = LAYER_PROFILES[0]!.profile;
  const text = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
  return { contour: text(p?.contour, base.contour), drill: text(p?.drill, base.drill), pocket: text(p?.pocket, DEFAULT_POCKET), chain: p?.chain === true };
};

/** The layer naming of the machine, as last set. */
export function loadLayers(): LayerProfile {
  try {
    return clean(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? "null") as Partial<LayerProfile> | null);
  } catch {
    return clean(null);
  }
}

export function saveLayers(profile: LayerProfile): void {
  try {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(profile));
  } catch {
    // Not remembered: only this time.
  }
}

/** The machines of the workshop, by name. */
export function loadMachines(): Machine[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MACHINES_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((m: unknown) => {
      const r = m as { name?: unknown; profile?: Partial<LayerProfile> };
      return typeof r?.name === "string" && r.name.trim() ? [{ name: r.name.trim().slice(0, 60), profile: clean(r.profile) }] : [];
    });
  } catch {
    return [];
  }
}

/** The machines with this one kept under its name (replacing one of the same name). */
export function withMachine(machines: readonly Machine[], name: string, profile: LayerProfile): Machine[] {
  const n = name.trim().slice(0, 60);
  if (!n) return [...machines];
  return [...machines.filter((m) => m.name.toLowerCase() !== n.toLowerCase()), { name: n, profile: clean(profile) }].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function saveMachines(machines: readonly Machine[]): void {
  try {
    localStorage.setItem(MACHINES_KEY, JSON.stringify(machines));
  } catch {
    // Not remembered: only this visit.
  }
}

const same = (a: LayerProfile, b: LayerProfile) => a.contour === b.contour && a.drill === b.drill && (a.pocket ?? DEFAULT_POCKET) === (b.pocket ?? DEFAULT_POCKET) && !!a.chain === !!b.chain;

/** What a layer of each kind is called with this naming, on a 19 mm board. */
export function layerExample(p: LayerProfile): string {
  return `Contour d'un panneau de 19 mm → ${layerName(p.contour, { t: 19 })} ; rainure de 8 mm → ${layerName(p.pocket ?? DEFAULT_POCKET, { z: 8, t: 19 })} ; perçage Ø8 de 12 mm → ${layerName(p.drill, { d: 8, z: 12, t: 19 })}.`;
}

const FIELD = "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";

/** The panel that sets the naming: `profile` is changed in place, the caller exports with it. */
export function layersPanel(profile: LayerProfile): HTMLElement {
  let machines = loadMachines();
  const preset = el("select", { class: FIELD, "aria-label": "Machine ou modèle de calques", "data-dxf-preset": "" });
  const fill = () => {
    const chosen = [...LAYER_PROFILES.map((p) => ({ value: `preset:${p.id}`, profile: p.profile })), ...machines.map((m) => ({ value: `machine:${m.name}`, profile: m.profile }))].find((o) => same(o.profile, profile))?.value ?? "custom";
    preset.replaceChildren(
      el("optgroup", { label: "Modèles" }, ...LAYER_PROFILES.map((p) => el("option", { value: `preset:${p.id}` }, p.label))),
      ...(machines.length ? [el("optgroup", { label: "Mes machines" }, ...machines.map((m) => el("option", { value: `machine:${m.name}` }, m.name)))] : []),
      el("option", { value: "custom" }, "Personnalisé"),
    );
    preset.value = chosen;
    remove.hidden = !chosen.startsWith("machine:");
  };
  const text = (label: string, key: "contour" | "pocket" | "drill") => {
    const input = el("input", { type: "text", class: `${FIELD} font-mono`, value: profile[key] ?? "", "aria-label": label, spellcheck: "false" });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("input", () => {
      profile[key] = input.value.trim() || (key === "pocket" ? DEFAULT_POCKET : LAYER_PROFILES[0]!.profile[key]);
      changed();
    });
    return input;
  };
  const contour = text("Calque des contours", "contour");
  const pocket = text("Calque des poches et rainures", "pocket");
  const drill = text("Calque des perçages", "drill");
  const chain = el("input", { type: "checkbox", checked: !!profile.chain, "aria-label": "Contours enchaînés" });
  chain.addEventListener("change", () => {
    profile.chain = chain.checked;
    changed();
  });
  const sample = el("p", { class: "text-gray-600 dark:text-gray-300", "data-dxf-example": "" });
  const name = el("input", { type: "text", class: FIELD, placeholder: "Nom de la machine (Weeke de l'atelier…)", "aria-label": "Nom de la machine" });
  name.addEventListener("keydown", (e) => e.stopPropagation());
  const keep = el("button", { type: "button", class: "tool-btn h-8 shrink-0 border border-gray-300 px-2 text-xs dark:border-gray-600", "data-dxf-save-machine": "" }, "Enregistrer la machine");
  const remove = el("button", { type: "button", class: "tool-btn h-8 shrink-0 border border-gray-300 px-2 text-xs text-red-700 dark:border-gray-600 dark:text-red-400", "data-dxf-remove-machine": "" }, "Retirer");
  const show = () => {
    contour.value = profile.contour;
    pocket.value = profile.pocket ?? DEFAULT_POCKET;
    drill.value = profile.drill;
    chain.checked = !!profile.chain;
    sample.textContent = layerExample(profile);
  };
  const changed = () => {
    sample.textContent = layerExample(profile);
    fill();
  };
  preset.addEventListener("change", () => {
    const [kind, id] = [preset.value.slice(0, preset.value.indexOf(":")), preset.value.slice(preset.value.indexOf(":") + 1)];
    const chosen = kind === "preset" ? LAYER_PROFILES.find((p) => p.id === id)?.profile : kind === "machine" ? machines.find((m) => m.name === id)?.profile : undefined;
    if (!chosen) return;
    Object.assign(profile, clean(chosen));
    if (kind === "machine") name.value = id;
    show();
    fill();
  });
  keep.addEventListener("click", () => {
    if (!name.value.trim()) return name.focus();
    machines = withMachine(machines, name.value, profile);
    saveMachines(machines);
    fill();
  });
  remove.addEventListener("click", () => {
    machines = machines.filter((m) => `machine:${m.name}` !== preset.value);
    saveMachines(machines);
    fill();
  });
  fill();
  show();
  const row = (label: string, input: HTMLElement) => el("label", { class: "grid gap-0.5" }, label, input);
  return el(
    "div",
    { class: "space-y-2", "data-dxf-layers": "" },
    el("p", { class: "text-gray-600 dark:text-gray-300" }, "Beaucoup de logiciels de commande numérique usinent d'après le nom du calque : choisissez votre machine, ou réglez les noms comme son post-processeur les attend. {d} : diamètre, {z} : profondeur, {t} : épaisseur du panneau (en mm)."),
    preset,
    row("Contours (découpe)", contour),
    row("Poches et rainures (ne traversent pas)", pocket),
    row("Perçages", drill),
    el("label", { class: "flex items-center gap-2" }, chain, "Contours enchaînés en polylignes fermées, dans le sens des aiguilles d'une montre (compensation à droite : la fraise dans la chute)"),
    sample,
    el("div", { class: "flex gap-1.5" }, name, keep, remove),
    el("p", { class: "text-2xs text-gray-500" }, "Seuls le contour woodWOP (FK, Z sous le panneau, outil, compensation) et les noms ABF suivent ce que leurs éditeurs ou utilisateurs publient ; les autres noms sont des points de départ. Vérifiez le premier fichier sur la machine avant de lancer une série."),
  );
}
