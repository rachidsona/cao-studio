/**
 * Commande numérique et étiquettes de l'Atelier : les pièces mises à plat sur leur grande face (contour exact du
 * noyau, perçages et leur profondeur lue sur le maillage) donnent le DXF et le programme G-code (réglages de la
 * machine retenus par le navigateur) ; la liste de débit donne une planche d'étiquettes à QR code, une par pièce,
 * à coller sur les panneaux à la sortie de la machine.
 */
import { cutList, edgeText, grainText } from "../document/cut-list";
import { bodyInfo, MATERIALS, materialById } from "../document/materials";
import { bodyLabel } from "../document/operations";
import { isHardwareBody } from "../document/hardware";
import type { GeometryClient } from "../geometry/client";
import { boardFaces, flattenOutline, holeDepth, partsDxf, type FlatPart } from "../io/dxf";
import { GCODE, partsGcode, type GcodeOptions } from "../io/gcode";
import { qrSvg } from "../io/qr";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { partsOf } from "./workshop";
import { downloadText, escapeHtml, openModal, printHtml } from "./workshop-ui";
import { formatLength, UNIT_LABELS } from "../measurements/units";

const GCODE_KEY = "cao.gcode";
const INPUT = "h-8 w-24 border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";

/**
 * Every displayed board of the furniture laid flat, with its material, on the face with the more holes (a door
 * shows its hinge cups); the bodies without a flat face apart, and the boards with blind holes on the other face.
 */
async function flatParts(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<{ parts: (FlatPart & { material: string })[]; skipped: string[]; flip: string[] }> {
  const parts: (FlatPart & { material: string })[] = [];
  const skipped: string[] = [];
  const flip: string[] = [];
  for (const id of viewport.displayedBodies) {
    const info = bodyInfo(editor.doc, id);
    if (info.room || isHardwareBody(editor.doc, id)) continue;
    const mesh = viewport.bodyMesh(id);
    const faces = mesh ? boardFaces(mesh) : [];
    const name = bodyLabel(editor.doc, id);
    if (!mesh || !faces.length) {
      skipped.push(name);
      continue;
    }
    const box = mesh.metrics.bbox;
    const thickness = Math.min(...[0, 1, 2].map((i) => box[1][i]! - box[0][i]!));
    try {
      const flats = await Promise.all(
        faces.map(async (face) => {
          const outline = await geometry.faceOutline(id, face);
          return flattenOutline(outline, name, thickness, (center, radius) => holeDepth(mesh.vertices, center, outline.normal, radius, thickness));
        }),
      );
      const holes = (p: FlatPart) => p.edges.filter((e) => e.kind === "circle").length;
      const [best, other] = flats.length === 2 && holes(flats[1]!) > holes(flats[0]!) ? [flats[1]!, flats[0]!] : [flats[0]!, flats[1]];
      if (other?.edges.some((e) => e.kind === "circle" && (e.depth ?? thickness) < thickness - 0.01)) flip.push(name);
      parts.push({ ...best, material: materialById(info.material)?.name ?? "Non défini" });
    } catch {
      skipped.push(name);
    }
  }
  return { parts, skipped, flip };
}

async function exportDxf(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const { parts, skipped } = await flatParts(viewport, editor, geometry);
  if (!parts.length) return editor.notify("Aucune pièce à plat à exporter.", "info");
  downloadText("pieces-cnc.dxf", partsDxf(parts), "application/dxf");
  editor.notify(`DXF exporté : ${parts.length} pièce${parts.length > 1 ? "s" : ""}${skipped.length ? ` (sans face plane : ${skipped.join(", ")})` : ""}.`, "success");
}

function loadOptions(): GcodeOptions {
  try {
    return { ...GCODE, ...(JSON.parse(localStorage.getItem(GCODE_KEY) ?? "null") as Partial<GcodeOptions> | null) };
  } catch {
    return { ...GCODE };
  }
}

async function showGcode(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const { parts, skipped, flip } = await flatParts(viewport, editor, geometry);
  if (!parts.length) return editor.notify("Aucune pièce à usiner.", "info");
  const o = loadOptions();
  const groups = () => {
    const by = new Map<string, { label: string; size: [number, number]; parts: FlatPart[] }>();
    for (const p of parts) {
      const key = `${p.material}|${Number(p.thickness.toFixed(1))}`;
      const group = by.get(key) ?? { label: `${p.material} ${Number(p.thickness.toFixed(1))} mm`, size: MATERIALS.find((m) => m.name === p.material)?.sheet ?? [2800, 2070], parts: [] };
      group.parts.push(p);
      by.set(key, group);
    }
    return [...by.values()];
  };
  const summary = el("p", { class: "text-xs text-gray-600 dark:text-gray-300" });
  const refresh = () => {
    const { sheets, skipped: left } = partsGcode(groups(), o);
    const out = [...skipped.map((n) => `${n} (sans face plane)`), ...left];
    summary.textContent = `${parts.length} pièce(s) sur ${sheets} panneau(x) brut(s).${out.length ? ` Non usinées : ${out.join(" ; ")}.` : ""}${flip.length ? ` Perçages borgnes sur l'autre face, à faire en retournant la pièce : ${flip.join(", ")}.` : ""}`;
  };
  const field = (label: string, key: keyof GcodeOptions, unit: string) => {
    const input = el("input", { type: "number", step: "any", min: "0", class: INPUT, value: String(o[key]), "aria-label": label });
    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) return;
      o[key] = v;
      try {
        localStorage.setItem(GCODE_KEY, JSON.stringify(o));
      } catch {
        // Settings are a convenience: without storage they last for this visit.
      }
      refresh();
    });
    return el("label", { class: "flex items-center justify-between gap-2" }, el("span", {}, label), el("span", { class: "flex items-center gap-1" }, input, el("span", { class: "w-12 text-gray-500" }, unit)));
  };
  refresh();
  const content = el(
    "div",
    { class: "space-y-3 text-xs" },
    el("div", { class: "grid gap-x-6 gap-y-1.5 sm:grid-cols-2" },
      field("Diamètre de la fraise", "tool", "mm"), field("Profondeur de passe", "pass", "mm"), field("Avance", "feed", "mm/min"), field("Plongée", "plunge", "mm/min"),
      field("Vitesse de broche", "spindle", "tr/min"), field("Hauteur de sécurité", "safeZ", "mm"), field("Dans le martyr", "overcut", "mm"), field("Percer au foret jusqu'à", "drillMax", "mm"),
      field("Écart entre pièces", "spacing", "mm"), field("Marge du panneau", "margin", "mm"),
    ),
    summary,
    el("p", { class: "text-[11px] text-gray-500" }, "Z0 sur le dessus du panneau, origine au coin du panneau. Perçages au foret de leur diamètre (T2, T3…), grands trous vidés et contours détourés à la fraise (T1), compensée dans le calcul. Vérifiez le programme dans un simulateur avant de lancer la machine."),
  );
  const close = openModal("G-code pour la commande numérique", content, [
    {
      label: "Télécharger le G-code",
      run: () => {
        downloadText("pieces.nc", partsGcode(groups(), o).code, "text/plain");
        close();
      },
    },
    { label: "Fermer", run: () => close() },
  ]);
}

