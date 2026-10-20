/**
 * Floating window of one feature or body (opened from the timeline or the
 * browser): rename it, edit it again (reopens its tool), disable it, or delete it.
 * It is placed next to the item that opened it and closes on Escape or on a
 * click elsewhere.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_ICONS, TYPE_LABELS, type NavItem } from "./feature-meta";

export interface FeatureDialogActions {
  rename(item: NavItem, name: string): void;
  edit(item: NavItem): void;
  toggleSuppress(item: NavItem): void;
  remove(item: NavItem): void;
}

const BUTTON =
  "h-9 rounded-md border border-gray-300 px-3 text-sm font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800";

export class FeatureDialog {
  private root: HTMLElement | null = null;
  private current: NavItem | null = null;
  private readonly onDocPointer = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    // The items that open the dialog handle their own click (they reopen or move it).
    if (this.root && !this.root.contains(target) && !target.closest("[data-op],[data-menu]")) this.close();
  };
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.root) this.close();
  };

  /** `host` is the positioned element the dialog is placed in. */
  constructor(
    private readonly host: HTMLElement,
    private readonly actions: FeatureDialogActions,
  ) {}

  get openItem(): NavItem | null {
    return this.current;
  }

  /** Opens (or moves) the dialog for `item`, next to `anchor`. */
  open(item: NavItem, anchor: DOMRect): void {
    this.close();
    this.current = item;
    this.root = el("div", {
      class:
        "absolute z-40 w-72 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 shadow-2xl " +
        "dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 max-sm:right-2 max-sm:left-2 max-sm:w-auto",
      role: "dialog",
      "aria-label": `${item.body ? "Corps" : TYPE_LABELS[item.type]} ${item.name}`,
    });
    this.host.append(this.root);
    this.fill(item);
    this.place(anchor);
    document.addEventListener("pointerdown", this.onDocPointer, true);
    document.addEventListener("keydown", this.onKey);
  }

  /** Refreshes the content after a change of the document; closes if the feature is gone. */
  update(item: NavItem | undefined): void {
    if (!this.root) return;
    if (!item) return this.close();
    this.current = item;
    // Never rebuild under the user's fingers: the rename field keeps its text while focused.
    if (this.root.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
    this.fill(item);
  }

  close(): void {
    this.root?.remove();
    this.root = null;
    this.current = null;
    document.removeEventListener("pointerdown", this.onDocPointer, true);
    document.removeEventListener("keydown", this.onKey);
  }

  private place(anchor: DOMRect): void {
    const root = this.root;
    if (!root) return;
    const box = this.host.getBoundingClientRect();
    const width = root.offsetWidth || 288;
    const left = Math.max(8, Math.min(anchor.left - box.left, box.width - width - 8));
    root.style.left = `${left}px`;
    // Above the anchor when it is in the lower half (timeline), below it otherwise (browser).
    if (anchor.top - box.top > box.height / 2) root.style.bottom = `${Math.max(8, box.bottom - anchor.top + 6)}px`;
    else root.style.top = `${Math.max(8, anchor.bottom - box.top + 4)}px`;
  }

  private fill(item: NavItem): void {
    const root = this.root;
    if (!root) return;
    const badge = STATE_BADGES[item.state];
    const close = el("button", { type: "button", class: "ml-auto size-7 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700", "aria-label": "Fermer" }, "✕");
    close.addEventListener("click", () => this.close());

    const name = el("input", {
      type: "text",
      class:
        "h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-gray-600 dark:bg-gray-950",
      value: item.name,
      maxlength: "80",
      "aria-label": "Nom",
    });
    const commit = () => {
      const value = name.value.trim();
      if (value && value !== item.name) this.actions.rename(item, value);
      else name.value = item.name;
    };
    name.addEventListener("change", commit);
    name.addEventListener("keydown", (event) => {
      event.stopPropagation(); // typing a name must not trigger tool shortcuts
      if (event.key === "Enter") name.blur();
      else if (event.key === "Escape") {
        name.value = item.name;
        this.close();
      }
    });

    // A body has no tool of its own: its operations are edited from the timeline.
    const edit = item.body
      ? null
      : el("button", { type: "button", class: `${BUTTON} flex-1 border-sky-600 bg-sky-600 text-white hover:bg-sky-700 dark:hover:bg-sky-700` }, item.type === "sketch" ? "✎ Modifier l'esquisse" : "✎ Modifier");
    edit?.addEventListener("click", () => {
      this.close();
      this.actions.edit(item);
    });
    const suppress =
      item.type === "sketch" || item.body || item.offset
        ? null
        : el("button", { type: "button", class: BUTTON }, item.suppressed ? "Réactiver" : "Désactiver");
    suppress?.addEventListener("click", () => this.actions.toggleSuppress(item));
    const remove = el("button", { type: "button", class: `${BUTTON} text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950` }, item.body ? "Supprimer le corps" : "Supprimer");
    remove.addEventListener("click", () => {
      this.close();
      this.actions.remove(item);
    });

    root.replaceChildren(
      el(
        "div",
        { class: "flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700" },
        el("span", { class: "text-gray-500 dark:text-gray-400", "aria-hidden": "true" }, item.body ? "◼" : TYPE_ICONS[item.type]),
        el("h2", { class: "text-xs font-semibold tracking-wide uppercase text-gray-600 dark:text-gray-300" }, item.body ? "Corps" : TYPE_LABELS[item.type]),
        el("span", { class: `size-2.5 rounded-full ${badge.dot}`, title: badge.label, "aria-label": badge.label }),
        close,
      ),
      el(
        "div",
        { class: "space-y-2 px-3 py-3" },
        el("label", { class: "block text-xs text-gray-600 dark:text-gray-300" }, "Nom", el("div", { class: "pt-1" }, name)),
        item.message ? el("p", { class: "rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, item.message) : null,
        el("div", { class: "flex flex-wrap gap-1.5 pt-1" }, edit, suppress, remove),
      ),
    );
  }
}
