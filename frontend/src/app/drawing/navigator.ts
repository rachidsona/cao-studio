/**
 * Le navigateur de la mise en plan (à gauche, comme dans Fusion) : les feuilles, et pour la feuille ouverte ses vues
 * (chacune dépliable sur ses pièces), ses pièces, ses cotes et annotations, son dessin 2D. Un œil cache ou montre :
 * une vue entière, une pièce dans une vue, une pièce dans toutes les vues de la feuille, une cote, un trait. Un clic
 * sur une ligne la sélectionne sur la feuille.
 */
import { shown, toggled, type DrawingSheet } from "../../drawing/model";
import { el } from "../../ui/dom";

export interface NavigatorHost {
  sheets(): DrawingSheet[];
  sheet(): DrawingSheet;
  selection(): string[];
  select(id: string): void;
  openSheet(id: string): void;
  update(change: (s: DrawingSheet) => DrawingSheet): void;
  /** The pieces of the model (displayed bodies) and their names. */
  bodies(): { id: string; name: string }[];
  /** What an annotation says (its kind and value). */
  describe(id: string): string;
}

const EYE_ON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M2 12s3.5-7 10-7c2 0 3.8.7 5.2 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.7-5.2-1.6M3 21 21 3"/></svg>';

export class DrawingNavigator {
  /** Rows unfolded (sections, views), kept across redraws. */
  private readonly open = new Set(["views", "bodies", "notes", "sketch"]);

  constructor(
    readonly element: HTMLElement,
    private readonly host: NavigatorHost,
  ) {}

  private eye(visible: boolean, label: string, toggle: () => void): HTMLElement {
    const b = el("button", { type: "button", class: `size-6 shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700 ${visible ? "text-sky-700 dark:text-sky-300" : "text-gray-400"}`, title: visible ? "Cacher" : "Montrer", "aria-label": `${visible ? "Cacher" : "Montrer"} ${label}`, "aria-pressed": String(visible) });
    b.innerHTML = EYE_ON;
    if (!visible) b.innerHTML = EYE_OFF;
    b.addEventListener("click", (e) => (e.stopPropagation(), toggle()));
    return b;
  }

  private fold(key: string, label: string, count: number | null, depth: number, extra: HTMLElement[] = []): HTMLElement {
    const opened = this.open.has(key);
    const toggle = el("button", { type: "button", class: "size-5 shrink-0 text-xs text-gray-600", "aria-expanded": String(opened), "aria-label": `${opened ? "Replier" : "Déplier"} ${label}` }, opened ? "▾" : "▸");
    toggle.addEventListener("click", () => {
      if (opened) this.open.delete(key);
      else this.open.add(key);
      this.draw();
    });
    return el("div", { class: "flex min-h-7 items-center gap-1 text-xs font-semibold", style: `padding-left:${depth * 12}px` }, toggle, ...extra, el("span", { class: "min-w-0 flex-1 truncate" }, label), count === null ? "" : el("span", { class: "px-1 text-gray-400" }, String(count)));
  }

  private row(id: string | null, label: string, depth: number, visible: boolean, toggle: () => void, selected = false): HTMLElement {
    const name = el("button", { type: "button", class: `min-w-0 flex-1 truncate text-left ${visible ? "" : "text-gray-400 line-through"}`, title: label }, label);
    if (id) name.addEventListener("click", () => this.host.select(id));
    return el("div", { class: `flex min-h-7 items-center gap-1 text-xs ${selected ? "bg-sky-100 dark:bg-sky-950" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`, style: `padding-left:${depth * 12 + 20}px`, ...(id ? { "data-nav": id } : {}) }, this.eye(visible, label, toggle), name);
  }

  draw(): void {
    const sheet = this.host.sheet();
    const picked = new Set(this.host.selection());
    const bodies = this.host.bodies();
    const hideItem = (id: string, hide: boolean) => this.host.update((s) => ({ ...s, hiddenItems: toggled(s.hiddenItems, id, hide) }));
    const out: HTMLElement[] = [el("h2", { class: "px-1 pb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase" }, "Navigateur")];
    for (const s of this.host.sheets()) {
      const current = s.id === sheet.id;
      const name = el("button", { type: "button", class: `min-w-0 flex-1 truncate text-left text-xs ${current ? "font-bold text-sky-800 dark:text-sky-300" : ""}` }, `📄 ${s.name}`);
      name.addEventListener("click", () => this.host.openSheet(s.id));
      out.push(el("div", { class: "flex min-h-7 items-center gap-1" }, name));
      if (!current) continue;

      // Views, each with its pieces.
      out.push(this.fold("views", "Vues", sheet.views.length, 1));
      if (this.open.has("views")) {
        for (const v of sheet.views) {
          const visible = shown(sheet, v.id);
          const key = `view:${v.id}`;
          const opened = this.open.has(key);
          const unfold = el("button", { type: "button", class: "size-5 shrink-0 text-xs text-gray-600", "aria-label": `${opened ? "Replier" : "Déplier"} ${v.label}`, "aria-expanded": String(opened) }, opened ? "▾" : "▸");
          unfold.addEventListener("click", () => (opened ? this.open.delete(key) : this.open.add(key), this.draw()));
          const line = this.row(v.id, v.label, 2, visible, () => hideItem(v.id, visible), picked.has(v.id));
          line.prepend(unfold);
          line.style.paddingLeft = "24px";
          out.push(line);
          if (opened) {
            for (const b of bodies) {
              const inView = !v.hiddenBodies?.includes(b.id);
              out.push(this.row(null, b.name, 3, inView && !sheet.hiddenBodies?.includes(b.id), () =>
                this.host.update((s2) => ({ ...s2, views: s2.views.map((x) => (x.id === v.id ? { ...x, hiddenBodies: toggled(x.hiddenBodies, b.id, inView) } : x)) }))));
            }
          }
        }
      }
      // Pieces, in every view of the sheet.
      out.push(this.fold("bodies", "Pièces (toutes les vues)", bodies.length, 1));
      if (this.open.has("bodies")) {
        for (const b of bodies) {
          const visible = !sheet.hiddenBodies?.includes(b.id);
          out.push(this.row(null, b.name, 2, visible, () => this.host.update((s2) => ({ ...s2, hiddenBodies: toggled(s2.hiddenBodies, b.id, visible) }))));
        }
      }
      out.push(this.fold("notes", "Cotes et annotations", sheet.annotations.length, 1));
      if (this.open.has("notes")) for (const a of sheet.annotations) out.push(this.row(a.id, this.host.describe(a.id), 2, shown(sheet, a.id), () => hideItem(a.id, shown(sheet, a.id)), picked.has(a.id)));
      out.push(this.fold("sketch", "Dessin 2D", sheet.sketch.items.length, 1));
      if (this.open.has("sketch")) {
        const names = { line: "Ligne", rect: "Rectangle", circle: "Cercle" };
        sheet.sketch.items.forEach((i, k) => out.push(this.row(i.id, `${names[i.kind]} ${k + 1}`, 2, shown(sheet, i.id), () => hideItem(i.id, shown(sheet, i.id)), picked.has(i.id))));
      }
    }
    this.element.replaceChildren(...out);
  }
}
