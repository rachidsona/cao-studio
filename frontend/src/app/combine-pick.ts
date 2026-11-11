/**
 * « Combiner des corps » choisi dans la vue : un clic sur un corps le fait cible (quand on choisit la cible) ou
 * l'ajoute aux corps outils, un autre clic l'en retire (quand on choisit les outils). Le corps que montre l'aperçu (le
 * résultat de la combinaison) tient lieu de la cible. Pur.
 */
export interface CombinePick {
  target: string | undefined;
  tools: string[];
  /** What the next click in the view chooses. */
  choosing: "target" | "tools";
}

/** The choice once the body `id` is clicked; `result`: the id of the combination shown by the preview. */
export function pickBody(state: CombinePick, id: string, result: string): CombinePick {
  const body = id === result ? state.target : id;
  if (!body) return state;
  if (state.choosing === "target") {
    if (body === state.target) return { ...state, choosing: "tools" };
    // The new target is no longer a tool; the next clicks choose the tools.
    return { target: body, tools: state.tools.filter((t) => t !== body), choosing: "tools" };
  }
  if (body === state.target) return state;
  return { ...state, tools: state.tools.includes(body) ? state.tools.filter((t) => t !== body) : [...state.tools, body] };
}
