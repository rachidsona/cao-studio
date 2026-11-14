/**
 * Les cotes saisies au clavier pendant le tracé, comme dans Fusion 360. Le premier point cliqué, les cotes de la
 * forme sont des cases : on tape une valeur (elle va dans la case en bleu, la forme la prend aussitôt), Tab la
 * verrouille et passe à la case suivante, Entrée (ou un clic) pose la forme. Ce qui n'est pas tapé suit la souris,
 * qui donne aussi le sens (à droite ou à gauche, en haut ou en bas).
 *  - rectangle : largeur, puis hauteur ;
 *  - ligne : longueur, puis angle sur l'horizontale ;
 *  - cercle : diamètre.
 * Chaque valeur tapée devient une cote de l'esquisse (longueur, diamètre), comme dans Fusion : la forme garde sa
 * mesure. L'angle d'une ligne oriente le trait sans poser de cote. État et géométrie purs : le pointeur
 * (sketch-pointer.ts) s'en sert pour placer le curseur, l'esquisse pour dessiner les cases (overlay.ts).
 */
import { solveSketch } from "../constraints/solver";
import type { SketchConstraint, SketchGeometry } from "../document/sketch";
import type { DisplayUnit } from "../document/types";
import { fromDisplay, parseNumber, toDisplay, trim } from "../measurements/units";
import type { Annotation } from "./annotations";
import { addConstraint, findCurve, pointPos, type Vec2 } from "./edit";

/** A dimension one types: width and height of a rectangle, length and angle of a line, diameter of a circle. */
export type DimField = "w" | "h" | "l" | "a" | "c";
export type TypedValues = Partial<Record<DimField, number>>;

const FIELDS: Record<string, readonly DimField[]> = { rectangle: ["w", "h"], "rectangle-center": ["w", "h"], line: ["l", "a"], circle: ["c"], "circle-2pt": ["c"] };
const NAMES: Record<DimField, string> = { w: "Largeur", h: "Hauteur", l: "Longueur", a: "Angle", c: "Diamètre" };

/** The dimensions one can type for a tool (none: the tool has none). */
export const typedFields = (tool: string | undefined): readonly DimField[] => (tool ? (FIELDS[tool] ?? []) : []);

export class TypedDims {
  /** What is being typed in the field that takes the keys. */
  private text = "";
  private active = 0;
  /** The values kept with Tab (mm, degrees for the angle). */
  private readonly locked = new Map<DimField, number>();

  reset(): void {
    this.text = "";
    this.active = 0;
    this.locked.clear();
  }

  /** Nothing typed, nothing kept: the shape follows the pointer. */
  get empty(): boolean {
    return this.text === "" && this.locked.size === 0;
  }

  /** A digit, a point or a comma typed: into the active field. False: not a key of a number. */
  type(tool: string, key: string): boolean {
    if (!typedFields(tool).length || !/^[0-9.,]$/.test(key)) return false;
    // One decimal sign.
    if (/[.,]/.test(key) && /[.,]/.test(this.text)) return true;
    this.text += key;
    return true;
  }

  /** Retour arrière: the last character typed; nothing typed, the value kept in the active field. False: nothing to erase. */
  erase(tool: string): boolean {
    const field = typedFields(tool)[this.active];
    if (this.text) this.text = this.text.slice(0, -1);
    else if (field && this.locked.has(field)) this.locked.delete(field);
    else return false;
    return true;
  }

  /** A value given to a field (by the calculator): kept, and the next field takes the keys. */
  set(tool: string, field: DimField, value: number): void {
    const fields = typedFields(tool);
    const at = fields.indexOf(field);
    if (at < 0) return;
    this.locked.set(field, value);
    this.text = "";
    this.active = (at + 1) % fields.length;
  }

  /** Tab: what is typed is kept, the next field takes the keys. False: the tool has no fields. */
  next(tool: string, unit: DisplayUnit): boolean {
    const fields = typedFields(tool);
    if (!fields.length) return false;
    const value = this.typed(fields[this.active]!, unit);
    if (value !== null) this.locked.set(fields[this.active]!, value);
    this.text = "";
    this.active = (this.active + 1) % fields.length;
    return true;
  }

  /** The number being typed in a field, in mm (degrees for the angle); null: nothing whole yet. */
  private typed(field: DimField, unit: DisplayUnit): number | null {
    const n = this.text ? parseNumber(this.text) : null;
    if (n === null || !(field === "a" ? n >= 0 && n <= 360 : n > 0)) return null;
    return field === "a" ? n : fromDisplay(n, unit);
  }

  /** The values in force: those kept, and the one being typed. */
  values(tool: string, unit: DisplayUnit): TypedValues {
    const fields = typedFields(tool);
    const out: TypedValues = Object.fromEntries([...this.locked].filter(([field]) => fields.includes(field)));
    const field = fields[this.active];
    const value = field ? this.typed(field, unit) : null;
    if (field && value !== null) out[field] = value;
    return out;
  }

  /** Where the values put the pointer: the shape from `anchor` to there has them; what is not typed follows `cursor`. */
  constrain(tool: string, unit: DisplayUnit, anchor: Vec2, cursor: Vec2): Vec2 {
    return constrained(tool, this.values(tool, unit), anchor, cursor);
  }

