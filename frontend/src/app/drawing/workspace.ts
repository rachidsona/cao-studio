/**
 * L'espace « Mise en plan » (comme l'espace Dessin de Fusion) : un écran à part au-dessus de l'éditeur, avec son ruban
 * (vues, cotes, textes, dessin 2D, exports), la feuille au centre (molette : zoom ; glisser le fond : se déplacer),
 * ses onglets de feuilles en bas et le panneau des réglages à droite. On sélectionne une vue, une cote ou un trait
 * d'un clic, on le déplace en le glissant (une vue projetée reste alignée sur sa vue mère, qui l'emmène), Suppr le
 * retire ; Ctrl+Z annule comme partout. Les feuilles sont gardées avec le projet.
 */
import { bodyLabel } from "../../document/operations";
import { sheetDxf } from "../../drawing/dxf";
import { sheetsPdf } from "../../drawing/svg-pdf";
import { SheetLayout } from "../../drawing/layout";
import {
  FIXED_ITEMS, FORMATS, freshId, newSheet, removeView, setSheetClient, sheetIds, toggled, updateSheet, withoutDimensions,
  type DrawingSheet, type DrawingView, type LineStyle, type Orientation, type Vec2,
} from "../../drawing/model";
import type { MeshInput } from "../../drawing/projection";
import { renderSheet, type BomRow } from "../../drawing/svg";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { partsOf } from "../workshop/workshop";
import { downloadText, openModal, printHtml } from "../workshop/workshop-ui";
import { drawProperties } from "./properties";
import { lineDimension } from "../../drawing/auto-dims";
import { DrawingNavigator } from "./navigator";
import { drawingRibbon } from "./ribbon";
import { arrangeDimensions, dimensionFrame, snapDimension } from "../../drawing/arrange";
import { bomRows, describeAnnotation, hitTest, sideName, traitAt, withAutoDimensions, withDimensionsOnSide } from "./sheet-actions";
import { addPoseSheets, printClientFile } from "./client-file";
import { ZoomWindowTool, type DrawingTool, type ToolHost } from "./tools";
import { cabinetSheet, standardViews, type CabinetFocus } from "./standard-views";

const PX_PER_MM = 3.78;

export class DrawingWorkspace {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly host: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly navigator: DrawingNavigator;
  /** The trait last clicked in a view (its length is shown, its dimension one click away). */
  private trait: ReturnType<typeof traitAt> = null;
  /** A dimension being dragged: where the pointer would put it before snapping, and the guides of its snap. */
  private raw: { offset: number; textShift: number } | null = null;
  private guides: [Vec2, Vec2][] = [];
  private readonly tabs: HTMLElement;
  private readonly status: HTMLElement;
  private readonly layout: SheetLayout;
  private sheetId: string;
  private selection: string[] = [];
  private tool: DrawingTool | null = null;
  private draft: DrawingSheet | null = null;
  private view = { zoom: 1, x: 0, y: 0 };
  private readonly options: { orientation: Orientation; scale: number | null; style: LineStyle } = { orientation: "front", scale: null, style: "solid" };
  private readonly keys = (event: KeyboardEvent) => this.key(event);

