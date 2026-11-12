/**
 * Le devis en HTML (tableau des lignes, puis les totaux), pour l'Atelier et l'impression. Tout ce qui vient du
 * modèle ou du catalogue commun (désignation, unité) est échappé : un article de quincaillerie est écrit par
 * n'importe quel compte, et ce tableau est inséré dans la page de chacun.
 */
import { money, type Quote } from "../../document/quote";
import { escapeHtml } from "./workshop-ui";

export const quoteHtml = (quote: Quote) =>
  `<table><thead><tr><th>Désignation</th><th>Quantité</th><th>Prix unitaire HT</th><th>Total HT</th></tr></thead><tbody>${quote.lines
    .map((l) => `<tr><td>${escapeHtml(l.label)}</td><td>${l.quantity.toLocaleString("fr-FR")} ${escapeHtml(l.unit === "pièce" && l.quantity > 1 ? "pièces" : String(l.unit))}</td><td>${money(l.unitPrice)}</td><td>${money(l.total)}</td></tr>`)
    .join("")}</tbody></table><table><tbody>${[
    ["Coût", quote.cost],
    ["Marge", quote.margin],
    ...(quote.discount ? [[`Remise ${quote.discountRate} %`, -quote.discount]] : []),
    ["Total HT", quote.net],
    ["TVA", quote.vat],
    ["Total TTC", quote.gross],
  ]
    .map(([label, value]) => `<tr><th>${label}</th><td>${money(value as number)}</td></tr>`)
    .join("")}</tbody></table>`;
