/**
 * Le panneau de droite de la mise en plan : ce qui est sélectionné (une vue : son nom, son orientation, son échelle,
 * ses lignes cachées, le sens d'une coupe ; une cote : son type, son texte ; un texte ; un trait du dessin 2D : son
 * style), sinon la feuille (format, projection, cartouche, échelle du dessin 2D) — et les réglages de l'outil en cours.
 */
import { FORMATS, ORIENTATIONS, SCALES, removeView, scaleText, type DrawingSheet, type Format, type LineStyle, type Orientation } from "../../drawing/model";
import { el } from "../../ui/dom";

export interface PanelHost {
  sheet(): DrawingSheet;
  selection(): string[];
  update(change: (s: DrawingSheet) => DrawingSheet): void;
  options: { orientation: Orientation; scale: number | null; style: LineStyle };
  tool(): string;
  standardViews(): void;
  removeSheet(): void;
}

const INPUT = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";
const STYLES: [LineStyle, string][] = [["solid", "Trait continu fort"], ["thin", "Trait continu fin"], ["hidden", "Trait interrompu (caché)"], ["axis", "Trait mixte (axe)"]];

const row = (label: string, control: HTMLElement) => el("label", { class: "grid grid-cols-[6.5rem_1fr] items-center gap-2" }, el("span", { class: "text-gray-600 dark:text-gray-300" }, label), control);
const heading = (text: string) => el("h3", { class: "pt-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase" }, text);

function select(value: string, options: [string, string][], change: (v: string) => void, label: string): HTMLSelectElement {
  const s = el("select", { class: INPUT, "aria-label": label }, ...options.map(([v, t]) => el("option", { value: v, selected: v === value }, t)));
  s.addEventListener("change", () => change(s.value));
  return s;
}

function input(value: string, change: (v: string) => void, label: string): HTMLInputElement {
  const i = el("input", { type: "text", class: INPUT, value, "aria-label": label });
  i.addEventListener("change", () => change(i.value));
  i.addEventListener("keydown", (e) => e.stopPropagation());
  return i;
}

const scaleOptions = (): [string, string][] => SCALES.map((n) => [String(n), scaleText(n)]);