  constructor(
    private readonly editor: Editor,
    private readonly viewport: Viewport,
    private readonly onClose: () => void,
    focus: CabinetFocus | null = null,
  ) {
    setSheetClient(document.getElementById("editor")?.dataset.client ?? "");
    this.layout = new SheetLayout(() => this.meshes());
    this.layout.setModel(this.modelKey());
    this.stage = el("div", { class: "relative min-h-0 flex-1 overflow-hidden bg-gray-300 select-none dark:bg-gray-700", "data-drawing-stage": "" });
    this.host = el("div", { class: "absolute top-0 left-0 origin-top-left shadow-xl" });
    this.stage.append(this.host);
    this.panel = el("div", { class: "w-72 shrink-0 space-y-2 overflow-y-auto border-l border-gray-200 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900", "aria-label": "Réglages de la mise en plan" });
    this.tabs = el("div", { class: "flex shrink-0 items-center gap-1 border-t border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" });
    this.status = el("div", { class: "truncate px-3 py-1 text-xs text-gray-600 dark:text-gray-300", "aria-live": "polite" });
    this.navigator = new DrawingNavigator(el("nav", { class: "w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900", "aria-label": "Navigateur de la mise en plan" }), {
      sheets: () => this.sheets,
      sheet: () => this.sheet(),
      selection: () => this.selection,
      select: (id) => ((this.selection = [id]), this.render()),
      openSheet: (id) => ((this.sheetId = id), (this.selection = []), this.render(), this.fitPage()),
      update: (change) => this.update(change),
      bodies: () => this.viewport.displayedBodies.map((id) => ({ id, name: bodyLabel(this.editor.doc, id) })),
      describe: (id) => describeAnnotation(this.sheet(), this.layout, id, (mm) => formatLength(mm, this.editor.unit)),
    });
    this.root = el("div", { class: "fixed inset-0 z-40 flex flex-col bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100", role: "dialog", "aria-label": "Mise en plan", "data-drawing-workspace": "" },
      this.ribbon(), el("div", { class: "flex min-h-0 flex-1" }, this.navigator.element, el("div", { class: "flex min-w-0 flex-1 flex-col" }, this.stage, this.status, this.tabs), this.panel));
    document.body.append(this.root);
    if (!this.sheets.length && !focus) this.commit([standardViews(newSheet([], this.title()), this.layout, this.viewport.displayedBodies.length)]);
    // Opened on a cabinet: its sheet (made, or found and brought up to date), shown first.
    if (focus) this.commit(cabinetSheet(this.sheets, focus, this.viewport.displayedBodies, this.layout, this.title()));
    this.sheetId = (focus ? this.sheets.find((x) => x.name === focus.sheetName) : undefined)?.id ?? this.sheets[0]!.id;
    this.bindPointer();
    window.addEventListener("keydown", this.keys, true);
    requestAnimationFrame(() => this.fitPage());
    this.render();
  }

  // ---- the document --------------------------------------------------------------------------------------
  private get sheets(): DrawingSheet[] {
    return this.editor.doc.drawings ?? [];
  }

  private sheet(): DrawingSheet {
    return this.draft ?? this.sheets.find((s) => s.id === this.sheetId) ?? this.sheets[0]!;
  }

  private commit(sheets: DrawingSheet[]): void {
    void this.editor.change({ ...this.editor.doc, drawings: sheets });
  }

  private update(change: (s: DrawingSheet) => DrawingSheet): void {
    this.draft = null;
    this.commit(updateSheet(this.sheets, this.sheet().id, change));
  }

  private title = () => document.title.split(" · ")[0] || "Mise en plan";

  private meshes(): MeshInput[] {
    return this.viewport.displayedBodies.flatMap((id) => {
      const m = this.viewport.bodyMesh(id);
      return m ? [{ id, vertices: m.vertices, indices: m.indices, edges: m.edges, edgeGroups: m.edgeGroups }] : [];
    });
  }

  private modelKey(): string {
    return this.viewport.displayedBodies.map((id) => {
      const m = this.viewport.bodyMesh(id);
      return m ? `${id}:${m.vertices.length}:${m.metrics.bbox.flat().map((v) => v.toFixed(2)).join(",")}` : id;
    }).join("|");
  }

  /** The parts list: the cut list of the displayed pieces, a number per row. */
  private bom(): BomRow[] {
    return bomRows(this.editor.doc, partsOf(this.viewport, this.editor.doc), (mm) => formatLength(mm, this.editor.unit));
  }

  /** Front, top, left and an isometric view, at a scale that fits the sheet. */
  // ---- drawing --------------------------------------------------------------------------------------------

