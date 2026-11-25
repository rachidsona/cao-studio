/**
 * Un champ de nombre où l'on pose le curseur (un clic, Tab) voit tout son contenu sélectionné : on tape la nouvelle
 * valeur directement, sans effacer l'ancienne. Un deuxième clic dans le champ déjà actif place le curseur, comme
 * d'habitude, pour corriger un chiffre. Pour tout l'éditeur : les champs de nombre (`inputmode="decimal"`,
 * `type="number"`) seulement, pas les champs de texte (un nom).
 */
const NUMBER = 'input[inputmode="decimal"], input[type="number"]';

export function bindSelectOnFocus(root: Document = document): void {
  /** The field just given the focus by a click: the mouse button let go next must not drop the selection. */
  let entered: HTMLInputElement | null = null;
  root.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.matches(NUMBER) || field.readOnly || field.disabled) return;
    field.select();
    entered = field;
  });
  root.addEventListener("mouseup", (event) => {
    if (entered && event.target === entered && entered.selectionStart !== entered.selectionEnd) event.preventDefault();
    entered = null;
  }, true);
  root.addEventListener("keydown", () => (entered = null), true);
}
