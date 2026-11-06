/** Une fiche de l'aide : ce que fait un outil et comment s'en servir, écrite pour le menuisier qui l'utilise. */
export interface ToolHelp {
  /** The tools it explains, by keyOf (ribbon-layout.ts): their button gives the icon and "Ouvrir l'outil". Empty for a part of the screen. */
  keys: string[];
  /** For a button keyOf doesn't name (the bar beside the view, the Navigator…): a CSS selector. */
  selector?: string;
  /** Its name, the one on screen. */
  name: string;
  /** What it is for, in one sentence. */
  what: string;
  /** How to use it, one action a step. */
  steps: string[];
  /** What is worth knowing: a limit, a trap, a shortcut. */
  tip?: string;
}

export interface HelpFamily {
  title: string;
  /** Where it is on screen. */
  where: string;
  tools: ToolHelp[];
}