  render(): void {
    if (!this.root.isConnected) return;
    this.layout.setModel(this.modelKey());
    if (!this.sheets.some((s) => s.id === this.sheetId)) this.sheetId = this.sheets[0]?.id ?? this.sheetId;
    const sheet = this.sheet();
    const index = this.sheets.findIndex((s) => s.id === sheet.id);
    const svg = renderSheet(sheet, this.layout, { format: (mm) => formatLength(mm, this.editor.unit), bom: this.bom(), page: [index + 1, this.sheets.length], selected: new Set(this.selection) });
    const guides = this.guides.map(([a, b]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ec4899" stroke-width="0.3" stroke-dasharray="1.5 1"/>`).join("");
    this.host.innerHTML = svg.replace("</svg>", `<g data-preview="">${this.tool?.preview() ?? ""}${guides}</g></svg>`);
    const drawn = this.host.querySelector("svg")!;
    const [w, h] = FORMATS[sheet.format];
    drawn.setAttribute("width", String(w * PX_PER_MM));
    drawn.setAttribute("height", String(h * PX_PER_MM));
    this.host.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.zoom})`;
    this.status.textContent = this.tool?.hint() ?? "Cliquez pour sélectionner, glissez pour déplacer ; Suppr retire. Molette : zoom ; glisser le fond : se déplacer.";
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-drawing-tool]")) b.setAttribute("aria-pressed", String(b.dataset.drawingTool === (this.tool?.name ?? "select")));
    this.drawTabs();
    this.navigator.draw();
    if (!this.root.querySelector("[aria-label='Réglages de la mise en plan'] :focus")) this.drawPanel();
  }

  /** Cotation automatique: the selected views, else every view shown. */
  private autoDimensions(): void {
    const views = this.selection.filter((id) => this.sheet().views.some((v) => v.id === id));
    this.update((s) => withAutoDimensions(s, this.layout, views, (mm) => formatLength(mm, this.editor.unit)));
  }

  private drawPanel(): void {
    drawProperties(this.panel, {
      sheet: () => this.sheet(),
      selection: () => this.selection,
      update: (change) => this.update(change),
      options: this.options,
      tool: () => this.tool?.name ?? "select",
      trait: () => {
        const t = this.trait;
        const view = t && this.sheet().views.find((v) => v.id === t.view);
        if (!t || !view || !this.selection.includes(view.id)) return null;
        return {
          text: formatLength(t.length, this.editor.unit),
          add: () => {
            const made = lineDimension(this.sheet(), this.layout, view, t.a, t.b);
            if (made) this.update((s) => ({ ...s, annotations: [...s.annotations, { ...made, id: freshId(sheetIds(s), "note") } as DrawingSheet["annotations"][number]] }));
          },
        };
      },
      standardViews: () => this.update((s) => standardViews(s, this.layout, this.viewport.displayedBodies.length)),
      dimensionSide: (id) => sideName(this.sheet(), this.layout, id),
      setDimensionSide: (side) => this.update((s) => withDimensionsOnSide(s, this.layout, this.selection, side)),
      removeSheet: () => {
        if (this.sheets.length === 1) return this.editor.notify("Il reste une seule feuille : elle est gardée.", "info");
        this.commit(this.sheets.filter((s) => s.id !== this.sheet().id));
      },
    });
  }

  private drawTabs(): void {
    const tabs = this.sheets.map((s) => {
      const b = el("button", { type: "button", class: `h-7 border px-3 ${s.id === this.sheet().id ? "border-sky-600 bg-sky-50 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "border-gray-300 dark:border-gray-600"}` }, s.name);
      b.addEventListener("click", () => ((this.sheetId = s.id), (this.selection = []), this.render(), this.fitPage()));
      return b;
    });
    const add = el("button", { type: "button", class: "h-7 border border-dashed border-gray-400 px-3", title: "Nouvelle feuille (vide : un plan 2D, ou avec les vues standard)" }, "+ Feuille");
    add.addEventListener("click", () => {
      const sheet = newSheet(this.sheets, this.title(), this.sheet().format);
      this.commit([...this.sheets, sheet]);
      this.sheetId = sheet.id;
      this.selection = [];
    });
    this.tabs.replaceChildren(...tabs, add);
  }

  /** Shows a rectangle of the sheet (paper mm) as large as the stage allows, centred. */
  private zoomTo(a: Vec2, b: Vec2): void {
    const r = this.stage.getBoundingClientRect();
    const [w, h] = [Math.max(1, Math.abs(b[0] - a[0])), Math.max(1, Math.abs(b[1] - a[1]))];
    const zoom = Math.max(0.1, Math.min(20, Math.min((r.width - 20) / (w * PX_PER_MM), (r.height - 20) / (h * PX_PER_MM))));
    const [cx, cy] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.view = { zoom, x: r.width / 2 - cx * PX_PER_MM * zoom, y: r.height / 2 - cy * PX_PER_MM * zoom };
    this.render();
  }

  private fitPage(): void {
    const [w, h] = FORMATS[this.sheet().format];
    const r = this.stage.getBoundingClientRect();
    const zoom = Math.min((r.width - 40) / (w * PX_PER_MM), (r.height - 40) / (h * PX_PER_MM));
    this.view = { zoom, x: (r.width - w * PX_PER_MM * zoom) / 2, y: (r.height - h * PX_PER_MM * zoom) / 2 };
    this.render();
  }

  // ---- the ribbon -----------------------------------------------------------------------------------------

  private ribbon(): HTMLElement {
    return drawingRibbon({
      use: (make) => this.setTool(make(this.toolHost())),
      select: () => this.setTool(null),
      selected: () => this.selection[0] ?? null,
      autoDimensions: () => this.autoDimensions(),
      arrange: () => this.update((s) => arrangeDimensions(s, this.layout, this.selection.filter((id) => s.views.some((v) => v.id === id)))),
      clearDimensions: () => {
        const views = this.selection.filter((id) => this.sheet().views.some((v) => v.id === id));
        const before = this.sheet().annotations.length;
        const after = withoutDimensions(this.sheet(), views);
        if (before === after.annotations.length) return this.editor.notify("Aucune cote à effacer.", "info");
        this.selection = [];
        this.update(() => after);
        this.editor.notify(`${before - after.annotations.length} cote(s) effacée(s) ${views.length ? "des vues choisies" : "de la feuille"} — Ctrl+Z pour les rendre.`, "info");
      },
      zoomWindow: () => this.setTool(new ZoomWindowTool(this.toolHost())),
      fit: () => this.fitPage(),
      exportPdf: () => this.exportPdf(),
      downloadPdf: () => downloadText(`${this.title()} - plans.pdf`.replace(/[\\/:*?"<>|]/g, "-"), sheetsPdf(this.sheets.map((s) => this.sheetSvg(s)), this.title()), "application/pdf"),
      pose: () => addPoseSheets(this.viewport, this.editor, this.layout, this.sheets, (all, id) => (this.commit(all), (this.sheetId = id), (this.selection = []), this.render())),
      clientFile: () => printClientFile(this.viewport, this.editor, this.sheets.map((s) => this.sheetSvg(s)), this.title(), this.sheet().format),
      exportDxf: () => downloadText(`${this.fileName()}.dxf`, sheetDxf(this.sheet(), this.layout, (mm) => formatLength(mm, this.editor.unit), this.bom()), "application/dxf"),
      exportSvg: () => downloadText(`${this.fileName()}.svg`, this.sheetSvg(this.sheet()), "image/svg+xml"),
      close: () => this.close(),
    });
  }

  private fileName = () => `${this.title()} - ${this.sheet().name}`.replace(/[\\/:*?"<>|]/g, "-");

  private sheetSvg(sheet: DrawingSheet): string {
    const index = this.sheets.findIndex((s) => s.id === sheet.id);
    return renderSheet(sheet, this.layout, { format: (mm) => formatLength(mm, this.editor.unit), bom: this.bom(), page: [index + 1, this.sheets.length] });
  }

  private exportPdf(): void {
    const pages = this.sheets.map((s) => `<div class="page">${this.sheetSvg(s)}</div>`).join("");
    printHtml(this.title(), pages, `@page{size:${this.sheet().format} landscape;margin:0} body{margin:0} .page{page-break-after:always;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center} .page svg{width:100%;height:100%}`, false);
  }

  // ---- tools, selection, dragging -------------------------------------------------------------------------

  private toolHost(): ToolHost {
    return {
      sheet: () => this.sheet(),
      layout: this.layout,
      update: (change) => this.update(change),
      select: (ids) => (this.selection = ids),
      ask: (title, value) => this.ask(title, value),
      notify: (message) => this.editor.notify(message, "info"),
      options: this.options,
      done: () => this.setTool(null),
      redraw: () => this.render(),
      zoomTo: (a, b) => this.zoomTo(a, b),
    };
  }

  private setTool(tool: DrawingTool | null): void {
    this.tool = tool;
    this.render();
  }

  private ask(title: string, value: string): Promise<string | null> {
    return new Promise((resolve) => {
      const input = el("input", { type: "text", class: "h-9 w-full border border-gray-300 px-2 text-sm", value, "aria-label": title });
      let answered = false;
      const done = (v: string | null) => {
        if (answered) return;
        answered = true;
        close();
        resolve(v);
      };
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(input.value.trim() || null);
      });
      const close = openModal(title, input, [{ label: "OK", run: () => done(input.value.trim() || null) }, { label: "Annuler", run: () => done(null) }]);
      setTimeout(() => input.focus(), 0);
    });
  }

  private paper(event: MouseEvent): Vec2 {
    const svg = this.host.querySelector("svg");
    const m = svg?.getScreenCTM();
    if (!svg || !m) return [0, 0];
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  /** What is under a paper point: an annotation, a 2D element, then a view. */
  private hit(p: Vec2): string | null {
    return hitTest(this.sheet(), this.layout, p, this.bom(), (mm) => formatLength(mm, this.editor.unit));
  }

  /** Moves what is dragged by `d` (paper mm) on a copy of the sheet. */
  private moved(sheet: DrawingSheet, id: string, d: Vec2, p: Vec2): DrawingSheet {
    const view = sheet.views.find((v) => v.id === id);
    if (view) {
      // A projected view slides along its alignment; a view takes the views made from it along.
      const parent = view.kind === "projected" && view.parent ? sheet.views.find((v) => v.id === view.parent) : undefined;
      const along: Vec2 = parent && !view.orientation?.startsWith("iso") ? (Math.abs(view.at[1] - parent.at[1]) < 1e-6 ? [d[0], 0] : [0, d[1]]) : d;
      const children = new Set<string>([id]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const v of sheet.views) if (v.parent && children.has(v.parent) && v.kind === "projected" && !children.has(v.id)) (children.add(v.id), (grew = true));
      }
      return { ...sheet, views: sheet.views.map((v) => (children.has(v.id) ? { ...v, at: [v.at[0] + along[0], v.at[1] + along[1]] } : v)) };
    }
    const a = sheet.annotations.find((x) => x.id === id);
    if (a) {
      if ("at" in a) return { ...sheet, annotations: sheet.annotations.map((x) => (x.id === id ? { ...a, at: [a.at[0] + d[0], a.at[1] + d[1]] } : x)) };
      if (a.kind === "dimension") {
        // Across its line: the line moves; along it: the text slides. Then snapped (aligned, rows), with guides.
        const frame = dimensionFrame(sheet, this.layout, a);
        if (!frame) return sheet;
        const raw = (this.raw ??= { offset: a.offset, textShift: a.textShift ?? 0 });
        raw.offset += d[0] * frame.normal[0] + d[1] * frame.normal[1];
        raw.textShift += d[0] * frame.dir[0] + d[1] * frame.dir[1];
        const snapped = snapDimension(sheet, this.layout, { ...a, ...raw });
        this.guides = snapped.guides;
        return { ...sheet, annotations: sheet.annotations.map((x) => (x.id === id ? { ...a, offset: snapped.offset, textShift: snapped.textShift || undefined } : x)) };
      }
      if (a.kind === "diameter" || a.kind === "radius") {
        const view = sheet.views.find((v) => v.id === a.view);
        if (!view) return sheet;
        const c = this.layout.toPaper(sheet, view, a.center);
        return { ...sheet, annotations: sheet.annotations.map((x) => (x.id === id ? { ...a, angle: (Math.atan2(-(p[1] - c[1]), p[0] - c[0]) * 180) / Math.PI } : x)) };
      }
      return sheet;
    }
    const k = sheet.sketch.scale;
    const r: Vec2 = [d[0] * k, -d[1] * k];
    const shift = (v: Vec2): Vec2 => [v[0] + r[0], v[1] + r[1]];
    return { ...sheet, sketch: { ...sheet.sketch, items: sheet.sketch.items.map((i) => (i.id !== id ? i : i.kind === "circle" ? { ...i, center: shift(i.center) } : { ...i, a: shift(i.a), b: shift(i.b) })) } };
  }

  private bindPointer(): void {
    let drag: { id: string | null; start: Vec2; last: Vec2; screen: Vec2; view: { x: number; y: number }; moved: boolean } | null = null;
    this.stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      const r = this.stage.getBoundingClientRect();
      const [mx, my] = [event.clientX - r.left, event.clientY - r.top];
      const k = Math.exp(-event.deltaY * 0.0015);
      const zoom = Math.max(0.1, Math.min(20, this.view.zoom * k));
      const f = zoom / this.view.zoom;
      this.view = { zoom, x: mx - (mx - this.view.x) * f, y: my - (my - this.view.y) * f };
      this.render();
    }, { passive: false });
    this.stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      const p = this.paper(event);
      const id = event.button === 0 && !this.tool ? this.hit(p) : null;
      if (id && !this.selection.includes(id)) this.selection = event.shiftKey ? [...this.selection, id] : [id];
      drag = { id: (this.tool && event.button === 0) || (id && FIXED_ITEMS.includes(id)) ? null : id, start: p, last: p, screen: [event.clientX, event.clientY], view: { x: this.view.x, y: this.view.y }, moved: false };
      this.stage.setPointerCapture(event.pointerId);
    });
    this.stage.addEventListener("pointermove", (event) => {
      const p = this.paper(event);
      if (drag) {
        const far = Math.hypot(event.clientX - drag.screen[0], event.clientY - drag.screen[1]) > 4;
        if (!far && !drag.moved) return;
        drag.moved = true;
        if (drag.id) {
          this.draft = this.moved(this.draft ?? this.sheet(), drag.id, [p[0] - drag.last[0], p[1] - drag.last[1]], p);
          drag.last = p;
        } else if (this.tool?.drag && event.buttons === 1) {
          this.tool.drag(drag.start, p);
        } else if (!this.tool || event.buttons === 4) {
          this.view = { ...this.view, x: drag.view.x + event.clientX - drag.screen[0], y: drag.view.y + event.clientY - drag.screen[1] };
        }
        return this.render();
      }
      this.tool?.move(p, event);
    });
    this.stage.addEventListener("pointerup", (event) => {
      const wasDrag = drag;
      drag = null;
      [this.raw, this.guides] = [null, []];
      if (wasDrag?.moved) {
        if (!wasDrag.id && this.tool?.dragEnd && event.button === 0) return this.tool.dragEnd(wasDrag.start, this.paper(event));
        if (this.draft) {
          const done = this.draft;
          this.draft = null;
          this.commit(updateSheet(this.sheets, done.id, () => done));
        }
        return;
      }
      const p = this.paper(event);
      if (this.tool && event.button === 0) this.tool.click(p, event);
      else if (!this.tool && event.button === 0) {
        const id = this.hit(p);
        this.selection = id ? (event.shiftKey ? [...new Set([...this.selection, id])] : [id]) : [];
        // A trait clicked in a view: its length straight away, in the panel.
        this.trait = id && this.sheet().views.some((v) => v.id === id) ? traitAt(this.sheet(), this.layout, p) : null;
        this.render();
      }
    });
  }

  private key(event: KeyboardEvent): void {
    if (!this.root.isConnected) return;
    const typing = event.target instanceof Element && event.target.closest("input, textarea, select");
    const mod = event.ctrlKey || event.metaKey;
    // Undo, redo and save go on to the editor; the editor's other shortcuts are not for the sheet.
    if (mod && ["z", "y", "s"].includes(event.key.toLowerCase())) return;
    if (typing || document.querySelector("[role=dialog][aria-modal=true]")) return;
    event.stopImmediatePropagation();
    if (this.tool?.key?.(event)) return event.preventDefault();
    if (event.key === "Escape") return this.tool ? this.setTool(null) : ((this.selection = []), this.render());
    if ((event.key === "Delete" || event.key === "Backspace") && this.selection.length) {
      event.preventDefault();
      const gone = new Set(this.selection);
      this.selection = [];
      this.update((s) => {
        // The frame and the title block are taken off (put back from the navigator); dragging them pans the sheet.
        let out: DrawingSheet = { ...s, hiddenItems: FIXED_ITEMS.filter((f) => gone.has(f)).reduce((list, f) => toggled(list, f, true), s.hiddenItems) };
        for (const id of gone) if (out.views.some((v) => v.id === id)) out = removeView(out, id);
        return { ...out, annotations: out.annotations.filter((a) => !gone.has(a.id)), sketch: { ...out.sketch, items: out.sketch.items.filter((i) => !gone.has(i.id)) } };
      });
    }
    if (event.key.toLowerCase() === "f") this.fitPage();
  }

  close(): void {
    window.removeEventListener("keydown", this.keys, true);
    this.root.remove();
    this.onClose();
  }
}

/**
 * The « Mise en plan » button opens the workspace; it follows every change of the model while open. Returns the way
 * to open it on one cabinet (the menu of the project's name).
 */
export function bindDrawingWorkspace(root: HTMLElement, viewport: Viewport, editor: Editor): (focus: CabinetFocus) => void {
  let open: DrawingWorkspace | null = null;
  // The button of the top bar (a workspace of its own, as in Fusion) and the one of the Atelier group.
  for (const button of root.querySelectorAll('[data-workshop="drawing"]')) {
    button.addEventListener("click", () => {
      if (open) return;
      open = new DrawingWorkspace(editor, viewport, () => (open = null));
    });
  }
  editor.afterRender(() => {
    open?.render();
  });
  return (focus) => {
    open?.close();
    open = new DrawingWorkspace(editor, viewport, () => (open = null), focus);
  };
}
