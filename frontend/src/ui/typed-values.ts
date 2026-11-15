/**
 * Les mesures tapées au clavier pendant qu'un outil suit le pointeur (comme dans « Dessiner sur le corps ») : les
 * chiffres — ou un calcul, (190+100)/2 — vont dans la case des mesures en bas de la vue (ui/value-box.ts), sans cliquer un champ ; « ; » sépare
 * deux valeurs (retrait;largeur), Retour arrière efface, Échap vide la saisie, Entrée l'applique — l'outil dit ce
 * qu'elle veut dire. Rien n'est pris quand on tape dans un champ, ni avec Ctrl, ⌘ ou Alt.
 */
import { expressionKey } from "./digit-keys";
import { evaluateTyped, repairBrackets } from "../measurements/typed-expression";
import { ValueBox } from "./value-box";

/** Keys taken: digits, decimal separators, the signs of a calculation, the separators of two values. */
const TYPING = /^[0-9.,;\- +*/()×÷]$/;

export class TypedValues {
  readonly box: ValueBox;
  /** What is being typed; null: nothing, the live reading shows. */
  private buffer: string | null = null;

  constructor(
    container: HTMLElement,
    /** Whether typing is taken now (the tool is at a step that takes values). */
    private readonly active: () => boolean,
    /** The values typed, Entrée pressed: in the display unit, as typed. The text, to say what is wrong. */
    private readonly apply: (values: (number | null)[], text: string) => void,
    /** Something typed or erased: the box to show again. */
    private readonly changed: () => void,
  ) {
    this.box = new ValueBox(container);
    window.addEventListener("keydown", this.onKey, true);
  }

  /** Whether something is being typed. */
  get typing(): boolean {
    return this.buffer !== null;
  }

  /** Shows what is being typed, over the live reading. */
  refresh(): void {
    this.box.setTyped(this.buffer);
  }

  clear(): void {
    this.buffer = null;
    this.refresh();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!this.active() || (target && target.closest("input, textarea, select, [contenteditable=true]")) || event.ctrlKey || event.metaKey || event.altKey) return;
    const consume = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.refresh();
      this.changed();
    };
    // The digit row without Maj (AZERTY) types its digits too.
    const key = expressionKey(event) ?? event.key;
    if (TYPING.test(key)) {
      if (key === " " && this.buffer === null) return;
      this.buffer = key === ")" ? repairBrackets(`${this.buffer ?? ""})`) : (this.buffer ?? "") + key;
      return consume();
    }
    if (this.buffer === null) return;
    if (event.key === "Backspace") {
      this.buffer = this.buffer.slice(0, -1) || null;
      return consume();
    }
    if (event.key === "Escape") {
      this.buffer = null;
      return consume();
    }
    if (event.key === "Enter") {
      const text = this.buffer;
      this.buffer = null;
      // Each one a number or a calculation ((190+100)/2): a calculation keeps its spaces, only « ; » parts it then.
      const t = text.trim();
      const values = t === "" ? [] : t.split(/[-+*/×÷(]/.test(t.replace(/^-/, "")) ? /\s*;\s*/ : /\s*;\s*|\s+/).map((p) => (p === "" ? null : evaluateTyped(p)));
      consume();
      if (values.length) this.apply(values, text);
    }
  };

  dispose(): void {
    window.removeEventListener("keydown", this.onKey, true);
    this.box.dispose();
  }
}
