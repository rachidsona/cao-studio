/**
 * Le dossier de production : ce qu'il contient, et sa page de garde. Un seul geste donne à l'atelier tous ses fichiers,
 * nommés pour se suivre dans l'ordre du travail et lisibles par n'importe quel ordinateur (sans accent). Pur.
 */
export type FolderItem = "cutlist" | "layout" | "sheets" | "labels" | "cnc" | "notice" | "quote";

/** What the folder can hold, in the order of the work; `off`: left out unless asked (not for the workshop). */
export const FOLDER_ITEMS: { key: FolderItem; label: string; off?: true }[] = [
  { key: "cutlist", label: "Liste de débit" },
  { key: "layout", label: "Calepinage et liste d'achat" },
  { key: "sheets", label: "Fiches de fabrication" },
  { key: "labels", label: "Étiquettes à QR code" },
  { key: "cnc", label: "Fichiers machine (DXF et G-code)" },
  { key: "notice", label: "Notice de montage" },
  { key: "quote", label: "Devis", off: true },
];

export interface FolderCheck {
  errors: string[];
  warnings: string[];
}

/** The cover of the folder: what is in it, and what the check of the project said when it was made. */
export function folderReadme(project: string, date: string, files: string[], check: FolderCheck, notes: string[]): string {
  const list = (title: string, lines: string[]) => (lines.length ? [title, ...lines.map((l) => `  - ${l}`), ""] : []);
  return [
    `Dossier de production : ${project}`,
    `Fait le ${date}, à partir du modèle tel qu'il était ce jour-là.`,
    "",
    ...list("Fichiers", files),
    ...(check.errors.length + check.warnings.length ? [] : ["Contrôle du projet : aucun problème trouvé.", ""]),
    ...list("ERREURS à corriger avant de fabriquer", check.errors),
    ...list("Points à vérifier", check.warnings),
    ...list("Remarques", notes),
    "Les pages .html s'ouvrent dans un navigateur et s'impriment, sur papier ou en PDF.",
  ].join("\n");
}
