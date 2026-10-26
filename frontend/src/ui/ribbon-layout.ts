/**
 * The two bars of the editor: the lower one has every tool, in its groups (wrapping onto several lines rather
 * than running off the page); the upper one ("Mes outils") is empty until the user moves tools up into it.
 * "Personnaliser" turns the icons into things to move — drag one to the other bar or to another group, or, without
 * dragging (touch screens), tap an icon then tap where it should go (another icon: before it; a group or the upper
 * bar: at its end). The layout is remembered per toolbar in the browser; "Réinitialiser" puts everything back.
 */
const STORAGE = "cao.ribbon-layout.";
/** Attributes that identify a tool button, in order of preference. */
const KEY_ATTRIBUTES = ["data-action", "data-sketch-tool", "data-sketch-command", "data-workshop", "data-new-sketch", "data-select-plus", "data-select-window", "data-section"];

/** A stable name for a tool button ("data-action:array"), or null for a button that is not movable. */
export function keyOf(button: HTMLElement): string | null {
  for (const attribute of KEY_ATTRIBUTES) if (button.hasAttribute(attribute)) return `${attribute}:${button.getAttribute(attribute) ?? ""}`;
  return null;
}

type Layout = Record<string, string[]>;

function readLayout(name: string): Layout | null {
  try {
    const raw = localStorage.getItem(STORAGE + name);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && Object.values(parsed).every((v) => Array.isArray(v) && v.every((k) => typeof k === "string")) ? (parsed as Layout) : null;
  } catch {
    return null;
  }
}

function writeLayout(name: string, layout: Layout | null): void {
  try {
    if (layout) localStorage.setItem(STORAGE + name, JSON.stringify(layout));
    else localStorage.removeItem(STORAGE + name);
  } catch {
    // Not remembered: only this session.
  }
}

