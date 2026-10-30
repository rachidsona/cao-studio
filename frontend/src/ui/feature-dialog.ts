/**
 * Floating window of one feature or body (opened from the timeline or the
 * browser): rename it, edit it again (reopens its tool), disable it, or delete it.
 * It is placed next to the item that opened it, inside the panel that holds that
 * item (the browser on the left, the view for the timeline), and closes on
 * Escape or on a click elsewhere.
 */
import { el } from "./dom";
import { STATE_BADGES, TYPE_LABELS, TYPE_SPRITES, type NavItem } from "./feature-meta";
import { toolIcon } from "./icons";

export interface FeatureDialogActions {
  rename(item: NavItem, name: string): void;
  edit(item: NavItem): void;
  toggleSuppress(item: NavItem): void;
  remove(item: NavItem): void;
}

/** An icon button (the coloured icon of the toolbar's style): the action's name is its tooltip. */
const BUTTON =
  "flex h-10 flex-1 items-center justify-center border border-gray-300 bg-white hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700";

function iconButton(label: string, sprite: string): HTMLButtonElement {
  const button = el("button", { type: "button", class: BUTTON, title: label, "aria-label": label });
  button.append(toolIcon(sprite, "tool-icon size-8"));
  return button;
}

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

  /** `host` holds the dialog when the item's own panel cannot be found (the dialog is placed over the page). */
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
        "fixed z-50 w-52 border border-gray-300 bg-white text-xs text-gray-900 shadow-xl " +
        "dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100",
      role: "dialog",
      "aria-label": `${item.body ? "Corps" : TYPE_LABELS[item.type]} ${item.name}`,
    });
    document.body.append(this.root);
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

  /** The panel holding the item that opened the dialog: the browser, the view (timeline), else the host. */
  private area(anchor: DOMRect): DOMRect {
    const under = document.elementFromPoint(anchor.left + anchor.width / 2, anchor.top + anchor.height / 2);
    const panel = under?.closest<HTMLElement>('[data-ref="panel-tree"], [data-ref="workspace"]') ?? this.host;
    return panel.getBoundingClientRect();
  }

  private place(anchor: DOMRect): void {
    const root = this.root;
    if (!root) return;
    const box = this.area(anchor);
    // Inside the panel, narrower when the panel is (a narrow browser), and always on screen.
    const width = Math.max(160, Math.min(208, box.width - 8));
    root.style.width = `${width}px`;
    const left = Math.max(box.left + 4, Math.min(anchor.left, box.right - width - 4));
    root.style.left = `${Math.max(4, Math.min(left, window.innerWidth - width - 4))}px`;
    // Above the anchor when it is in the lower half of its panel (timeline), below it otherwise (browser).
    if (anchor.top - box.top > box.height / 2) root.style.bottom = `${Math.max(8, window.innerHeight - anchor.top + 6)}px`;
    else root.style.top = `${Math.max(8, anchor.bottom + 4)}px`;
  }

  private fill(item: NavItem): void {
    const root = this.root;
    if (!root) return;
    const badge = STATE_BADGES[item.state];
    const close = el("button", { type: "button", class: "ml-auto size-5 text-[11px] text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700", "aria-label": "Fermer" }, "✕");
    close.addEventListener("click", () => this.close());

    const name = el("input", {
      type: "text",
      class:
        "h-7 w-full border border-gray-300 bg-white px-2 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-gray-600 dark:bg-gray-950",
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
    const edit = item.body ? null : iconButton("Modifier", "i-op-edit");
    edit?.addEventListener("click", () => {
      this.close();
      this.actions.edit(item);
    });
    const suppress =
      item.type === "sketch" || item.body || item.offset ? null : iconButton(item.suppressed ? "Réactiver" : "Désactiver", item.suppressed ? "i-op-restore" : "i-op-suppress");
    suppress?.addEventListener("click", () => this.actions.toggleSuppress(item));
    const remove = iconButton("Supprimer", "i-op-trash");
    remove.addEventListener("click", () => {
      this.close();
      this.actions.remove(item);
    });

    root.replaceChildren(
      el(
        "div",
        { class: "flex items-center gap-1.5 border-b border-gray-200 px-2 py-1 dark:border-gray-700" },
        item.body ? el("span", { class: "text-gray-500 dark:text-gray-400", "aria-hidden": "true" }, "◼") : toolIcon(TYPE_SPRITES[item.type], "size-5 shrink-0"),
        el("h2", { class: "text-[10px] font-semibold tracking-wide uppercase text-gray-600 dark:text-gray-300" }, item.body ? "Corps" : TYPE_LABELS[item.type]),
        el("span", { class: `size-2 rounded-full ${badge.dot}`, title: badge.label, "aria-label": badge.label }),
        close,
      ),
      el(
        "div",
        { class: "space-y-1.5 p-2" },
        name,
        item.message ? el("p", { class: " bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200", role: "alert" }, item.message) : null,
        el("div", { class: "flex gap-1" }, edit, suppress, remove),
      ),
    );
  }
}
