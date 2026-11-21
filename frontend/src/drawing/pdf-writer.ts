/**
 * Un fichier PDF écrit directement, sans boîte d'impression : des pages à leur taille réelle (millimètres du papier),
 * les polices standard Helvetica et Helvetica-Bold (aucune police à embarquer), le texte en WinAnsi (accents
 * français, °, Ø, ±, ×, «, », €, …, —). Le fichier reste en ASCII : les octets au-delà sont écrits en octal. Pur.
 */

/** A page: its size in mm, and its drawing in PDF operators, in mm with y down from the top (see svg-pdf.ts). */
export interface PdfPage {
  width: number;
  height: number;
  content: string;
  /** Pictures drawn by `/Im1 Do`… in the content: a JPEG's bytes in hexadecimal, its size in pixels. */
  images?: { name: string; hex: string; width: number; height: number }[];
}

export const MM = 72 / 25.4;

/** Characters of WinAnsi beyond Latin-1. */
const WIN_ANSI: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, Š: 0x8a, "‹": 0x8b, Œ: 0x8c,
  Ž: 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, š: 0x9a, "›": 0x9b,
  œ: 0x9c, ž: 0x9e, Ÿ: 0x9f, "⌀": 0xd8, "−": 0x2d, " ": 0x20, " ": 0x20,
};

/** A text as a PDF literal string in WinAnsi: « (…) », the bytes beyond ASCII in octal. */
export function pdfString(text: string): string {
  let out = "(";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const byte = WIN_ANSI[ch] ?? (code < 0x100 ? code : 0x3f);
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return `${out})`;
}

/** Helvetica's advance widths (thousandths of the size), from the space to the tilde. */
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

/** How wide a text is in Helvetica at `size` (the bold a little wider); an accented letter is as wide as its letter. */
export function textWidth(text: string, size: number, bold = false): number {
  let total = 0;
  for (const ch of text) {
    const base = ch.normalize("NFD")[0]!;
    const code = base.charCodeAt(0);
    total += code >= 32 && code <= 126 ? WIDTHS[code - 32]! : ch === "…" ? 1000 : ch === "—" ? 1000 : 556;
  }
  return (total * size * (bold ? 1.06 : 1)) / 1000;
}

const n = (x: number) => (Math.abs(x) < 5e-5 ? "0" : Number(x.toFixed(4)).toString());
export { n as pdfNumber };

/** The PDF file of these pages, as text (ASCII only). */
export function writePdf(pages: PdfPage[], title = ""): string {
  const objects: string[] = [];
  /** Its object number (from 1). */
  const add = (body: string) => objects.push(body);
  const catalog = add("");
  const pagesId = add("");
  const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const info = add(`<< /Title ${pdfString(title)} /Producer (CAO Studio) >>`);
  const kids: number[] = [];
  for (const page of pages) {
    const [w, h] = [page.width * MM, page.height * MM];
    // From the paper's millimetres, y down from the top, to PDF points, y up.
    const stream = `q ${n(MM)} 0 0 ${n(-MM)} 0 ${n(h)} cm\n${page.content}\nQ`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    // A JPEG kept as it is (DCT), written in hexadecimal: the file stays ASCII.
    const images = (page.images ?? []).map((im) => `/${im.name} ${add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${im.hex.length + 1} >>\nstream\n${im.hex}>\nendstream`)} 0 R`);
    const xobjects = images.length ? ` /XObject << ${images.join(" ")} >>` : "";
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(w)} ${n(h)}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>${xobjects} >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
