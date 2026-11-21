/**
 * « PDF » de la vue cadrée (la barre « Mur C isolé », « Linéaire isolé »…) : la vue telle qu'elle est, avec ses cotes,
 * sur une page A4 paysage, fond blanc, sans la grille, avec un cartouche — le projet, ce qui est montré, la date,
 * l'unité des cotes. Rien ne change dans le projet.
 */
import { writePdf, pdfString, type PdfPage } from "../drawing/pdf-writer";
import { UNIT_LABELS } from "../measurements/units";
import type { DisplayUnit } from "../document/types";
import { download, slugify } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";

/** The page (mm): A4 landscape, its margin, the title block's height. */
const PAGE = { width: 297, height: 210, margin: 10, head: 14 };

/** The view as drawn now — the model, its dimension lines and their values — on white, as a JPEG data URL. */
export function captureView(viewport: Viewport): { url: string; width: number; height: number } {
  const source = viewport.renderer.domElement;
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [source.width, source.height];
  const g = canvas.getContext("2d")!;
  const grid = viewport.gridVisible;
  viewport.gridVisible = false;
  try {
    viewport.renderer.render(viewport.scene, viewport.camera);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(source, 0, 0);
  } finally {
    viewport.gridVisible = grid;
    viewport.renderer.render(viewport.scene, viewport.camera);
    viewport.invalidate();
  }
  // The values are HTML over the view: drawn again where they are, as pills.
  const frame = source.getBoundingClientRect();
  const scale = source.width / Math.max(frame.width, 1);
  const parent = source.parentElement ?? document.body;
  for (const label of parent.querySelectorAll<HTMLElement>(".cad-plan-dim, .cad-piece-dim")) {
    const r = label.getBoundingClientRect();
    if (!r.width || !r.height || r.right < frame.left || r.left > frame.right || r.bottom < frame.top || r.top > frame.bottom) continue;
    const [x, y, w, h] = [(r.left - frame.left) * scale, (r.top - frame.top) * scale, r.width * scale, r.height * scale];
    const color = getComputedStyle(label).color || "#f8500a";
    g.fillStyle = "#ffffff";
    g.strokeStyle = color;
    g.lineWidth = Math.max(1, scale);
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.font = `600 ${Math.round(h * 0.62)}px ui-monospace, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label.textContent ?? "", x + w / 2, y + h / 2 + scale * 0.5);
  }
  return { url: canvas.toDataURL("image/jpeg", 0.92), width: canvas.width, height: canvas.height };
}

/** A JPEG data URL's bytes, in hexadecimal. */
const hexOf = (url: string) => Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");

/** The page of a picture `width` × `height` px with its title block: the picture fitted under it, centred. */
export function viewPage(picture: { hex: string; width: number; height: number }, title: string, lines: string[]): PdfPage {
  const { width, height, margin, head } = PAGE;
  const [aw, ah] = [width - 2 * margin, height - 2 * margin - head];
  const fit = Math.min(aw / picture.width, ah / picture.height);
  const [w, h] = [picture.width * fit, picture.height * fit];
  const [x, y] = [margin + (aw - w) / 2, margin + head + (ah - h) / 2];
  const text = (s: string, at: [number, number], size: number, bold = false) => `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 -1 ${at[0]} ${at[1]} Tm ${pdfString(s)} Tj ET`;
  const content = [
    `q ${w.toFixed(3)} 0 0 ${(-h).toFixed(3)} ${x.toFixed(3)} ${(y + h).toFixed(3)} cm /Im1 Do Q`,
    `q 0.2 w 0.4 0.4 0.4 RG ${margin} ${margin + head - 2} m ${width - margin} ${margin + head - 2} l S Q`,
    text(title, [margin, margin + 5], 5.5, true),
    ...lines.map((line, i) => text(line, [margin, margin + 9.5 + i * 3.6], 3.2)),
  ].join("\n");
  return { width, height, content, images: [{ name: "Im1", ...picture }] };
}

/** The framed view as a PDF file, downloaded: `shown` says what is in it (« Mur C isolé »). */
export function downloadViewPdf(viewport: Viewport, shown: string, unit: DisplayUnit): void {
  const project = document.title.split(" · ")[0] || "Projet";
  const shot = captureView(viewport);
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const page = viewPage({ hex: hexOf(shot.url), width: shot.width, height: shot.height }, `${project} — ${shown}`, [`${date} · cotes en ${UNIT_LABELS[unit]}`]);
  download(new Blob([writePdf([page], `${project} — ${shown}`)], { type: "application/pdf" }), `${slugify(`${project} ${shown}`)}.pdf`);
}