export function bindRibbonLayout(root: HTMLElement): void {
  root.dataset.ribbonEditing = "false";
  const bars = [...root.querySelectorAll<HTMLElement>("[data-ribbon-bar]")].flatMap((bar) => {
    const toolbar = bar.nextElementSibling;
    const quick = bar.querySelector<HTMLElement>("[data-quickbar]");
    const customize = bar.querySelector<HTMLButtonElement>("[data-ribbon-customize]");
    return toolbar instanceof HTMLElement && quick && customize ? [{ name: bar.dataset.ribbonBar as string, bar, toolbar, quick, customize }] : [];
  });
  let editing = false;
  let picked: HTMLElement | null = null;
  let dragging: HTMLElement | null = null;

  for (const b of bars) {
    const zones = new Map<string, HTMLElement>([["quick", b.quick]]);
    for (const group of b.toolbar.querySelectorAll<HTMLElement>(".ribbon-group")) {
      const row = group.querySelector<HTMLElement>(".ribbon-row");
      if (row) {
        row.dataset.ribbonZone = group.getAttribute("aria-label") ?? "";
        zones.set(row.dataset.ribbonZone, row);
      }
    }
    const buttons = new Map<string, HTMLElement>();
    for (const button of b.toolbar.querySelectorAll<HTMLElement>(".ribbon-row > button")) {
      const key = keyOf(button);
      if (key) {
        button.dataset.ribbonKey = key;
        buttons.set(key, button);
      }
    }
    const capture = (): Layout => Object.fromEntries([...zones].map(([zone, el]) => [zone, [...el.children].flatMap((c) => ((c as HTMLElement).dataset.ribbonKey ? [(c as HTMLElement).dataset.ribbonKey as string] : []))]));
    const apply = (layout: Layout) => {
      for (const [zone, keys] of Object.entries(layout)) {
        const el = zones.get(zone);
        if (!el) continue;
        for (const key of keys) {
          const button = buttons.get(key);
          if (button) el.append(button);
        }
      }
      tidy();
    };
    /** A group left without icons is out of the ribbon (shown again while customising, to receive icons). */
    const tidy = () => {
      for (const group of b.toolbar.querySelectorAll<HTMLElement>(".ribbon-group")) {
        const row = group.querySelector<HTMLElement>(".ribbon-row");
        group.dataset.empty = String(!!row && row.children.length === 0);
      }
    };
    const defaults = capture();
    const stored = readLayout(b.name);
    if (stored) apply(stored);
    tidy();
    const save = () => {
      tidy();
      writeLayout(b.name, capture());
    };
    Object.assign(b, { zones, buttons, apply, save, defaults });
  }
  type Bar = (typeof bars)[number] & { zones: Map<string, HTMLElement>; buttons: Map<string, HTMLElement>; apply(l: Layout): void; save(): void; defaults: Layout };
  const all = bars as Bar[];
  const barOf = (el: Element) => all.find((b) => b.bar.contains(el) || b.toolbar.contains(el));

  const zoneAt = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>("[data-ribbon-zone]") ?? target.closest(".ribbon-group")?.querySelector<HTMLElement>(".ribbon-row") ?? null;
  };

  const unpick = () => {
    picked?.removeAttribute("data-picked");
    picked = null;
  };

  // ---- editing on and off ----------------------------------------------------------------
  const setEditing = (on: boolean) => {
    editing = on;
    root.dataset.ribbonEditing = String(on);
    unpick();
    for (const b of all) {
      b.customize.setAttribute("aria-pressed", String(on));
      b.customize.textContent = on ? "Terminé" : "Personnaliser";
      for (const button of b.buttons.values()) {
        if (on) button.setAttribute("draggable", "true");
        else button.removeAttribute("draggable");
      }
      b.bar.querySelector<HTMLElement>("[data-ribbon-edit-tools]")?.toggleAttribute("hidden", !on);
    }
  };
  for (const b of all) {
    const tools = document.createElement("div");
    tools.dataset.ribbonEditTools = "";
    tools.hidden = true;
    tools.className = "flex shrink-0 items-center gap-2 self-center text-xs text-gray-500 dark:text-gray-400";
    const hint = document.createElement("span");
    hint.className = "hidden lg:inline";
    hint.textContent = "Montez des outils dans « Mes outils » : glissez-les (ou touchez l'outil, puis l'endroit voulu).";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "ribbon-tab";
    reset.textContent = "Réinitialiser";
    reset.addEventListener("click", () => {
      b.apply(b.defaults);
      writeLayout(b.name, null);
    });
    tools.append(hint, reset);
    b.customize.before(tools);
    b.customize.addEventListener("click", () => setEditing(!editing));
  }

  // While customising, an icon is something to move, not a command: clicks never reach the tools.
  root.addEventListener(
    "click",
    (event) => {
      if (!editing || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>("[data-ribbon-key]");
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        if (!picked) {
          picked = button;
          button.dataset.picked = "true";
        } else if (picked === button) unpick();
        else if (picked.parentElement) {
          const moved = picked;
          unpick();
          button.parentElement?.insertBefore(moved, button);
          barOf(button)?.save();
        }
        return;
      }
      const zone = picked && !event.target.closest("button, summary, select, input") ? zoneAt(event.target) : null;
      if (zone && picked) {
        event.preventDefault();
        event.stopPropagation();
        const moved = picked;
        unpick();
        zone.append(moved);
        barOf(zone)?.save();
      }
    },
    true,
  );

  // ---- dragging ----------------------------------------------------------------------------
  root.addEventListener("dragstart", (event) => {
    const button = editing && event.target instanceof Element ? event.target.closest<HTMLElement>("[data-ribbon-key]") : null;
    if (!button) return;
    dragging = button;
    unpick();
    event.dataTransfer?.setData("text/plain", button.dataset.ribbonKey as string);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => button.setAttribute("data-dragging", "true"));
  });
  root.addEventListener("dragover", (event) => {
    if (!dragging) return;
    const zone = zoneAt(event.target);
    for (const z of root.querySelectorAll("[data-over]")) z.removeAttribute("data-over");
    if (!zone) return;
    event.preventDefault();
    zone.dataset.over = "true";
    const next = [...zone.children].find((c) => c !== dragging && (c as HTMLElement).dataset.ribbonKey && event.clientX < (c as HTMLElement).getBoundingClientRect().left + (c as HTMLElement).getBoundingClientRect().width / 2);
    if (next) zone.insertBefore(dragging, next);
    else if (dragging.parentElement !== zone || zone.lastElementChild !== dragging) zone.append(dragging);
  });
  root.addEventListener("drop", (event) => {
    if (dragging) event.preventDefault();
  });
  root.addEventListener("dragend", () => {
    for (const z of root.querySelectorAll("[data-over]")) z.removeAttribute("data-over");
    dragging?.removeAttribute("data-dragging");
    if (dragging) barOf(dragging)?.save();
    dragging = null;
  });
}
