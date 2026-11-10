/**
 * Un texte dans une cellule CSV, sûr à ouvrir dans un tableur : entre guillemets, et précédé d'une apostrophe s'il
 * commence comme une formule (= + - @, tabulation, retour chariot). Les noms de pièces viennent de fichiers reçus,
 * ceux des matières et de la quincaillerie du catalogue commun ; la liste d'achat part chez les fournisseurs
 * (injection de formules, audit de sécurité du 10/11/2026, M5). Les nombres ne passent pas par ici. Pur.
 */
export function csvText(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