export function drawProperties(panel: HTMLElement, host: PanelHost): void {
  const sheet = host.sheet();
  const [id] = host.selection();
  const view = sheet.views.find((v) => v.id === id);
  const note = sheet.annotations.find((a) => a.id === id);
  const item = sheet.sketch.items.find((i) => i.id === id);
  const parts: HTMLElement[] = [];
  const tool = host.tool();

  if (tool === "base") {
    parts.push(heading("Vue de base"),
      row("Orientation", select(host.options.orientation, (Object.keys(ORIENTATIONS) as Orientation[]).map((o) => [o, ORIENTATIONS[o].label]), (v) => (host.options.orientation = v as Orientation), "Orientation")),
      row("Échelle", select(String(host.options.scale ?? "auto"), [["auto", "Ajustée à la feuille"], ...scaleOptions()], (v) => (host.options.scale = v === "auto" ? null : Number(v)), "Échelle de la vue")));
  }
  if (tool.startsWith("sketch-")) parts.push(heading("Dessin 2D"), row("Trait", select(host.options.style, STYLES, (v) => (host.options.style = v as LineStyle), "Style de trait")));

  if (view) {
    const set = (change: Partial<typeof view>) => host.update((s) => ({ ...s, views: s.views.map((v) => (v.id === view.id ? { ...v, ...change } : v)) }));
    parts.push(heading(view.kind === "section" ? "Coupe" : view.kind === "detail" ? "Détail" : view.kind === "projected" ? "Vue projetée" : "Vue de base"),
      row("Nom", input(view.label, (v) => set({ label: v }), "Nom de la vue")),
      row("Échelle", select(String(view.scale), scaleOptions(), (v) => {
        // A view and the projected views taken from it keep one scale.
        const n = Number(v);
        host.update((s) => ({ ...s, views: s.views.map((x) => (x.id === view.id || (x.parent === view.id && x.kind === "projected") ? { ...x, scale: n } : x)) }));
      }, "Échelle")));
    if (view.kind === "base" && view.orientation) {
      parts.push(row("Orientation", select(view.orientation, (Object.keys(ORIENTATIONS) as Orientation[]).map((o) => [o, ORIENTATIONS[o].label]), (v) => set({ orientation: v as Orientation, spec: ORIENTATIONS[v as Orientation].spec }), "Orientation de la vue")));
    }
    if (view.kind !== "section") {
      const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: view.hidden });
      box.addEventListener("change", () => set({ hidden: box.checked }));
      parts.push(el("label", { class: "flex items-center gap-2" }, box, "Lignes cachées en pointillés"));
    }
    if (view.cut) {
      const flip = el("button", { type: "button", class: BUTTON }, "⇄ Inverser le sens de la coupe");
      flip.addEventListener("click", () => set({ cut: { ...view.cut!, flip: !view.cut!.flip } }));
      parts.push(flip);
    }
    const remove = el("button", { type: "button", class: `${BUTTON} text-red-700` }, "Supprimer la vue (et ce qui en dépend)");
    remove.addEventListener("click", () => host.update((s) => removeView(s, view.id)));
    parts.push(remove);
  } else if (note) {
    const set = (change: Record<string, unknown>) => host.update((s) => ({ ...s, annotations: s.annotations.map((a) => (a.id === note.id ? ({ ...a, ...change } as typeof a) : a)) }));
    parts.push(heading({ dimension: "Cote", diameter: "Diamètre", radius: "Rayon", angle: "Angle", text: "Texte", note: "Note", balloon: "Repère", bom: "Nomenclature" }[note.kind]));
    if (note.kind === "dimension") parts.push(row("Type", select(note.mode, [["horizontal", "Horizontale"], ["vertical", "Verticale"], ["aligned", "Alignée"]], (v) => set({ mode: v }), "Type de cote")));
    if (note.kind === "dimension" || note.kind === "diameter" || note.kind === "radius" || note.kind === "angle") parts.push(row("Texte imposé", input(note.text ?? "", (v) => set({ text: v || undefined }), "Texte imposé")), el("p", { class: "text-[11px] text-gray-500" }, "Vide : la valeur mesurée, qui suit le modèle."));
    if (note.kind === "text" || note.kind === "note") parts.push(row("Texte", input(note.text, (v) => set({ text: v }), "Texte")));
    if (note.kind === "text") parts.push(row("Taille (mm)", select(String(note.size), ["2.5", "3.5", "5", "7", "10"].map((v): [string, string] => [v, v]), (v) => set({ size: Number(v) }), "Taille du texte")));
  } else if (item) {
    parts.push(heading(item.kind === "line" ? "Ligne" : item.kind === "rect" ? "Rectangle" : "Cercle"),
      row("Trait", select(item.style, STYLES, (v) => host.update((s) => ({ ...s, sketch: { ...s.sketch, items: s.sketch.items.map((i) => (i.id === item.id ? { ...i, style: v as LineStyle } : i)) } })), "Style de trait")));
    const size = item.kind === "circle" ? `Rayon ${item.radius.toFixed(1)} mm` : item.kind === "line" ? `Longueur ${Math.hypot(item.b[0] - item.a[0], item.b[1] - item.a[1]).toFixed(1)} mm` : `${Math.abs(item.b[0] - item.a[0]).toFixed(1)} × ${Math.abs(item.b[1] - item.a[1]).toFixed(1)} mm`;
    parts.push(el("p", { class: "text-gray-600 dark:text-gray-300" }, size));
  } else if (!tool || tool === "select") {
    const set = (change: Partial<DrawingSheet>) => host.update((s) => ({ ...s, ...change }));
    const title = (key: keyof DrawingSheet["title"], label: string) => row(label, input(sheet.title[key], (v) => host.update((s) => ({ ...s, title: { ...s.title, [key]: v } })), label));
    const standard = el("button", { type: "button", class: BUTTON }, "Poser les vues standard (face, dessus, gauche, iso)");
    standard.addEventListener("click", () => host.standardViews());
    const removeSheet = el("button", { type: "button", class: `${BUTTON} text-red-700` }, "Supprimer cette feuille");
    removeSheet.addEventListener("click", () => host.removeSheet());
    parts.push(heading("Feuille"),
      row("Nom", input(sheet.name, (v) => set({ name: v }), "Nom de la feuille")),
      row("Format", select(sheet.format, (Object.keys(FORMATS) as Format[]).map((k) => [k, `${k} paysage (${FORMATS[k][0]} × ${FORMATS[k][1]})`]), (v) => set({ format: v as Format }), "Format")),
      row("Projection", select(sheet.projection, [["first", "Européenne"], ["third", "Américaine"]], (v) => set({ projection: v as "first" | "third" }), "Projection")),
      heading("Cartouche"), title("title", "Titre"), title("number", "N° de plan"), title("author", "Dessiné par"), title("company", "Société"), title("date", "Date"), title("material", "Matière"),
      heading("Dessin 2D libre"),
      row("Échelle", select(String(sheet.sketch.scale), scaleOptions(), (v) => set({ sketch: { ...sheet.sketch, scale: Number(v) } }), "Échelle du dessin 2D")),
      el("p", { class: "text-[11px] text-gray-500" }, "Les lignes, rectangles et cercles se dessinent en millimètres réels à cette échelle, depuis le coin bas gauche de la feuille."),
      standard, removeSheet);
  }
  if (!parts.length) parts.push(el("p", { class: "text-gray-500" }, "Sélectionnez une vue, une cote ou un trait pour le régler."));
  panel.replaceChildren(...parts);
}
