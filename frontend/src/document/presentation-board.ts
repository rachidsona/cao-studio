/**
 * « Planche de présentation » pour le client : une seule page, en paysage, avec la vue 3D du projet en grand, sa vue de
 * face et de dessus, ses dimensions hors tout, ses matières (une pastille de leur couleur), ce qu'il range (mètres de
 * penderie et d'étagères, tiroirs, accessoires), les meubles qui le composent, un mot pour le client et, si on le
 * veut, son prix TTC. Ici les faits et la page, en calcul pur (les images viennent de la vue :
 * app/workshop/presentation-board-tool.ts).
 */
import { accessoryModel } from "../features/accessory-parts";
import { isPartition } from "../sketcher/partition-history";
import { bodyInfo, MATERIALS } from "./materials";
import type { CadDocument, Vec3 } from "./types";
import { wardrobeHave } from "./wardrobe-have";

export interface BoardFacts {
  /** Width × depth × height of what is drawn, rooms aside (mm); null when nothing is. */
  size: Vec3 | null;
  /** The materials of the pieces, the most used first: name, colour, how many pieces. */
  materials: { name: string; color: string; count: number }[];
  /** What it stores, in words: « 4,8 m de penderie », « 9 tiroirs », « Penderie escamotable »… */
  equipment: string[];
  /** The furniture it is made of: the Assistant meuble's, the Répartitions' sketches, the caissons. */
  furniture: string[];
}

export interface BoardPage {
  title: string;
  client: string;
  date: string;
  message: string;
  /** Data URLs of the perspective, front and top views (empty: left out). */
  images: { main: string; front: string; top: string };
  /** The price TTC, written; null: not shown. */
  price: string | null;
  facts: BoardFacts;
  /** A length, written in the project's unit. */
  length: (mm: number) => string;
}

const MAX_FURNITURE = 12;

