/** La fiche d'aide des bons de commande (groupe « Fabrication »), à part pour garder workshop.ts court. */
import type { ToolHelp } from "./types";

export const ORDERS_HELP: ToolHelp = {
  keys: ["data-workshop:purchase-orders"],
  name: "Bons de commande",
  what: "Partage la liste d'achat du projet entre vos fournisseurs : un bon par fournisseur, avec les prix indicatifs du devis.",
  steps: [
    "Cliquez « Bons de commande » (ou « Bons de commande » dans la fenêtre de l'Optimisation de découpe).",
    "« Ajouter un fournisseur » : tapez son nom et ses coordonnées, et cochez ce qu'il vend — panneaux, tasseaux, chants, quincaillerie. Le premier vend tout d'abord.",
    "Sous « Bons », chaque article est rangé chez le premier fournisseur qui vend sa famille ; choisissez-en un autre dans sa ligne pour le lui confier.",
    "Cliquez « Imprimer les bons » (une page par fournisseur, sur papier ou en PDF) ou « Télécharger (.zip) » (la page, et un CSV par fournisseur).",
  ],
  tip: "Les panneaux sont comptés d'après le calepinage, les chutes du stock n'y sont pas. Les prix sont ceux des tarifs du devis (le panneau au m², le chant et le tasseau au mètre, la quincaillerie à la pièce ou à la boîte) : indicatifs, à confirmer par le fournisseur. Ce qu'aucun fournisseur ne vend forme un bon « à attribuer ». Les fournisseurs sont gardés par ce navigateur, comme les tarifs. Le Dossier de production contient aussi les bons.",
};
