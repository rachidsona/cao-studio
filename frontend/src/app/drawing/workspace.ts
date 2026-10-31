/**
 * L'espace « Mise en plan » (comme l'espace Dessin de Fusion) : un écran à part au-dessus de l'éditeur, avec son ruban
 * (vues, cotes, textes, dessin 2D, exports), la feuille au centre (molette : zoom ; glisser le fond : se déplacer),
 * ses onglets de feuilles en bas et le panneau des réglages à droite. On sélectionne une vue, une cote ou un trait
 * d'un clic, on le déplace en le glissant (une vue projetée reste alignée sur sa vue mère, qui l'emmène), Suppr le
 * retire ; Ctrl+Z annule comme partout. Les feuilles sont gardées avec le projet.
 */
import { cutList } from "../../document/cut-list";
import { bodyLabel } from "../../document/operations";
import { drawAnnotation } from "../../drawing/annotations";
import { sheetDxf } from "../../drawing/dxf";
import { SheetLayout } from "../../drawing/layout";
import {
  FORMATS, FRAME_MARGIN, ORIENTATIONS, TITLE_SIZE, freshId, newSheet, placedSide, removeView, sheetIds, sideSpec, updateSheet,
  type DrawingSheet, type DrawingView, type LineStyle, type Orientation, type Vec2,
} from "../../drawing/model";
import type { MeshInput } from "../../drawing/projection";
import { bomSvg, renderSheet, type BomRow } from "../../drawing/svg";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Viewport } from "../../viewport/viewport";
import type { Editor } from "../editor";
import { partsOf } from "../workshop";
import { downloadText, openModal, printHtml } from "../workshop-ui";
import { drawProperties } from "./properties";
import { SketchTool } from "./sketch-tool";
import {
  AngleTool, BaseViewTool, CircleDimensionTool, DetailTool, DimensionTool, LabelTool, ProjectedViewTool, SectionTool, fitScale,
  type DrawingTool, type ToolHost,
} from "./tools";

const BTN = "flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 px-1.5 text-[11px] leading-tight hover:bg-gray-100 aria-pressed:bg-sky-100 aria-pressed:text-sky-800 dark:hover:bg-gray-800 dark:aria-pressed:bg-sky-950";
const PX_PER_MM = 3.78;

