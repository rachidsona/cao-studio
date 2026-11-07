/**
 * Panneau du mode Rendu, dans la colonne de droite : environnement (préréglages, luminosité, rotation, heure du
 * soleil), fond, sol, caméra (focale, exposition, tonalité, profondeur de champ), finitions des matières, qualité,
 * et la galerie des images rendues (comme la « Galerie de rendus » de Fusion). En haut, toujours visible,
 * « Télécharger le rendu final » rend l'image au format et à la qualité choisis puis l'enregistre aussitôt (PNG).
 */
import { download, el } from "../ui/dom";
import { placePanel } from "../ui/dock";
import type { RenderChange, RenderMode, RenderProgress } from "./render-mode";
import { ENVIRONMENTS, FINISHES, IMAGE_FORMATS, saveSettings, type Finish, type RenderSettings } from "./settings";

const SELECT = "h-8 w-full min-w-0 border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900";
const BUTTON = "h-8 border border-gray-300 px-2 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const PRIMARY = "h-8 btn-accent px-3 text-xs font-medium disabled:opacity-40";
const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
const fr = (n: number, digits = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export interface RenderPanelHost {
  /** Materials of the displayed bodies (id and name), for their finishes. */
  materials(): { id: string; name: string }[];
  /** A length in the user's unit, with the unit. */
  length(mm: number): string;
  notify(message: string, kind?: "info" | "error"): void;
  exit(): void;
}

interface Shot {
  url: string;
  name: string;
}

export class RenderPanel {
  readonly element: HTMLElement;
  private body = el("div", { class: "space-y-1" });
  private status = el("p", { class: "text-[11px] text-gray-600 tabular-nums dark:text-gray-300", "aria-live": "polite" });
  private bar = el("div", { class: "h-full w-0 bg-sky-500 transition-[width]" });
  private gallery: Shot[] = [];
  private lastStatus = "";
  private final = el("button", { type: "button", class: `${PRIMARY} w-full`, "data-render-download": "", title: "Rend l'image au format et au nombre d'échantillons de la section Image, puis la télécharge (PNG)" }, "⬇ Télécharger le rendu final");
  /** Sections the user opened or closed, kept across redraws. */
  private open = new Set(["environment", "camera", "image"]);

  constructor(container: HTMLElement, private readonly mode: RenderMode, private readonly host: RenderPanelHost) {
    const shut = el("button", { type: "button", class: "size-7 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800", "aria-label": "Quitter le rendu", title: "Quitter le rendu (Échap)" }, "✕");
    shut.addEventListener("click", () => host.exit());
    this.element = el(
      "div",
      { class: "@container w-72 space-y-2 border border-gray-200 bg-white/95 p-2.5 text-xs dark:border-gray-700 dark:bg-gray-900/95", role: "region", "aria-label": "Rendu", "data-render-panel": "" },
      el("div", { class: "flex items-center justify-between" }, el("h2", { class: "panel-title" }, "Rendu"), shut),
      this.status,
      el("div", { class: "h-1 overflow-hidden bg-gray-200 dark:bg-gray-700" }, this.bar),
      this.final,
      this.body,
    );
    this.final.addEventListener("click", () => void this.renderImage(true));
    this.element.addEventListener("pointerdown", (event) => event.stopPropagation());
    placePanel(container, this.element);
    mode.onFocusPicked = () => this.draw();
    this.draw();
  }

  private get s(): RenderSettings {
    return this.mode.settings;
  }

  /** Changes settings, keeps them, and applies what they touch. */
  private set(patch: Partial<RenderSettings>, change: RenderChange, redraw = false): void {
    this.mode.settings = { ...this.mode.settings, ...patch };
    saveSettings(this.mode.settings);
    this.mode.update(change);
    if (redraw) this.draw();
  }

  showProgress(p: RenderProgress): void {
    const text = p.capture
      ? `Image ${fr(p.capture.width)} × ${fr(p.capture.height)} : ${fr(p.samples)} / ${fr(p.target)} échantillons`
      : p.paused
        ? `En pause — ${fr(p.samples)} échantillons`
        : p.samples >= p.target
          ? `Terminé — ${fr(p.samples)} échantillons`
          : `Affinage : ${fr(p.samples)} / ${fr(p.target)} échantillons`;
    if (text === this.lastStatus) return;
    this.lastStatus = text;
    this.status.textContent = text;
    this.bar.style.width = `${Math.min(100, (100 * p.samples) / Math.max(1, p.target))}%`;
  }

  // ---- building blocks ------------------------------------------------------------------

  private section(key: string, title: string, ...children: (Node | null)[]): HTMLElement {
    const details = el(
      "details",
      { class: "group border border-gray-200 dark:border-gray-700", ...(this.open.has(key) ? { open: "" } : {}) },
      el("summary", { class: "flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-2 font-semibold select-none" }, el("span", { class: "inline-block w-3 transition-transform group-open:rotate-90", "aria-hidden": "true" }, "▸"), title),
      el("div", { class: "space-y-2 px-2 pb-2" }, ...children),
    );
    details.addEventListener("toggle", () => (details.open ? this.open.add(key) : this.open.delete(key)));
    return details;
  }

  private row(label: string, control: HTMLElement): HTMLElement {
    // Label beside the control when the panel is wide enough, above it when it is narrow.
    return el("label", { class: "grid items-center gap-x-2 gap-y-0.5 @2xs:grid-cols-[6.5rem_1fr]" }, el("span", { class: "text-gray-600 dark:text-gray-300" }, label), control);
  }

  private choice<T extends string>(label: string, value: T, options: { id: T; name: string }[], onChange: (value: T) => void): HTMLElement {
    const select = el("select", { class: SELECT, "aria-label": label }, ...options.map((o) => el("option", { value: o.id, selected: o.id === value }, o.name)));
    select.addEventListener("change", () => onChange(select.value as T));
    return this.row(label, select);
  }

  /** A slider with its value written next to it; the render follows while dragging. */
  private slider(label: string, value: number, min: number, max: number, step: number, text: (v: number) => string, onInput: (v: number) => void): HTMLElement {
    const input = el("input", { type: "range", min, max, step, value, class: "h-6 w-full min-w-0 accent-sky-600", "aria-label": label });
    const shown = el("span", { class: "w-14 shrink-0 text-right tabular-nums" }, text(value));
    input.addEventListener("input", () => {
      shown.textContent = text(Number(input.value));
      onInput(Number(input.value));
    });
    return this.row(label, el("span", { class: "flex items-center gap-2" }, input, shown));
  }

  private colour(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const input = el("input", { type: "color", value, class: "h-8 w-full cursor-pointer border border-gray-300 bg-white dark:border-gray-600", "aria-label": label });
    input.addEventListener("input", () => onChange(input.value));
    return this.row(label, input);
  }

  private button(label: string, run: () => void, primary = false, data: Record<string, string> = {}): HTMLButtonElement {
    const button = el("button", { type: "button", class: primary ? PRIMARY : BUTTON, ...data }, label);
    button.addEventListener("click", run);
    return button;
  }

  // ---- the panel ------------------------------------------------------------------------

  draw(): void {
    const s = this.s;
    const hour = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
    const environment = this.section(
      "environment",
      "Environnement",
      this.choice("Éclairage", s.environment, ENVIRONMENTS, (environment) => this.set({ environment }, "environment", true)),
      this.slider("Luminosité", s.brightness, 0.1, 4, 0.05, (v) => `× ${fr(v, 2)}`, (brightness) => this.set({ brightness }, "environment")),
      this.slider("Rotation", s.rotation, 0, 360, 5, (v) => `${fr(v)}°`, (rotation) => this.set({ rotation }, "environment")),
      s.environment === "outdoor" ? this.slider("Heure du soleil", s.hour, 6, 20, 0.25, hour, (h) => this.set({ hour: h }, "environment")) : null,
      this.choice("Fond", s.background, [{ id: "environment", name: "L'environnement" }, { id: "color", name: "Couleur unie" }, { id: "editor", name: "Fond de l'éditeur" }], (background) => this.set({ background }, "environment", true)),
      s.background === "color" ? this.colour("Couleur du fond", s.backgroundColor, (backgroundColor) => this.set({ backgroundColor }, "environment")) : null,
      s.background === "environment" ? this.slider("Flou du fond", s.backgroundBlur, 0, 1, 0.05, (v) => `${fr(v * 100)} %`, (backgroundBlur) => this.set({ backgroundBlur }, "environment")) : null,
    );
    const ground = this.section(
      "ground",
      "Sol",
      this.choice("Sol", s.ground, [{ id: "shadows", name: "Ombres seules" }, { id: "studio", name: "Sol de studio" }, { id: "wood", name: "Parquet" }, { id: "none", name: "Aucun" }], (g) => this.set({ ground: g }, "ground", true)),
      s.ground === "studio" ? this.colour("Couleur du sol", s.groundColor, (groundColor) => this.set({ groundColor }, "ground")) : null,
      s.ground !== "none" ? this.slider("Reflets", s.reflections, 0, 1, 0.05, (v) => `${fr(v * 100)} %`, (reflections) => this.set({ reflections }, "ground")) : null,
    );
    const focus = el("span", { class: "flex items-center gap-1" },
      el("span", { class: "min-w-0 flex-1 truncate tabular-nums" }, s.focusDistance === null ? "Centre du modèle" : this.host.length(s.focusDistance)),
      this.button(this.mode.focusPicking ? "Cliquez…" : "Viser", () => {
        this.mode.focusPicking = true;
        this.host.notify("Cliquez sur le point du modèle qui doit être net.", "info");
        this.draw();
      }, false, { title: "Cliquer dans la vue le point qui doit être net" }),
      s.focusDistance !== null ? this.button("Auto", () => this.set({ focusDistance: null }, "camera", true)) : null,
    );
    const camera = this.section(
      "camera",
      "Caméra",
      this.slider("Focale", s.focal, 12, 200, 1, (v) => `${fr(v)} mm`, (focal) => this.set({ focal }, "camera")),
      this.slider("Exposition", s.exposure, -4, 4, 0.1, (v) => `${v > 0 ? "+" : ""}${fr(v, 1)} IL`, (exposure) => this.set({ exposure }, "camera")),
      this.choice("Tonalité", s.toneMapping, [{ id: "aces", name: "Filmique (ACES)" }, { id: "agx", name: "Naturelle (AgX)" }, { id: "neutral", name: "Neutre" }], (toneMapping) => this.set({ toneMapping }, "camera")),
      this.checkbox("Profondeur de champ", s.depthOfField, (depthOfField) => this.set({ depthOfField }, "camera", true)),
      s.depthOfField ? this.choice("Ouverture", String(s.fStop), F_STOPS.map((f) => ({ id: String(f), name: `f/${fr(f, f % 1 ? 1 : 0)}` })), (f) => this.set({ fStop: Number(f) }, "camera")) : null,
      s.depthOfField ? this.row("Mise au point", focus) : null,
    );
    const materials = this.host.materials();
    const finishes = this.section(
      "finishes",
      "Finitions",
      materials.length
        ? el("div", { class: "space-y-2" }, ...materials.map((m) => this.choice(m.name, s.finishes[m.id] ?? "auto", FINISHES, (finish: Finish) => this.set({ finishes: { ...this.s.finishes, [m.id]: finish } }, "materials"))))
        : el("p", { class: "text-gray-500" }, "Aucune matière : choisissez-en dans Atelier › Matière et chants."),
    );
    const quality = this.section(
      "quality",
      "Qualité",
      this.choice("Échantillons", String(s.samples), [100, 250, 400, 1000, 2500].map((n) => ({ id: String(n), name: `${fr(n)} (${n <= 100 ? "rapide" : n <= 400 ? "normal" : "fin"})` })), (n) => this.set({ samples: Number(n) }, "quality")),
      this.slider("Rebonds", s.bounces, 2, 12, 1, (v) => fr(v), (bounces) => this.set({ bounces }, "quality")),
    );
    this.body.replaceChildren(environment, ground, camera, finishes, quality, this.imageSection());
  }

  private checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const box = el("input", { type: "checkbox", class: "size-4 accent-sky-600", checked: value });
    box.addEventListener("change", () => onChange(box.checked));
    return el("label", { class: "flex min-h-8 items-center gap-2" }, box, label);
  }

  private imageSection(): HTMLElement {
    const s = this.s;
    const shots = this.gallery.map((shot, index) => {
      const save = this.button("Télécharger", () => void fetch(shot.url).then((r) => r.blob()).then((blob) => download(blob, shot.name)));
      const remove = this.button("✕", () => {
        this.gallery.splice(index, 1);
        this.draw();
      });
      remove.setAttribute("aria-label", `Supprimer ${shot.name}`);
      return el("figure", { class: "space-y-1" }, el("img", { src: shot.url, alt: shot.name, class: "w-full border border-gray-200 dark:border-gray-700" }), el("figcaption", { class: "space-y-1" }, el("span", { class: "block truncate text-gray-500", title: shot.name }, shot.name), el("div", { class: "flex gap-1" }, save, remove)));
    });
    return this.section(
      "image",
      "Image",
      this.choice("Format", s.imageFormat, IMAGE_FORMATS, (imageFormat) => this.set({ imageFormat }, "quality")),
      this.choice("Échantillons", String(s.imageSamples), [250, 600, 1500, 3000].map((n) => ({ id: String(n), name: fr(n) })), (n) => this.set({ imageSamples: Number(n) }, "quality")),
      el("div", { class: "flex gap-1" }, this.button("Rendre l'image", () => void this.renderImage(), true, { "data-render-capture": "" })),
      shots.length ? el("div", { class: "space-y-2", "data-render-gallery": "" }, ...shots) : el("p", { class: "text-gray-500" }, "Les images rendues s'affichent ici, prêtes à télécharger (PNG)."),
    );
  }

  /** Renders an image in the chosen format and adds it to the gallery; with `save`, downloads it at once. */
  async renderImage(save = false): Promise<void> {
    if (this.final.disabled) return this.host.notify("Une image est déjà en cours de rendu.", "info");
    const s = this.s;
    const format = IMAGE_FORMATS.find((f) => f.id === s.imageFormat)?.size;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-ref="viewport"] canvas');
    const [width, height] = format ?? [canvas?.width ?? 1280, canvas?.height ?? 720];
    try {
      this.final.disabled = true;
      this.final.textContent = "Rendu en cours…";
      const url = await this.mode.capture(width, height, s.imageSamples);
      const stamp = new Date().toLocaleString("fr-FR").replace(/[/:]/g, "-").replace(/\s+/g, "_");
      const name = `rendu_${width}x${height}_${stamp}.png`;
      this.gallery.unshift({ url, name });
      this.open.add("image");
      this.draw();
      if (save) {
        download(await (await fetch(url)).blob(), name);
        this.host.notify(`Rendu final téléchargé : ${name}`, "info");
      } else this.host.notify("Image rendue : elle est dans la galerie du panneau Rendu.", "info");
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "info");
    } finally {
      this.final.disabled = false;
      this.final.textContent = "⬇ Télécharger le rendu final";
    }
  }

  dispose(): void {
    this.element.remove();
    this.mode.onFocusPicked = () => {};
  }
}
