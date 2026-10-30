/**
 * Outline of the sketch texts for the screen: the same font and the same placement as the kernel (letters from the
 * baseline at (x, y), turned by the angle), flattened into polylines. Until the font is loaded nothing is drawn;
 * `onTextFont` is told when it is.
 */
import { parse, type Font } from "opentype.js";
import type { SketchText } from "../document/types";
import type { Vec2 } from "./edit";

let font: Font | null = null;
const waiting: (() => void)[] = [];

/** Reads the font from its bytes (once) and tells who waited for it. */
export function setTextFont(bytes: ArrayBuffer): void {
  if (font) return;
  font = parse(bytes);
  for (const f of waiting.splice(0)) f();
}

export function onTextFont(listener: () => void): void {
  if (font) listener();
  else waiting.push(listener);
}

/** Closed polylines of a text's letters, in sketch coordinates. */
export function textOutlines(t: SketchText): Vec2[][] {
  if (!font || !t.text.trim()) return [];
  const angle = ((t.angle ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  // Font paths run with y down: flipped, then turned and placed like the kernel's letters.
  const place = (x: number, y: number): Vec2 => [t.x + x * c + y * s, t.y + x * s - y * c];
  const out: Vec2[][] = [];
  let current: Vec2[] = [];
  let last: [number, number] = [0, 0];
  const steps = 6;
  for (const cmd of font.getPath(t.text, 0, 0, t.height).commands) {
    if (cmd.type === "M") {
      if (current.length > 1) out.push(current);
      current = [place(cmd.x, cmd.y)];
      last = [cmd.x, cmd.y];
    } else if (cmd.type === "L") {
      current.push(place(cmd.x, cmd.y));
      last = [cmd.x, cmd.y];
    } else if (cmd.type === "Q") {
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const x = (1 - k) ** 2 * last[0] + 2 * (1 - k) * k * cmd.x1 + k * k * cmd.x;
        const y = (1 - k) ** 2 * last[1] + 2 * (1 - k) * k * cmd.y1 + k * k * cmd.y;
        current.push(place(x, y));
      }
      last = [cmd.x, cmd.y];
    } else if (cmd.type === "C") {
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const m = 1 - k;
        const x = m ** 3 * last[0] + 3 * m * m * k * cmd.x1 + 3 * m * k * k * cmd.x2 + k ** 3 * cmd.x;
        const y = m ** 3 * last[1] + 3 * m * m * k * cmd.y1 + 3 * m * k * k * cmd.y2 + k ** 3 * cmd.y;
        current.push(place(x, y));
      }
      last = [cmd.x, cmd.y];
    } else if (cmd.type === "Z") {
      if (current.length > 1) out.push([...current, current[0]!]);
      current = [];
    }
  }
  if (current.length > 1) out.push(current);
  return out;
}

/** Box around a text's letters (or a small box at its start before the font is there). */
export function textBox(t: SketchText): [Vec2, Vec2] {
  const pts = textOutlines(t).flat();
  if (!pts.length) return [[t.x, t.y], [t.x + t.height * t.text.length * 0.5, t.y + t.height]];
  return [
    [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))],
    [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
  ];
}