export class DrawingWorkspace {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly host: HTMLElement;
  private readonly panel: HTMLElement;
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
  ) {
    this.layout = new SheetLayout(() => this.meshes());
    this.layout.setModel(this.modelKey());
    this.stage = el("div", { class: "relative min-h-0 flex-1 overflow-hidden bg-gray-300 dark:bg-gray-700", "data-drawing-stage": "" });
    this.host = el("div", { class: "absolute top-0 left-0 origin-top-left shadow-xl" });
    this.stage.append(this.host);
    this.panel = el("div", { class: "w-72 shrink-0 space-y-2 overflow-y-auto border-l border-gray-200 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900", "aria-label": "Réglages de la mise en plan" });
    this.tabs = el("div", { class: "flex shrink-0 items-center gap-1 border-t border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" });
    this.status = el("div", { class: "truncate px-3 py-1 text-xs text-gray-600 dark:text-gray-300", "aria-live": "polite" });
    this.root = el("div", { class: "fixed inset-0 z-40 flex flex-col bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100", role: "dialog", "aria-label": "Mise en plan", "data-drawing-workspace": "" },
      this.ribbon(), el("div", { class: "flex min-h-0 flex-1" }, el("div", { class: "flex min-w-0 flex-1 flex-col" }, this.stage, this.status, this.tabs), this.panel));
    document.body.append(this.root);
    if (!this.sheets.length) this.commit([this.withStandardViews(newSheet([], this.title()))]);
    this.sheetId = this.sheets[0]!.id;
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

  private title(): string {
    return document.title.split(" · ")[0] || "Mise en plan";
  }

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
    const doc = this.editor.doc;
    const parts = partsOf(this.viewport, doc);
    const fmt = (mm: number) => formatLength(mm, this.editor.unit);
    return cutList(doc, parts).rows.map((r, i) => ({
      item: i + 1,
      name: r.names[0] + (r.names.length > 1 ? ` (+${r.names.length - 1})` : ""),
      quantity: r.quantity,
      material: r.material,
      size: `${fmt(r.length)} × ${fmt(r.width)} × ${fmt(r.thickness)}`,
      bodies: parts.filter((p) => r.names.includes(bodyLabel(doc, p.id))).map((p) => p.id),
    }));
  }

  /** Front, top, left and an isometric view, at a scale that fits the sheet. */
  private withStandardViews(sheet: DrawingSheet): DrawingSheet {
    if (!this.viewport.displayedBodies.length) return sheet;
    const [w, h] = FORMATS[sheet.format];
    const probe = (spec: DrawingView["spec"]) => this.layout.geometry(sheet, { id: "probe", kind: "base", spec, scale: 1, at: [0, 0], label: "", hidden: true });
    const front = probe(ORIENTATIONS.front.spec);
    const top = probe(sideSpec(ORIENTATIONS.front.spec, "top"));
    const [W, H, D] = [front.max[0] - front.min[0], front.max[1] - front.min[1], top.max[1] - top.min[1]];
    const room: Vec2 = [(w - 2 * FRAME_MARGIN - 60) / 2, h - 2 * FRAME_MARGIN - TITLE_SIZE[1] - 50];
    const scale = fitScale([W + D, H + D], room);
    const [fw, fh, d] = [W / scale, H / scale, D / scale];
    const x = FRAME_MARGIN + 25 + fw / 2;
    const y = FRAME_MARGIN + 20 + fh / 2;
    const below = sheet.projection === "first" ? y + fh / 2 + 22 + d / 2 : y;
    const frontY = sheet.projection === "first" ? y : y + d + 22;
    const ids = sheetIds(sheet);
    const id = () => {
      const next = freshId(ids, "view");
      ids.push(next);
      return next;
    };
    const base = id();
    const views: DrawingView[] = [
      { id: base, kind: "base", spec: ORIENTATIONS.front.spec, orientation: "front", scale, at: [x, frontY], label: "Vue de face", hidden: true },
      { id: id(), kind: "projected", spec: sideSpec(ORIENTATIONS.front.spec, placedSide("down", sheet.projection)), orientation: sheet.projection === "first" ? "top" : "bottom", scale, at: [x, sheet.projection === "first" ? below : y], parent: base, label: sheet.projection === "first" ? "Vue de dessus" : "Vue de dessous", hidden: true },
      { id: id(), kind: "projected", spec: sideSpec(ORIENTATIONS.front.spec, placedSide("right", sheet.projection)), orientation: sheet.projection === "first" ? "left" : "right", scale, at: [x + fw / 2 + 22 + d / 2, frontY], parent: base, label: sheet.projection === "first" ? "Vue de gauche" : "Vue de droite", hidden: true },
      { id: id(), kind: "projected", spec: ORIENTATIONS.iso.spec, orientation: "iso", scale, at: [w - FRAME_MARGIN - 20 - (fw + d) / 2, FRAME_MARGIN + 25 + (fh + d) / 2], parent: base, label: "Vue isométrique", hidden: false },
    ];
    return { ...sheet, views: [...sheet.views, ...views] };
  }

  // ---- drawing --------------------------------------------------------------------------------------------

  render(): void {
    if (!this.root.isConnected) return;
    this.layout.setModel(this.modelKey());
    if (!this.sheets.some((s) => s.id === this.sheetId)) this.sheetId = this.sheets[0]?.id ?? this.sheetId;
    const sheet = this.sheet();
    const index = this.sheets.findIndex((s) => s.id === sheet.id);
    const svg = renderSheet(sheet, this.layout, { format: (mm) => formatLength(mm, this.editor.unit), bom: this.bom(), page: [index + 1, this.sheets.length], selected: new Set(this.selection) });
    this.host.innerHTML = svg.replace("</svg>", `<g data-preview="">${this.tool?.preview() ?? ""}</g></svg>`);
    const drawn = this.host.querySelector("svg")!;
    const [w, h] = FORMATS[sheet.format];
    drawn.setAttribute("width", String(w * PX_PER_MM));
    drawn.setAttribute("height", String(h * PX_PER_MM));
    this.host.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.zoom})`;
    this.status.textContent = this.tool?.hint() ?? "Cliquez pour sélectionner, glissez pour déplacer ; Suppr retire. Molette : zoom ; glisser le fond : se déplacer.";
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-drawing-tool]")) b.setAttribute("aria-pressed", String(b.dataset.drawingTool === (this.tool?.name ?? "select")));
    this.drawTabs();
    if (!this.root.querySelector("[aria-label='Réglages de la mise en plan'] :focus")) this.drawPanel();
  }

  private drawPanel(): void {
    drawProperties(this.panel, {
      sheet: () => this.sheet(),
      selection: () => this.selection,
      update: (change) => this.update(change),
      options: this.options,
      tool: () => this.tool?.name ?? "select",
      standardViews: () => this.update((s) => this.withStandardViews(s)),
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

  private fitPage(): void {
    const [w, h] = FORMATS[this.sheet().format];
    const r = this.stage.getBoundingClientRect();
    const zoom = Math.min((r.width - 40) / (w * PX_PER_MM), (r.height - 40) / (h * PX_PER_MM));
    this.view = { zoom, x: (r.width - w * PX_PER_MM * zoom) / 2, y: (r.height - h * PX_PER_MM * zoom) / 2 };
    this.render();
  }

  // ---- the ribbon -----------------------------------------------------------------------------------------

  private ribbon(): HTMLElement {
    const button = (label: string, glyph: string, run: () => void, toolName?: string, title = label) => {
      const b = el("button", { type: "button", class: BTN, title, ...(toolName ? { "data-drawing-tool": toolName, "aria-pressed": "false" } : {}) }, el("span", { class: "text-lg leading-none", "aria-hidden": "true" }, glyph), label);
      b.addEventListener("click", run);
      return b;
    };
    const group = (caption: string, ...buttons: HTMLElement[]) =>
      el("div", { class: "flex flex-col border-r border-gray-200 px-1 dark:border-gray-700", role: "group", "aria-label": caption }, el("div", { class: "flex" }, ...buttons), el("span", { class: "text-center text-[10px] font-semibold tracking-wide text-gray-500 uppercase" }, caption));
    const use = (make: (host: ToolHost) => DrawingTool) => () => this.setTool(make(this.toolHost()));
    return el("div", { class: "flex shrink-0 items-stretch overflow-x-auto border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" },
      el("div", { class: "flex items-center px-3 text-sm font-bold tracking-wide text-sky-800 uppercase dark:text-sky-300" }, "Mise en plan"),
      group("Sélection", button("Choisir", "↖", () => this.setTool(null), "select")),
      group("Vues",
        button("Vue de base", "▣", use((h) => new BaseViewTool(h)), "base"),
        button("Projetée", "⊞", use((h) => new ProjectedViewTool(h, this.selection[0] ?? null)), "projected", "Vue projetée : tirée d'une vue, à côté, dessus, dessous ou en biais"),
        button("Coupe", "⊟", use((h) => new SectionTool(h)), "section", "Coupe : un trait sur une vue, puis la place de la coupe"),
        button("Détail", "◎", use((h) => new DetailTool(h)), "detail", "Vue de détail : un cercle sur une vue, agrandi")),
      group("Cotes",
        button("Cote", "↔", use((h) => new DimensionTool(h)), "dimension", "Cote : deux points, puis tirer (horizontale, verticale ; Maj : alignée)"),
        button("Diamètre", "⌀", use((h) => new CircleDimensionTool(h, "diameter")), "circle-dimension-d"),
        button("Rayon", "R", use((h) => new CircleDimensionTool(h, "radius")), "circle-dimension-r"),
        button("Angle", "∠", use((h) => new AngleTool(h)), "angle")),
      group("Annoter",
        button("Texte", "T", use((h) => new LabelTool(h, "text")), "text"),
        button("Note", "↘", use((h) => new LabelTool(h, "note")), "note", "Note avec ligne de rappel"),
        button("Repère", "①", use((h) => new LabelTool(h, "balloon")), "balloon", "Repère numéroté d'une pièce (le numéro de la nomenclature)"),
        button("Nomenclature", "☰", use((h) => new LabelTool(h, "bom")), "bom")),
      group("Dessin 2D",
        button("Ligne", "╱", use((h) => new SketchTool(h, "line")), "sketch-line"),
        button("Rectangle", "▭", use((h) => new SketchTool(h, "rect")), "sketch-rect"),
        button("Cercle", "○", use((h) => new SketchTool(h, "circle")), "sketch-circle")),
      group("Exporter",
        button("PDF", "⎙", () => this.exportPdf(), undefined, "Imprimer ou enregistrer en PDF (toutes les feuilles)"),
        button("DXF", "⬇", () => downloadText(`${this.fileName()}.dxf`, sheetDxf(this.sheet(), this.layout, (mm) => formatLength(mm, this.editor.unit), this.bom()), "application/dxf"), undefined, "Feuille en DXF, par calques"),
        button("SVG", "⬇", () => downloadText(`${this.fileName()}.svg`, this.sheetSvg(this.sheet()), "image/svg+xml"))),
      el("div", { class: "flex-1" }),
      el("div", { class: "flex items-center px-2" }, (() => {
        const close = el("button", { type: "button", class: "h-9 btn-accent px-4 text-sm font-medium", "data-drawing-close": "" }, "Fermer la mise en plan");
        close.addEventListener("click", () => this.close());
        return close;
      })()),
    );
  }

  private fileName(): string {
    return `${this.title()} - ${this.sheet().name}`.replace(/[\\/:*?"<>|]/g, "-");
  }

  private sheetSvg(sheet: DrawingSheet): string {
    const index = this.sheets.findIndex((s) => s.id === sheet.id);
    return renderSheet(sheet, this.layout, { format: (mm) => formatLength(mm, this.editor.unit), bom: this.bom(), page: [index + 1, this.sheets.length] });
  }

  private exportPdf(): void {
    const pages = this.sheets.map((s) => `<div class="page">${this.sheetSvg(s)}</div>`).join("");
    printHtml(this.title(), pages, `@page{size:${this.sheet().format} landscape;margin:0} body{margin:0} .page{page-break-after:always;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center} .page svg{width:100%;height:100%}`);
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
    const sheet = this.sheet();
    const near = (a: Vec2, b: Vec2) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const bom = this.bom();
    for (const a of [...sheet.annotations].reverse()) {
      if (a.kind === "bom") {
        const { size } = bomSvg(a.at, bom);
        if (p[0] >= a.at[0] && p[0] <= a.at[0] + size[0] && p[1] >= a.at[1] && p[1] <= a.at[1] + size[1]) return a.id;
        continue;
      }
      const d = drawAnnotation(sheet, this.layout, a, (mm) => formatLength(mm, this.editor.unit), () => 1);
      if (d.lines.some(([x, y]) => near(x, y) < 1.5) || d.texts.some((t) => Math.hypot(t.at[0] - p[0], t.at[1] - 1.5 - p[1]) < Math.max(3, t.text.length * t.size * 0.3)) || d.circles.some((c) => Math.hypot(c.center[0] - p[0], c.center[1] - p[1]) < c.radius + 1)) return a.id;
    }
    const { scale, origin } = sheet.sketch;
    const sp = (v: Vec2): Vec2 => [origin[0] + v[0] / scale, origin[1] - v[1] / scale];
    for (const i of [...sheet.sketch.items].reverse()) {
      if (i.kind === "line" && near(sp(i.a), sp(i.b)) < 1.5) return i.id;
      if (i.kind === "rect") {
        const [a, b] = [sp(i.a), sp(i.b)];
        const c: Vec2[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
        if (c.some((q, k) => near(q, c[(k + 1) % 4]!) < 1.5)) return i.id;
      }
      if (i.kind === "circle" && Math.abs(Math.hypot(sp(i.center)[0] - p[0], sp(i.center)[1] - p[1]) - i.radius / scale) < 1.5) return i.id;
    }
    return this.layout.viewAt(sheet, p, 1)?.id ?? null;
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
        const drawn = drawAnnotation(sheet, this.layout, a, () => "", () => null);
        const [s, e] = drawn.lines.at(-1) ?? [[0, 0], [1, 0]];
        const dir: Vec2 = [(e[0] - s[0]) / (Math.hypot(e[0] - s[0], e[1] - s[1]) || 1), (e[1] - s[1]) / (Math.hypot(e[0] - s[0], e[1] - s[1]) || 1)];
        const shift = (p[0] - (s[0] + e[0]) / 2) * -dir[1] + (p[1] - (s[1] + e[1]) / 2) * dir[0];
        return { ...sheet, annotations: sheet.annotations.map((x) => (x.id === id ? { ...a, offset: a.offset + shift } : x)) };
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
      drag = { id: this.tool && event.button === 0 ? null : id, start: p, last: p, screen: [event.clientX, event.clientY], view: { x: this.view.x, y: this.view.y }, moved: false };
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
      if (wasDrag?.moved) {
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
        let out = s;
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

/** The « Mise en plan » button opens the workspace; it follows every change of the model while open. */
export function bindDrawingWorkspace(root: HTMLElement, viewport: Viewport, editor: Editor): void {
  let open: DrawingWorkspace | null = null;
  // The button of the top bar (a workspace of its own, as in Fusion) and the one of the Atelier group.
  for (const button of root.querySelectorAll('[data-workshop="drawing"]')) {
    button.addEventListener("click", () => {
      if (open) return;
      open = new DrawingWorkspace(editor, viewport, () => (open = null));
    });
  }
  const previous = editor.onRender;
  editor.onRender = () => {
    previous();
    open?.render();
  };
}
