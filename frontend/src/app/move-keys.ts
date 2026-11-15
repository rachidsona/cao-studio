/**
 * Le clavier de Déplacer, comme celui de SketchUp : pendant le déplacement, ce qu'on tape s'écrit dans la case de
 * mesure (sans cliquer dedans) et Entrée l'applique — une distance (« 250 ») le long de la direction prise, un
 * vecteur (« 10;20;0 »), un calcul (« (190+100)/2 », « 2*70 »), « x5 » (ou « *5 », « 5x ») pour cinq copies au même pas, « /5 » pour cinq copies réparties
 * jusqu'au point visé. Les flèches bloquent un axe (→ X rouge, ← Y vert, ↑ Z bleu ; ↓ ou la même flèche le libère) ;
 * Alt (⌥) allume ou éteint la copie. Rien n'est pris quand on tape dans un champ du panneau.
 */
import { expressionKey } from "../ui/digit-keys";
import { evaluateTyped, repairBrackets } from "../measurements/typed-expression";
import type { Vec3 } from "../document/types";
import { fromDisplay } from "../measurements/units";
import type { DisplayUnit } from "../document/types";

export type Typed =
  | { kind: "distance"; value: number }
  | { kind: "vector"; value: Vec3 }
  /** Copies at the same step as the move (x5). */
  | { kind: "copies"; count: number }
  /** Copies spread up to the point reached (/5). */
  | { kind: "divide"; count: number };

/** What a text typed during a move asks for (lengths in mm), or null when it means nothing. */
export function parseTyped(text: string, unit: DisplayUnit): Typed | null {
  const t = text.trim().replace(/\s+/g, "");
  if (!t) return null;
  const count = /^(?:[x*×](\d+)|(\d+)[x*×])$/i.exec(t);
  if (count) {
    const n = Number(count[1] ?? count[2]);
    return n >= 1 && n <= 100 ? { kind: "copies", count: n } : null;
  }
  const divide = /^\/(\d+)$/.exec(t);
  if (divide) {
    const n = Number(divide[1]);
    return n >= 2 && n <= 100 ? { kind: "divide", count: n } : null;
  }
  // Each a number or a calculation: (190+100)/2, 2*70.
  const parts = t.split(";");
  if (parts.length === 3) {
    const v = parts.map((p) => evaluateTyped(p));
    return v.every((x) => x !== null) ? { kind: "vector", value: v.map((x) => fromDisplay(x!, unit)) as Vec3 } : null;
  }
  const value = evaluateTyped(t);
  return value === null ? null : { kind: "distance", value: fromDisplay(value, unit) };
}

/** The axis an arrow key locks: → X, ← Y, ↑ Z; ↓ frees it (null). Undefined: not an arrow. */
export function arrowAxis(key: string): 0 | 1 | 2 | null | undefined {
  return ({ ArrowRight: 0, ArrowLeft: 1, ArrowUp: 2, ArrowDown: null } as Record<string, 0 | 1 | 2 | null>)[key];
}

export interface MoveKeyHandlers {
  /** The text typed so far changed (shown in the panel). */
  typing(text: string): void;
  /** Entrée with a text typed. */
  apply(typed: Typed | null, text: string): void;
  /** An arrow: the axis locked, or null to free it. */
  axis(axis: 0 | 1 | 2 | null): void;
  /** Alt pressed alone: the copy turned on or off. */
  toggleCopy(): void;
}

const TYPABLE = /^[0-9.,;x*×/\-+()÷]$/i;

export class MoveKeys {
  text = "";
  private altAlone = false;
  private readonly down = (event: KeyboardEvent) => this.onDown(event);
  private readonly up = (event: KeyboardEvent) => this.onUp(event);

  constructor(
    private readonly handlers: MoveKeyHandlers,
    private readonly unit: () => DisplayUnit,
  ) {
    window.addEventListener("keydown", this.down, true);
    window.addEventListener("keyup", this.up, true);
  }

  private onDown(event: KeyboardEvent): void {
    this.altAlone = event.key === "Alt" && !event.repeat;
    const target = event.target as HTMLElement | null;
    // Typing in a field of the panel is the field's.
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (event.ctrlKey || event.metaKey) return;
    const axis = arrowAxis(event.key);
    if (axis !== undefined) {
      this.handlers.axis(axis);
    } else if (TYPABLE.test(expressionKey(event) ?? event.key) && !event.altKey) {
      // The digit row without Maj (AZERTY) types its digits too; a « ) » makes its « ( » a bracket again.
      const key = expressionKey(event) ?? event.key;
      this.text = key === ")" ? repairBrackets(`${this.text})`) : this.text + key;
      this.handlers.typing(this.text);
    } else if (event.key === "Backspace" && this.text) {
      this.text = this.text.slice(0, -1);
      this.handlers.typing(this.text);
    } else if (event.key === "Enter" && this.text) {
      const text = this.text;
      this.text = "";
      this.handlers.apply(parseTyped(text, this.unit()), text);
    } else if (event.key === "Escape" && this.text) {
      this.text = "";
      this.handlers.typing("");
    } else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private onUp(event: KeyboardEvent): void {
    if (event.key === "Alt" && this.altAlone) this.handlers.toggleCopy();
    this.altAlone = false;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.down, true);
    window.removeEventListener("keyup", this.up, true);
  }
}