/** The facts of the board, from the document and the boxes of the pieces shown (the room's left out by the caller). */
export function boardFacts(doc: CadDocument, bodies: readonly { id: string; box: [Vec3, Vec3] }[]): BoardFacts {
  const size = bodies.length
    ? ([0, 1, 2].map((k) => Math.max(...bodies.map((b) => b.box[1][k]!)) - Math.min(...bodies.map((b) => b.box[0][k]!))) as Vec3)
    : null;
  const byMaterial = new Map<string, { name: string; color: string; count: number }>();
  for (const b of bodies) {
    const id = bodyInfo(doc, b.id).material;
    if (!id) continue;
    const m = MATERIALS.find((x) => x.id === id);
    const entry = byMaterial.get(id) ?? { name: m?.name ?? id, color: m?.color ?? "#d1d5db", count: 0 };
    entry.count++;
    byMaterial.set(id, entry);
  }
  const have = wardrobeHave(doc);
  const metres = (mm: number) => `${(Math.round(mm / 100) / 10).toLocaleString("fr-FR")} m`;
  const equipment = [
    have.longRod + have.shortRod > 0 ? `${metres(have.longRod + have.shortRod)} de penderie` : "",
    have.shelves > 0 ? `${metres(have.shelves)} d'étagères` : "",
    have.drawers > 0 ? `${have.drawers} tiroir${have.drawers > 1 ? "s" : ""}` : "",
  ].filter(Boolean);
  const accessories = new Map<string, number>();
  for (const f of doc.features) {
    if (f.type !== "niche" || f.suppressed || f.fill !== "accessory") continue;
    const label = accessoryModel(f.accessory?.model)?.label ?? "Accessoire";
    accessories.set(label, (accessories.get(label) ?? 0) + 1);
  }
  for (const [label, n] of accessories) equipment.push(n > 1 ? `${label} × ${n}` : label);
  const furniture = [
    ...(doc.furniture ?? []).map((r) => r.name),
    ...doc.features.filter((f) => !f.suppressed && ((f.type === "sketch" && (f.offsets ?? []).some(isPartition)) || f.type === "cabinet")).map((f) => f.name),
  ];
  const listed = [...new Set(furniture)];
  return {
    size,
    materials: [...byMaterial.values()].sort((a, b) => b.count - a.count),
    equipment,
    furniture: listed.length > MAX_FURNITURE ? [...listed.slice(0, MAX_FURNITURE), `et ${listed.length - MAX_FURNITURE} autres`] : listed,
  };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The board's page (its body): the views on the left, the facts on the right. */
export function boardHtml(p: BoardPage): string {
  const f = p.facts;
  const image = (url: string, alt: string, cls: string) => (url ? `<img class="${cls}" src="${url}" alt="${escape(alt)}">` : "");
  const list = (title: string, items: string[]) => (items.length ? `<h2>${title}</h2><ul>${items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>` : "");
  const size = f.size ? `<h2>Dimensions hors tout</h2><p class="size">${escape(`${p.length(f.size[0])} × ${p.length(f.size[1])} × ${p.length(f.size[2])}`)}</p><p class="note">largeur × profondeur × hauteur</p>` : "";
  const materials = f.materials.length
    ? `<h2>Matières</h2><ul class="swatches">${f.materials.map((m) => `<li><span class="chip" style="background:${/^#[0-9a-f]{3,8}$/i.test(m.color) ? m.color : "#d1d5db"}"></span>${escape(m.name)}</li>`).join("")}</ul>`
    : "";
  const message = p.message.trim() ? `<p class="message">${escape(p.message.trim()).replace(/\n/g, "<br>")}</p>` : "";
  const price = p.price ? `<div class="price"><span>Prix TTC</span><b>${escape(p.price)}</b></div>` : "";
  return `<section class="board">
<header><h1>${escape(p.title)}</h1><p>${p.client.trim() ? `Pour ${escape(p.client.trim())} — ` : ""}${escape(p.date)}</p></header>
<div class="views">${image(p.images.main, "Vue en perspective", "main")}<div class="small">${image(p.images.front, "Vue de face", "")}${image(p.images.top, "Vue de dessus", "")}</div></div>
<aside>${message}${size}${materials}${list("Rangements", f.equipment)}${list("Composition", f.furniture)}${price}</aside>
</section>`;
}

/** Its page style, for a landscape sheet of `w` × `h` mm. */
export function boardCss(w: number, h: number): string {
  return `@page{size:${w}mm ${h}mm;margin:10mm} body{margin:0} .board{display:grid;grid-template-columns:1fr 70mm;grid-template-rows:auto 1fr;gap:4mm 8mm;height:${h - 20 - 30}mm}
.board header{grid-column:1/3;border-bottom:2px solid #0f172a;padding-bottom:2mm} .board h1{font-size:22px;margin:0} .board header p{margin:1mm 0 0;color:#475569}
.views{display:flex;flex-direction:column;gap:3mm;min-height:0} .views .main{flex:1;min-height:0;width:100%;object-fit:contain;border:1px solid #e2e8f0}
.views .small{display:flex;gap:3mm;height:32%} .views .small img{flex:1;min-width:0;object-fit:contain;border:1px solid #e2e8f0}
aside h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#0369a1;margin:4mm 0 1mm} aside ul{margin:0;padding-left:4mm} aside li{margin:.6mm 0}
.size{font-size:15px;font-weight:600;margin:0} .note{color:#64748b;margin:0;font-size:9px} .message{font-size:12px;font-style:italic;border-left:3px solid #0369a1;padding-left:3mm}
.swatches{list-style:none;padding:0!important} .chip{display:inline-block;width:10mm;height:5mm;border:1px solid #94a3b8;margin-right:2mm;vertical-align:middle}
.price{margin-top:6mm;padding:3mm;background:#0f172a;color:#fff;display:flex;justify-content:space-between;align-items:baseline} .price b{font-size:16px}`;
}
