/**
 * Une icône d'outil glissée d'une barre à l'autre, ou hors des barres pour l'enlever, la même chose partout : le ruban
 * du haut, Mes outils, les sept colonnes et la colonne Sélection et vue. Lâchée sur une barre, elle s'y ajoute à la
 * place marquée ; venue du ruban, elle y reste (le ruban est la maison des outils), venue d'ailleurs, elle quitte sa
 * barre. Lâchée hors de toute barre (sur la vue, le panneau…), elle quitte sa barre : du ruban, elle se range dans le
 * menu de son groupe. Échap annule. Chaque barre dit ce qu'elle prend (registerBar), chaque icône d'où elle vient
 * (draggableTool).
 */

export interface DragSource {
  key: string;
  label: string;
  /** Its bar: a drop on it is a move within it, the bar's own business. */
  bar: HTMLElement;
  /** Takes it out of its bar. */
  remove(): void;
  /** It stays in its bar when put in another (the ribbon). */
  keep?: boolean;
}

export interface DropBar {
  element: HTMLElement;
  accepts(key: string): boolean;
  /** Puts it where the pointer is (`from`: the dragged icon, when it comes from this very bar). */
  drop(key: string, event: DragEvent, from: DragSource): void;
  /** Marks where it would go; null: nothing marked. */
  mark?(event: DragEvent | null, key: string): void;
}

const bars: DropBar[] = [];
let current: { source: DragSource; item: HTMLElement } | null = null;

export function registerBar(bar: DropBar): void {
  bars.push(bar);
}

/** The icon being dragged, if any. */
export const draggedTool = (): DragSource | null => current?.source ?? null;

const barAt = (target: EventTarget | null): DropBar | null => (target instanceof Node ? (bars.find((b) => b.element.isConnected && b.element.contains(target)) ?? null) : null);

const unmark = (but: DropBar | null = null) => {
  for (const b of bars) if (b !== but) b.mark?.(null, "");
};

/** Makes `item` an icon one drags to another bar, or out of the bars. */
export function draggableTool(item: HTMLElement, source: () => DragSource): void {
  item.draggable = true;
  item.addEventListener("dragstart", (event) => {
    current = { source: source(), item };
    event.dataTransfer?.setData("text/plain", current.source.label);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
    requestAnimationFrame(() => item.classList.add("opacity-40"));
  });
  item.addEventListener("dragend", () => {
    if (current?.item === item) current = null;
    item.classList.remove("opacity-40");
    delete item.dataset.remove;
    unmark();
  });
}

let bound = false;

/** The listeners of the whole page: where the icon would land, and what a drop does. */
export function bindToolDrag(): void {
  if (bound) return;
  bound = true;
  document.addEventListener("dragover", (event) => {
    if (!current) return;
    const bar = barAt(event.target);
    unmark(bar);
    current.item.dataset.remove = String(!bar);
    if (bar && !bar.accepts(current.source.key)) return bar.mark?.(null, "");
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = bar && current.source.keep && bar.element !== current.source.bar ? "copy" : "move";
    bar?.mark?.(event, current.source.key);
  }, true);
  document.addEventListener("drop", (event) => {
    if (!current) return;
    const { source } = current;
    const bar = barAt(event.target);
    current = null;
    unmark();
    if (bar && !bar.accepts(source.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!bar) return source.remove();
    bar.drop(source.key, event, source);
    if (bar.element !== source.bar && !source.keep) source.remove();
  }, true);
}
