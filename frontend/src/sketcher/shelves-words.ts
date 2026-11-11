/** The values kept for the session and the words of the « Étagères » and « Cloisons » tools (shelves-tool.ts). */
import type { ShelfInput } from "./shelves";

/** Kept for the session: the last values (mm), of the shelves and of the cloisons. */
export const LAST: Record<"shelves" | "cloisons", ShelfInput> = {
  shelves: { count: 1, thickness: 18, mode: "equal", fixed: 300 },
  cloisons: { count: 1, thickness: 18, mode: "equal", fixed: 300, vertical: true },
};

/** The words of each tool. */
export const WORDS = {
  shelves: { title: "Étagères", one: "étagère", many: "étagères", these: "ces étagères", way: "du bas vers le haut", size: "hauteurs", first: "Celle du bas fixe", second: "Celle du haut fixe", fixed: "Hauteur fixe", between: "Entre le dessous et une étagère, entre deux étagères ou entre une étagère et le dessus : une niche, que vous pouvez diviser à son tour." },
  cloisons: { title: "Cloisons", one: "cloison", many: "cloisons", these: "ces cloisons", way: "de gauche à droite", size: "largeurs", first: "Celle de gauche fixe", second: "Celle de droite fixe", fixed: "Largeur fixe", between: "Entre un côté et une cloison, ou entre deux cloisons : une niche, que vous pouvez diviser à son tour (par des étagères ou d'autres cloisons)." },
};
