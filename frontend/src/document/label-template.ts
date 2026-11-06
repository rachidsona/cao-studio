/**
 * Le modèle d'étiquette de l'atelier : ce qu'elle dit et dans quel ordre, la place du QR code, le logo, le format de la
 * planche. Gardé dans ce navigateur, repris par l'impression et par le dossier de production. Pur, sauf sa lecture.
 */
export type LabelField = "name" | "tag" | "size" | "material" | "edges" | "grain" | "project";

export const LABEL_FIELDS: [LabelField, string][] = [["name", "Nom de la pièce"], ["tag", "Repère"], ["size", "Cotes"], ["material", "Matière"], ["edges", "Chants"], ["grain", "Sens du fil"], ["project", "Projet"]];

export const LABEL_FORMATS = {
  "3x8": { label: "A4, 3 × 8 (70 × 37 mm)", columns: 3, width: 70, height: 37 },
  "3x7": { label: "A4, 3 × 7 (70 × 42 mm)", columns: 3, width: 70, height: 42 },
  "2x4": { label: "A4, 2 × 4 (105 × 74 mm)", columns: 2, width: 105, height: 74 },
} as const;

export interface LabelTemplate {
  /** What it says, from the top. */
  fields: LabelField[];
  qr: "left" | "right" | "none";
  /** A picture, as a data URL. */
  logo?: string;
  format: keyof typeof LABEL_FORMATS;
}

export interface LabelData extends Record<LabelField, string> {
  /** The QR code, as an SVG. */
  qr: string;
}

export const DEFAULT_LABEL: LabelTemplate = { fields: ["name", "size", "material", "edges", "grain", "project"], qr: "left", format: "3x8" };

const KEY = "cao.label-template";

export function loadLabelTemplate(): LabelTemplate {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<LabelTemplate> | null;
    return kept ? { ...DEFAULT_LABEL, ...kept, fields: (kept.fields ?? DEFAULT_LABEL.fields).filter((f) => LABEL_FIELDS.some(([key]) => key === f)) } : DEFAULT_LABEL;
  } catch {
    return DEFAULT_LABEL;
  }
}

export function saveLabelTemplate(template: LabelTemplate): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(template));
  } catch {
    // Not kept: this print only (a logo can be too large for the browser's storage).
  }
}

/** A field moved one place up (-1) or down (1). */
export function movedField(fields: readonly LabelField[], field: LabelField, by: -1 | 1): LabelField[] {
  const out = [...fields];
  const at = out.indexOf(field);
  const to = at + by;
  if (at < 0 || to < 0 || to >= out.length) return out;
  [out[at], out[to]] = [out[to] as LabelField, field];
  return out;
}

/** One label. `escape`: the text as HTML. */
export function labelHtml(template: LabelTemplate, data: LabelData, escape: (text: string) => string): string {
  const lines = template.fields.filter((f) => data[f]).map((f, i) => (i === 0 ? `<b>${escape(data[f])}</b>` : f === "project" ? `<small>${escape(data[f])}</small>` : `<span>${escape(data[f])}</span>`));
  const qr = template.qr === "none" ? "" : `<div class="qr">${data.qr}</div>`;
  const logo = template.logo ? `<img class="logo" src="${escape(template.logo)}" alt="">` : "";
  const text = `<div class="text">${logo}${lines.join("")}</div>`;
  return `<div class="label">${template.qr === "right" ? text + qr : qr + text}</div>`;
}

export function labelCss({ format }: LabelTemplate): string {
  const { columns, width, height } = LABEL_FORMATS[format];
  const qr = Math.min(22, height - 12);
  return `@page{size:A4;margin:0}body{margin:0}.labels{display:grid;grid-template-columns:repeat(${columns},${width}mm);grid-auto-rows:${height}mm}
     .label{box-sizing:border-box;display:flex;gap:2mm;padding:3mm;overflow:hidden;page-break-inside:avoid;border:0.2mm dashed #ccc;width:${width}mm;height:${height}mm;background:#fff;color:#111}
     .qr{width:${qr}mm;height:${qr}mm;flex:none}.qr svg{width:100%;height:100%}.text{display:flex;flex-direction:column;gap:0.6mm;font-size:8pt;min-width:0}
     .text b{font-size:9pt}.text small{color:#666}.logo{max-height:7mm;max-width:24mm;object-fit:contain;align-self:flex-start}`;
}