function printLabels(viewport: Viewport, editor: Editor): void {
  const { rows } = cutList(editor.doc, partsOf(viewport, editor.doc));
  if (!rows.length) return editor.notify("Aucune pièce à étiqueter.", "info");
  const project = document.title.split("·")[0]?.trim() ?? "";
  const labels = rows.flatMap((r) =>
    r.names.map((name) => {
      const size = [r.length, r.width, r.thickness].map((mm) => formatLength(mm, editor.unit).replace(/ \S+$/, "")).join(" × ") + ` ${UNIT_LABELS[editor.unit]}`;
      const data = [project, name, `${r.length}x${r.width}x${r.thickness}`, r.material, `chants ${edgeText(r.edges)}`].join(" | ");
      return `<div class="label"><div class="qr">${qrSvg(data)}</div><div class="text"><b>${escapeHtml(name)}</b><span>${escapeHtml(size)}</span><span>${escapeHtml(r.material)}</span><span>Chants : ${escapeHtml(edgeText(r.edges))} · Fil : ${escapeHtml(grainText(r.grain))}</span><small>${escapeHtml(project)}</small></div></div>`;
    }),
  );
  printHtml(
    "Étiquettes",
    `<div class="labels">${labels.join("")}</div>`,
    `@page{size:A4;margin:0}body{margin:0}.labels{display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37mm}
     .label{box-sizing:border-box;display:flex;gap:2mm;padding:3mm;overflow:hidden;page-break-inside:avoid;border:0.2mm dashed #ccc}
     .qr{width:22mm;height:22mm;flex:none}.qr svg{width:100%;height:100%}.text{display:flex;flex-direction:column;gap:0.6mm;font-size:8pt;min-width:0}
     .text b{font-size:9pt}.text small{color:#666}`,
  );
  editor.notify(`${labels.length} étiquette(s) prête(s) à imprimer (A4, 3 × 8).`, "success");
}

export function bindCnc(root: HTMLElement, viewport: Viewport, editor: Editor, geometry: GeometryClient): void {
  root.querySelector('[data-workshop="dxf"]')?.addEventListener("click", () => void exportDxf(viewport, editor, geometry));
  root.querySelector('[data-workshop="gcode"]')?.addEventListener("click", () => void showGcode(viewport, editor, geometry));
  root.querySelector('[data-workshop="labels"]')?.addEventListener("click", () => printLabels(viewport, editor));
}
