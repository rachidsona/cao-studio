/**
 * Le catalogue de l'atelier (apps/catalog) mêlé à ce que l'éditeur sait déjà : ses matières
 * s'ajoutent aux matières intégrées (même liste partout : Matière et chants, Remplacer partout, calepinage) avec leur
 * prix au m² dans les tarifs du devis ; ses règles de quincaillerie comptent, d'après le meuble, les articles à
 * ajouter au devis (par caisson, par porte, charnières selon la hauteur des portes, par étagère, par niche, par
 * côté) ; son profil fait l'en-tête des documents imprimés. Pur, hors `registerCatalog` qui garnit les listes.
 */
import { frontsHardware } from "../features/fronts-parts";
import { nicheHardware } from "../features/niche-parts";
import type { CatalogMaterial, CompanyProfile, HardwareRule, ServerCatalog } from "../persistence/catalog";
import { MATERIALS, type Material } from "./materials";
import { DEFAULT_RATES } from "./quote";
import type { CadDocument } from "./types";

/** A material of the server as the editor's: wood shows a grain; a thin « Fond » is a backing panel. */
export function toMaterial(m: CatalogMaterial): Material {
  const backing = m.thickness <= 8 && /^fond\b/i.test(m.name);
  return { id: m.id, name: m.name, color: m.color, look: m.category === "wood" ? "wood" : "plain", sheet: [m.sheet[0], m.sheet[1]], kind: backing ? "backing" : "panel" };
}

const rules: HardwareRule[] = [];

/** The hardware rules registered (the server's), for the quote. */
export const hardwareRules = (): readonly HardwareRule[] => rules;

/** Adds the server's materials (new ones only, by id and by name), their prices and the hardware prices to the editor's lists. */
export function registerCatalog(catalog: ServerCatalog): void {
  for (const m of catalog.materials) {
    if (MATERIALS.some((k) => k.id === m.id || k.name === m.name)) continue;
    MATERIALS.push(toMaterial(m));
    if (m.price > 0) DEFAULT_RATES.boards[m.name] = m.price;
  }
  rules.splice(0, rules.length, ...catalog.hardware);
  for (const r of catalog.hardware) if (r.price > 0 && DEFAULT_RATES.hardware[r.name] === undefined) DEFAULT_RATES.hardware[r.name] = r.price;
}

const GENERIC_HINGE = "Charnière à boîtier Ø35";

/** What the furniture has, counted once: cabinets, doors, hinges the doors need, shelves, niches, sides and partitions. */
export function furnitureCounts(doc: CadDocument): Record<Exclude<HardwareRule["mode"], "">, number> {
  const counts = { cabinet: 0, door: 0, door_hinge: 0, shelf: 0, niche: 0, side: 0 };
  const named = (pattern: RegExp) => doc.features.filter((f) => !f.suppressed && pattern.test(f.name.trim())).length;
  for (const f of doc.features) {
    if (f.suppressed) continue;
    if (f.type === "cabinet") {
      counts.cabinet += 1;
      counts.shelf += f.shelves;
      counts.niche += f.shelves + 1;
      counts.side += 2;
    } else if (f.type === "fronts") {
      counts.door += f.layout === "door" ? 1 : f.layout === "doors" ? 2 : 0;
      const cabinet = doc.features.find((c) => c.id === f.cabinet);
      counts.door_hinge += frontsHardware(f, cabinet?.type === "cabinet" ? cabinet : undefined).find((h) => h.name === GENERIC_HINGE)?.quantity ?? 0;
    } else if (f.type === "niche" && (f.fill === "doors" || f.fill === "door")) {
      const hinges = nicheHardware(doc.features, f).find((h) => h.name === GENERIC_HINGE)?.quantity ?? 0;
      counts.door_hinge += hinges;
      counts.door += hinges ? Math.max(1, Math.round(hinges / 2)) : 0;
    }
  }
  counts.shelf += named(/^Étagère( \d+)?$/);
  counts.side += named(/^Côté( \d+)?$/) + named(/^Cloison( \d+)?$/);
  // Each shelf or partition of a Répartition makes one more niche.
  counts.niche += named(/^Étagère( \d+)?$/) + named(/^Cloison( \d+)?$/);
  return counts;
}

/** The hardware the rules add to the quote, counted from the furniture (manual rules give their price only). */
export function autoHardware(doc: CadDocument, catalog: readonly HardwareRule[] = rules): { name: string; quantity: number; unit?: string; price?: number }[] {
  const counts = furnitureCounts(doc);
  const out: { name: string; quantity: number; unit?: string; price?: number }[] = [];
  for (const r of catalog) {
    if (!r.mode) continue;
    const quantity = Math.round(counts[r.mode] * r.perUnit * 100) / 100;
    if (quantity > 0) out.push({ name: r.name, quantity, unit: r.unit, price: r.price });
  }
  return out;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** The workshop's letterhead for a printed document (empty when the profile says nothing but a default name). */
export function companyHeaderHtml(p: CompanyProfile | null): string {
  if (!p) return "";
  const lines = [p.address, p.phone, p.email, p.website].filter(Boolean).map(escape);
  if (!p.logo && !p.slogan && !lines.length && (!p.name || p.name === "Mon atelier")) return "";
  const logo = p.logo && /^data:image\/(png|jpeg);base64,/.test(p.logo) ? `<img src="${p.logo}" alt="" style="max-height:18mm;max-width:50mm">` : "";
  return `<header class="letterhead" style="display:flex;align-items:center;gap:6mm;border-bottom:1px solid #999;padding-bottom:3mm;margin-bottom:5mm">${logo}<div><div style="font-size:14px;font-weight:600">${escape(p.name)}</div>${p.slogan ? `<div style="font-style:italic">${escape(p.slogan)}</div>` : ""}${lines.length ? `<div style="color:#444">${lines.join(" · ")}</div>` : ""}</div></header>`;
}