  /**
   * The live measurements of the shape as fields: the active one, those kept, the others — with what is being typed
   * in place of the measurement. A line gets its angle too. `px`: mm per pixel, to place it.
   */
  decorate(tool: string, unit: DisplayUnit, annotations: Annotation[], line: [Vec2, Vec2] | null, px: number): Annotation[] {
    const fields = typedFields(tool);
    if (!fields.length) return annotations;
    const state = (field: DimField): NonNullable<Annotation["field"]>["state"] => (fields[this.active] === field ? "active" : this.locked.has(field) ? "locked" : "idle");
    const shown = (field: DimField, measured: string) => {
      if (fields[this.active] === field && this.text) return this.text;
      const kept = this.locked.get(field);
      return kept === undefined ? measured : field === "a" ? `${trim(kept, 2)}°` : trim(toDisplay(kept, unit), 3);
    };
    const out = annotations.map((a) => {
      const field = fields.find((f) => a.key === `preview:${f}`);
      return field ? { ...a, text: shown(field, a.text), field: { id: field, state: state(field), name: NAMES[field] } } : a;
    });
    if (tool === "line" && line) {
      const [a, b] = line;
      const turn = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const degrees = Math.abs((turn * 180) / Math.PI);
      // Beside the start, between the horizontal and the line.
      const at: Vec2 = [a[0] + 46 * px * Math.cos(turn / 2), a[1] + 46 * px * Math.sin(turn / 2)];
      out.push({ key: "preview:a", role: "preview", shape: { kind: "label", at }, value: degrees, angle: true, text: shown("a", `${trim(degrees, 1)}°`), field: { id: "a", state: state("a"), name: NAMES.a } });
    }
    return out;
  }
}

/** The end of the shape started at `anchor`: with the values typed, the rest and the side from `cursor`. */
export function constrained(tool: string, values: TypedValues, anchor: Vec2, cursor: Vec2): Vec2 {
  const [dx, dy] = [cursor[0] - anchor[0], cursor[1] - anchor[1]];
  if (tool === "rectangle" || tool === "rectangle-center") {
    // From its centre, a corner is half the width away.
    const k = tool === "rectangle" ? 1 : 0.5;
    return [values.w === undefined ? cursor[0] : anchor[0] + (dx < 0 ? -values.w : values.w) * k, values.h === undefined ? cursor[1] : anchor[1] + (dy < 0 ? -values.h : values.h) * k];
  }
  const far = Math.hypot(dx, dy);
  if (tool === "circle-2pt") {
    // The other end of the diameter, the diameter away, towards the pointer.
    if (values.c === undefined) return cursor;
    return far < 1e-9 ? [anchor[0] + values.c, anchor[1]] : [anchor[0] + (dx / far) * values.c, anchor[1] + (dy / far) * values.c];
  }
  if (tool === "circle") {
    if (values.c === undefined) return cursor;
    const r = values.c / 2;
    return far < 1e-9 ? [anchor[0] + r, anchor[1]] : [anchor[0] + (dx / far) * r, anchor[1] + (dy / far) * r];
  }
  if (tool !== "line" || (values.l === undefined && values.a === undefined)) return cursor;
  let turn = far < 1e-9 ? 0 : Math.atan2(dy, dx);
  if (values.a !== undefined) {
    // The angle on the horizontal, on the side the pointer is: of its four directions, the nearest to the pointer.
    const a = (values.a * Math.PI) / 180;
    const apart = (t: number) => Math.abs(Math.atan2(Math.sin(t - turn), Math.cos(t - turn)));
    turn = [a, -a, Math.PI - a, a - Math.PI].reduce((best, t) => (apart(t) < apart(best) - 1e-12 ? t : best));
  }
  // Without a length, as far as the pointer is along the direction.
  const length = values.l ?? Math.abs(dx * Math.cos(turn) + dy * Math.sin(turn));
  return [anchor[0] + length * Math.cos(turn), anchor[1] + length * Math.sin(turn)];
}

/**
 * The shape just drawn (`created`: its curves) with a dimension for each value typed: the length of a side, of a
 * line, the diameter of a circle. A dimension the sketch cannot take (it would contradict what the shape is tied
 * to) is left out: the shape stays as drawn.
 */
export function withTypedDimensions(base: SketchGeometry, created: readonly string[], tool: string, values: TypedValues): SketchGeometry {
  const lines = created.map((id) => findCurve(base, id)).filter((c): c is NonNullable<typeof c> & { kind: "line" } => c?.kind === "line");
  const along = (axis: 0 | 1) => lines.find((l) => Math.abs(pointPos(base, l.p1)[1 - axis]! - pointPos(base, l.p2)[1 - axis]!) < 1e-9)?.id;
  const wanted: Omit<SketchConstraint, "id">[] = [];
  const add = (constraint: object) => wanted.push(constraint as Omit<SketchConstraint, "id">);
  if (tool === "rectangle" || tool === "rectangle-center") {
    const [across, up] = [along(0), along(1)];
    if (values.w !== undefined && across) add({ kind: "length", line: across, value: values.w });
    if (values.h !== undefined && up) add({ kind: "length", line: up, value: values.h });
  } else if (tool === "line" && values.l !== undefined && lines[0]) add({ kind: "length", line: lines[0].id, value: values.l });
  else if ((tool === "circle" || tool === "circle-2pt") && values.c !== undefined && created[0]) add({ kind: "diameter", curve: created[0], value: values.c });
  let geometry = base;
  for (const constraint of wanted) {
    const added = addConstraint(geometry, constraint).geometry;
    try {
      if (solveSketch(added).state === "ok") geometry = added;
    } catch {
      // Left out.
    }
  }
  return geometry;
}
