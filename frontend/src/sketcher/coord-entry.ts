/**
 * La saisie par coordonnées pendant le tracé, comme en DAO : un outil de dessin ouvert, « @ » ouvre une saisie
 * relative (depuis le dernier point posé, l'origine pour le premier), « # » une saisie absolue (depuis l'origine).
 * On y tape « x;y » (ou « x,y »), ou « distance<angle » en polaire (l'angle en degrés depuis l'horizontale, dans le
 * sens inverse des aiguilles) ; Entrée pose le point à cet endroit, Retour arrière efface, Échap annule. Les longueurs
 * sont dans l'unité du projet. Le point visé se voit pendant la frappe.
 */
import type { DisplayUnit } from "../document/types";
import { fromDisplay, parseNumber } from "../measurements/units";
import type { Vec2 } from "./edit";

/** Keys a coordinate is typed with: digits, decimal signs, the separators, the angle sign, a minus. */
const TYPING = /^[0-9.,;<\- ]$/;

/** The two numbers of « x;y » (« x,y » with a single comma; « 12,5;30 » keeps its decimal comma). */
function pair(text: string): [number, number] | null {
  const parts = text.includes(";") ? text.split(";") : (text.match(/,/g) ?? []).length === 1 ? text.split(",") : text.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map((p) => parseNumber(p));
  return a === null || b === null || a === undefined || b === undefined ? null : [a, b];
}

/**
 * Where a coordinate typed puts the point (null: not whole yet). `from`: the last point laid (relative entry), null
 * for the first point (from the origin).
 */
export function parseCoordinates(text: string, relative: boolean, from: Vec2 | null, unit: DisplayUnit): Vec2 | null {
  const base: Vec2 = relative && from ? from : [0, 0];
  const t = text.trim();
  const polar = /^([^<]+)<([^<]+)$/.exec(t);
  if (polar) {
    const distance = parseNumber(polar[1]!);
    const angle = parseNumber(polar[2]!);
    if (distance === null || angle === null) return null;
    const d = fromDisplay(distance, unit);
    const a = (angle * Math.PI) / 180;
    return [base[0] + d * Math.cos(a), base[1] + d * Math.sin(a)];
  }
  const xy = pair(t);
  if (!xy) return null;
  return [base[0] + fromDisplay(xy[0], unit), base[1] + fromDisplay(xy[1], unit)];
}

/** What is being typed: none, or the text and how it is read. */
export class CoordEntry {
  private text: string | null = null;
  private relative = true;

  get active(): boolean {
    return this.text !== null;
  }

  clear(): void {
    this.text = null;
  }

  /** The point aimed at now (null: nothing whole typed). */
  target(from: Vec2 | null, unit: DisplayUnit): Vec2 | null {
    return this.text === null ? null : parseCoordinates(this.text, this.relative, from, unit);
  }

  /** What the status bar says while typing. */
  hint(): string | null {
    if (this.text === null) return null;
    const how = this.relative ? "relatives, depuis le dernier point" : "absolues, depuis l'origine";
    return `Coordonnées ${how} : ${this.relative ? "@" : "#"}${this.text}▏ — x;y ou distance<angle, Entrée pose le point, Échap annule`;
  }

  /**
   * A key: « @ » or « # » opens the entry, the others type in it. « enter »: the point is to be laid; « cancel »:
   * the entry closed; « typed »: the text changed; null: not for it.
   */
  key(key: string): "typed" | "enter" | "cancel" | null {
    if (this.text === null) {
      if (key !== "@" && key !== "#") return null;
      this.text = "";
      this.relative = key === "@";
      return "typed";
    }
    if (key === "Escape") return (this.text = null), "cancel";
    if (key === "Backspace") {
      if (this.text === "") this.text = null;
      else this.text = this.text.slice(0, -1);
      return "typed";
    }
    if (key === "Enter") return "enter";
    // « @ » and « # » switch between relative and absolute.
    if (key === "@" || key === "#") return (this.relative = key === "@"), "typed";
    if (TYPING.test(key)) return (this.text += key), "typed";
    return "typed";
  }
}
