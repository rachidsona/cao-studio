/**
 * Le dessin 2D libre de la mise en plan : ligne, rectangle, cercle, en millimètres réels à l'échelle du dessin de la
 * feuille (une feuille sans vue est alors un plan 2D). Accroché aux bouts des traits, Maj pour rester d'équerre, la
 * longueur (ou le rayon, la largeur) tapée au clavier puis Entrée ; une ligne continue depuis son bout.
 */
import { keyChar } from "../../ui/digit-keys";
import { freshId, sheetIds, type Sketch2D, type Vec2 } from "../../drawing/model";
import { GHOST, dot, ghostLine, ghostRect, type DrawingTool, type ToolHost } from "./tools";

const f = (n: number) => n.toFixed(2);

/** The free 2D drawing: line, rectangle or circle, at the sheet's drawing scale (real mm); a length can be typed. */
export class SketchTool implements DrawingTool {
  readonly name: string;
  private start: Vec2 | null = null;
  private at: Vec2 | null = null;
  private typed = "";
  constructor(private readonly host: ToolHost, private readonly kind: Sketch2D["kind"]) {
    this.name = `sketch-${kind}`;
  }
  hint() {
    const what = this.kind === "line" ? "la ligne" : this.kind === "rect" ? "le rectangle" : "le cercle";
    if (!this.start) return `Cliquez le début de ${what} (accroché aux bouts des traits).`;
    return `${this.typed ? `Longueur : ${this.typed} mm — Entrée` : `Cliquez la fin, ou tapez ${this.kind === "circle" ? "le rayon" : this.kind === "rect" ? "la largeur" : "la longueur"} (mm) ; Maj : d'équerre`}. Échap : fini.`;
  }
  private toReal(p: Vec2): Vec2 {
    const { scale, origin } = this.host.sheet().sketch;
    return [(p[0] - origin[0]) * scale, (origin[1] - p[1]) * scale];
  }
  private toPaper(v: Vec2): Vec2 {
    const { scale, origin } = this.host.sheet().sketch;
    return [origin[0] + v[0] / scale, origin[1] - v[1] / scale];
  }
  /** On the end of a drawn line or a corner within 2 mm of paper; Maj keeps it square to the start. */
  private snap(p: Vec2, event: MouseEvent): Vec2 {
    const ends = this.host.sheet().sketch.items.flatMap((i) => (i.kind === "circle" ? [i.center] : i.kind === "rect" ? [i.a, i.b, [i.a[0], i.b[1]] as Vec2, [i.b[0], i.a[1]] as Vec2] : [i.a, i.b]));
    const near = ends.map((e) => ({ e, d: Math.hypot(this.toPaper(e)[0] - p[0], this.toPaper(e)[1] - p[1]) })).sort((a, b) => a.d - b.d)[0];
    let real = near && near.d < 2 ? near.e : this.toReal(p);
    if (this.start && event.shiftKey) real = Math.abs(real[0] - this.start[0]) > Math.abs(real[1] - this.start[1]) ? [real[0], this.start[1]] : [this.start[0], real[1]];
    return [Number(real[0].toFixed(3)), Number(real[1].toFixed(3))];
  }
  move(p: Vec2, event: MouseEvent) {
    this.at = this.snap(p, event);
    this.host.redraw();
  }
  private finish(end: Vec2) {
    const start = this.start!;
    const id = freshId(sheetIds(this.host.sheet()), "draw");
    const style = this.host.options.style;
    const item: Sketch2D =
      this.kind === "circle" ? { id, kind: "circle", center: start, radius: Math.hypot(end[0] - start[0], end[1] - start[1]), style } : { id, kind: this.kind, a: start, b: end, style };
    if (item.kind === "circle" ? item.radius < 1e-6 : Math.hypot(end[0] - start[0], end[1] - start[1]) < 1e-6) return;
    this.host.update((s) => ({ ...s, sketch: { ...s.sketch, items: [...s.sketch.items, item] } }));
    // A line goes on from its end; a rectangle or a circle starts again.
    this.start = this.kind === "line" ? end : null;
    this.typed = "";
  }
  click(p: Vec2, event: MouseEvent) {
    const q = this.snap(p, event);
    if (!this.start) {
      this.start = q;
      return this.host.redraw();
    }
    this.finish(q);
  }
  key(event: KeyboardEvent): boolean {
    if (!this.start) return false;
    // The digit row without Maj (AZERTY) types its digits too.
    const typed = keyChar(event);
    if (/^[\d.,]$/.test(typed)) this.typed += typed === "," ? "." : typed;
    else if (event.key === "Backspace") this.typed = this.typed.slice(0, -1);
    else if (event.key === "Enter" && this.typed) {
      const length = Number(this.typed);
      const at = this.at ?? [this.start[0] + 1, this.start[1]];
      const d = Math.hypot(at[0] - this.start[0], at[1] - this.start[1]) || 1;
      const dir: Vec2 = [(at[0] - this.start[0]) / d, (at[1] - this.start[1]) / d];
      // A rectangle typed by its width keeps the proportions of the one being drawn.
      const end: Vec2 = this.kind === "rect" ? [this.start[0] + Math.sign(dir[0] || 1) * length, at[1]] : [this.start[0] + dir[0] * length, this.start[1] + dir[1] * length];
      if (length > 0) this.finish(end);
    } else return false;
    this.host.redraw();
    return true;
  }
  preview() {
    if (!this.start || !this.at) return this.at ? dot(this.toPaper(this.at)) : "";
    const [a, b] = [this.toPaper(this.start), this.toPaper(this.at)];
    const label = `<text x="${f(b[0] + 2)}" y="${f(b[1] - 2)}" font-size="3" fill="#ea580c">${this.typed || Number(Math.hypot(this.at[0] - this.start[0], this.at[1] - this.start[1]).toFixed(1))}</text>`;
    if (this.kind === "line") return ghostLine(a, b) + label;
    if (this.kind === "rect") return ghostRect(a, b) + label;
    return `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="${f(Math.hypot(b[0] - a[0], b[1] - a[1]))}" ${GHOST}/>` + label;
  }
}
