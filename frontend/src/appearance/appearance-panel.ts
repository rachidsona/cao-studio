/**
 * Panneau « Apparence » (comme la bibliothèque d'apparences de Fusion) : les apparences de ce modèle, puis la
 * bibliothèque par catégorie avec recherche, en vignettes sphériques. Un clic donne l'apparence aux corps
 * sélectionnés ; on peut aussi glisser une vignette sur un corps de la vue. Une couleur au choix s'applique aux laques,
 * peintures, plastiques et tissus. « Retirer » rend aux corps l'apparence de leur matière. « Importer une image »
 * fait une apparence d'une photo prise ailleurs (« Mes motifs », gardés avec le projet).
 */
import { el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import { imageFileToDataUrl } from "./custom";
import { APPEARANCES, CATEGORIES, allAppearances, appearanceById, searchAppearances, type Appearance, type CategoryId } from "./library";
import { swatch } from "./swatches";

/** Type of the data carried by a swatch being dragged onto the view. */
export const DRAG_TYPE = "application/x-cao-appearance";

const INPUT = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";

export interface AppearancePanelHost {
  /** Bodies the panel acts on (selected whole, or through a face). */
  targets(): string[];
  /** Appearances on the displayed bodies, with how many bodies have each, and the colour of the first target. */
  used(): { appearance: Appearance; color?: string; count: number; faces?: number }[];
  targetColor(): string | undefined;
  /** Faces picked in the view: whether the motif goes on them only, or on their whole bodies. */
  faces(): { count: number; only: boolean; set(only: boolean): void };
  apply(bodyIds: string[], appearanceId: string | null, color?: string): void;
  /** An image of one's own as a new appearance, given to `bodyIds` (if any); `tile`: how many mm the image covers. */
  importImage(name: string, image: string, tile: [number, number], bodyIds: string[]): void;
  removeImage(appearanceId: string): void;
  notify(message: string): void;
  close(): void;
}

export class AppearancePanel {
  readonly element: HTMLElement;
  private body = el("div", { class: "space-y-2" });
  private grid = el("div", { class: "grid grid-cols-3 gap-1.5 @2xs:grid-cols-4", "data-appearance-grid": "" });
  private query = "";
  private category: CategoryId | null = "wood";
  private colour = "#d9d4ca";
  private paint = "lacquer-satin";
  private imageTile = 1000;

  constructor(container: HTMLElement, private readonly host: AppearancePanelHost) {
    const shut = el("button", { type: "button", class: "size-7 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800", "aria-label": "Fermer Apparence" }, "✕");
    shut.addEventListener("click", () => host.close());
    this.element = el(
      "div",
      { class: "@container w-80 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs dark:border-gray-700 dark:bg-gray-900/95", role: "dialog", "aria-label": "Apparence", "data-appearance-panel": "" },
      el("div", { class: "flex items-center justify-between" }, el("h2", { class: "panel-title" }, "Apparence"), shut),
      this.body,
    );
    this.element.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(container, this.element);
    this.draw();
  }

  /** One swatch: sphere image, name; click applies it to the selection, drag drops it on a body of the view. */
  /** Faces picked in the view: the motif on the whole pieces, or only on those faces. */
  private facesChoice(faces: { count: number; only: boolean; set(only: boolean): void }): HTMLElement {
    const option = (only: boolean, label: string) => {
      const input = el("input", { type: "radio", name: "appearance-scope", class: "accent-sky-600", checked: faces.only === only });
      input.addEventListener("change", () => (faces.set(only), this.draw()));
      return el("label", { class: "flex items-center gap-2" }, input, label);
    };
    return el("div", { class: "space-y-1 border border-gray-200 p-2 dark:border-gray-700", role: "radiogroup", "aria-label": "Où poser le motif" },
      option(false, "La pièce entière"),
      option(true, `Seulement ${faces.count > 1 ? `les ${faces.count} faces choisies` : "la face choisie"}`),
    );
  }

  private tile(appearance: Appearance, color?: string, note?: string): HTMLElement {
    const image = el("img", { alt: "", class: "aspect-square w-full rounded-full bg-gray-100 dark:bg-gray-800", draggable: "false" });
    image.style.background = color ?? appearance.color;
    void swatch(appearance, color).then((url) => url && (image.src = url));
    const button = el(
      "button",
      { type: "button", class: "group flex min-w-0 flex-col items-center gap-0.5 p-1 text-center hover:bg-sky-50 dark:hover:bg-sky-950", title: `${appearance.name}${note ? ` — ${note}` : ""}\nClic : donner aux corps sélectionnés ; ou glisser sur un corps de la vue (sur la sélection : à toute la sélection)`, draggable: "true", "data-appearance": appearance.id },
      image,
      el("span", { class: "line-clamp-2 w-full text-3xs leading-tight text-gray-700 dark:text-gray-200" }, appearance.name),
      note ? el("span", { class: "text-3xs text-gray-500" }, note) : null,
    );
    button.addEventListener("click", () => this.applyToSelection(appearance.id, color));
    if (appearance.category === "custom" && !note) {
      const remove = el("button", { type: "button", class: "absolute top-0 right-0 size-5 bg-white/90 text-3xs text-gray-600 hover:text-red-600 dark:bg-gray-900/90", title: "Retirer ce motif du projet", "aria-label": `Retirer le motif ${appearance.name}` }, "✕");
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        this.host.removeImage(appearance.id);
      });
      return el("div", { class: "relative" }, button, remove);
    }
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify({ id: appearance.id, color }));
      event.dataTransfer?.setData("text/plain", appearance.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    });
    return button;
  }

  private applyToSelection(id: string | null, color?: string): void {
    const targets = this.host.targets();
    if (!targets.length) return this.host.notify("Sélectionnez un ou plusieurs corps (ou une face), ou glissez l'apparence sur un corps de la vue.");
    this.host.apply(targets, id, color);
  }

  private fillGrid(): void {
    const found = searchAppearances(this.query, this.query ? null : this.category);
    this.grid.replaceChildren(...(found.length ? found.map((a) => this.tile(a)) : [el("p", { class: "col-span-full text-gray-500" }, "Aucune apparence ne correspond.")]));
  }

  /** Redraws what depends on the model and the selection (the library grid keeps its search). */
  draw(): void {
    const targets = this.host.targets();
    const faces = this.host.faces();
    const used = this.host.used();
    const search = el("input", { type: "search", class: INPUT, placeholder: "Rechercher : chêne, marbre, verre…", value: this.query, "aria-label": "Rechercher une apparence" });
    search.addEventListener("input", () => {
      this.query = search.value;
      this.fillGrid();
    });
    const category = el(
      "select",
      { class: INPUT, "aria-label": "Catégorie" },
      el("option", { value: "", selected: this.category === null }, "Toutes les catégories"),
      ...CATEGORIES.map((c) => el("option", { value: c.id, selected: c.id === this.category }, `${c.name} (${allAppearances().filter((a) => a.category === c.id).length})`)),
    );
    category.addEventListener("change", () => {
      this.category = (category.value || null) as CategoryId | null;
      this.fillGrid();
    });
    const remove = el("button", { type: "button", class: BUTTON, disabled: !targets.length, title: "Rendre aux corps sélectionnés l'apparence de leur matière" }, "Retirer l'apparence");
    remove.addEventListener("click", () => this.applyToSelection(null));

    // A colour of one's own, on a paintable appearance (lacquer, paint, plastic, fabric…).
    const paintables = APPEARANCES.filter((a) => a.paintable && !a.id.startsWith("ral-"));
    const colour = el("input", { type: "color", value: this.host.targetColor() ?? this.colour, class: "h-8 w-12 shrink-0 cursor-pointer border border-gray-300 bg-white dark:border-gray-600", "aria-label": "Couleur au choix" });
    colour.addEventListener("input", () => (this.colour = colour.value));
    const kind = el("select", { class: INPUT, "aria-label": "Type de surface" }, ...paintables.map((a) => el("option", { value: a.id, selected: a.id === this.paint }, a.name.replace(" (couleur au choix)", ""))));
    kind.addEventListener("change", () => (this.paint = kind.value));
    const paint = el("button", { type: "button", class: BUTTON }, "Appliquer");
    paint.addEventListener("click", () => this.applyToSelection(this.paint, colour.value));

    // An image taken elsewhere (a file of the computer): a new appearance of the project.
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "hidden", "aria-label": "Image du motif" });
    const pick = el("button", { type: "button", class: `${BUTTON} min-w-0 flex-1 whitespace-nowrap` }, "Importer une image…");
    pick.addEventListener("click", () => file.click());
    const size = el("input", { type: "number", min: "10", step: "10", value: String(this.imageTile), class: "h-8 w-20 shrink-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", title: "Largeur couverte par l'image (mm)", "aria-label": "Taille du motif en millimètres" });
    size.addEventListener("change", () => (this.imageTile = Math.max(10, Number(size.value) || 1000)));
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      file.value = "";
      if (!chosen) return;
      imageFileToDataUrl(chosen)
        .then((image) => {
          this.category = "custom";
          this.query = "";
          this.host.importImage(chosen.name.replace(/\.[^.]+$/, ""), image, [this.imageTile, this.imageTile], this.host.targets());
        })
        .catch((error: Error) => this.host.notify(error.message));
    });

    const parts: (HTMLElement | null)[] = [
      el("p", { class: targets.length ? "text-gray-700 dark:text-gray-200" : "text-gray-500" }, targets.length ? `Appliquer à : ${faces.only ? `${faces.count} face${faces.count > 1 ? "s" : ""} choisie${faces.count > 1 ? "s" : ""}` : `${targets.length} corps sélectionné${targets.length > 1 ? "s" : ""}`} (clic sur une vignette, ou glissez-la sur la sélection).` : "Sélectionnez des corps (dans le navigateur ou la vue, Ctrl pour plusieurs ; un groupe d'un clic sur son titre) puis cliquez une vignette, ou glissez-la sur la sélection ; sans sélection, glissez-la sur un corps de la vue."),
      faces.count ? this.facesChoice(faces) : null,
      used.length
        ? el("div", { class: "space-y-1" }, el("h3", { class: "font-semibold text-gray-600 dark:text-gray-300" }, "Dans ce modèle"), el("div", { class: "grid grid-cols-3 gap-1.5 @2xs:grid-cols-4" }, ...used.map((u) => this.tile(u.appearance, u.color, [u.count ? `${u.count} corps` : "", u.faces ? `${u.faces} face${u.faces > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ")))))
        : null,
      el("div", { class: "flex gap-1" }, remove),
      el("div", { class: "space-y-1" }, el("h3", { class: "font-semibold text-gray-600 dark:text-gray-300" }, "Couleur au choix"), el("div", { class: "flex gap-1" }, colour, kind), paint),
      el(
        "div",
        { class: "space-y-1" },
        el("h3", { class: "font-semibold text-gray-600 dark:text-gray-300" }, "Mes motifs"),
        el("div", { class: "flex items-center gap-1" }, pick, size, el("span", { class: "text-gray-500" }, "mm"), file),
        el("p", { class: "text-3xs text-gray-500" }, "Une photo de bois, de pierre, de tissu… depuis votre ordinateur. Elle est gardée avec le projet ; la taille dit combien de millimètres l'image couvre."),
      ),
      el("div", { class: "space-y-1" }, el("h3", { class: "font-semibold text-gray-600 dark:text-gray-300" }, "Bibliothèque"), search, category),
      this.grid,
    ];
    this.body.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
    this.fillGrid();
  }

  dispose(): void {
    this.element.remove();
  }
}

/** The appearance carried by a drag onto the view, if any. */
export function droppedAppearance(event: DragEvent): { id: string; color?: string } | null {
  try {
    const data = JSON.parse(event.dataTransfer?.getData(DRAG_TYPE) || "null") as { id?: unknown; color?: unknown } | null;
    if (!data || typeof data.id !== "string" || !appearanceById(data.id)) return null;
    return { id: data.id, color: typeof data.color === "string" ? data.color : undefined };
  } catch {
    return null;
  }
}
