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
import { LAYER_PROFILES, boardFaces, flattenOutline, holeDepth, layerName, partsDxf, type FlatPart, type LayerProfile } from "../io/dxf";
import { edgeHoles } from "../document/face-ops";
import { GCODE, partsGcode, type GcodeOptions } from "../io/gcode";
import { qrSvg } from "../io/qr";
import { el } from "../ui/dom";
import type { Viewport } from "../viewport/viewport";
import type { Editor } from "./editor";
import { partsOf } from "./workshop";
import { pieceUrl } from "./workshop-progress";
import { downloadText, escapeHtml, openModal, printHtml, type PrintPage } from "./workshop-ui";
import { formatLength, UNIT_LABELS } from "../measurements/units";

const GCODE_KEY = "cao.gcode";
const INPUT = "h-8 w-24 border border-gray-300 bg-white px-2 text-right text-xs dark:border-gray-600 dark:bg-gray-900";

/**
 * Every displayed board of the furniture laid flat, with its material, on the face with the more holes (a door
 * shows its hinge cups); the bodies without a flat face apart, and the boards with blind holes on the other face.
 */
export async function flatParts(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<{ parts: (FlatPart & { material: string })[]; skipped: string[]; flip: string[]; edges: string[] }> {
  const parts: (FlatPart & { material: string })[] = [];
  const skipped: string[] = [];
  const flip: string[] = [];
  /** Boards with holes in their edges: horizontal drilling, not in the flat file. */
  const edges: string[] = [];
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
    if (edgeHoles(editor.doc, id, [[...box[0]], [...box[1]]]).length) edges.push(name);
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
  return { parts, skipped, flip, edges };
}

const LAYERS_KEY = "cao.dxf-layers";

/** The layer naming of the machine, kept by the browser (as the G-code settings). */
function loadLayers(): LayerProfile {
  try {
    return { ...LAYER_PROFILES[0]!.profile, ...(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? "null") as Partial<LayerProfile> | null) };
  } catch {
    return { ...LAYER_PROFILES[0]!.profile };
  }
}

/** The DXF of these parts, with the layer names of the machine as last set. */
export const savedDxf = (parts: FlatPart[]) => partsDxf(parts, 20, loadLayers());

async function exportDxf(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const { parts, skipped, edges } = await flatParts(viewport, editor, geometry);
  if (!parts.length) return editor.notify("Aucune pièce à plat à exporter.", "info");
  const profile = loadLayers();
  const preset = el("select", { class: "h-8 w-full border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900", "aria-label": "Noms des calques" },
    ...LAYER_PROFILES.map((p) => el("option", { value: p.id, selected: p.profile.contour === profile.contour && p.profile.drill === profile.drill }, p.label)),
    el("option", { value: "custom", selected: !LAYER_PROFILES.some((p) => p.profile.contour === profile.contour && p.profile.drill === profile.drill) }, "Personnalisé"));
  const text = (label: string, key: keyof LayerProfile) => {
    const input = el("input", { type: "text", class: "h-8 w-full border border-gray-300 bg-white px-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-900", value: profile[key], "aria-label": label });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("input", () => {
      profile[key] = input.value.trim() || LAYER_PROFILES[0]!.profile[key];
      preset.value = "custom";
      example();
    });
    return input;
  };
  const contour = text("Calque des contours", "contour");
  const drill = text("Calque des perçages", "drill");
  const sample = el("p", { class: "text-xs text-gray-600 dark:text-gray-300" });
  const example = () => (sample.textContent = `Exemple : contour d'un panneau de 19 mm → ${layerName(profile.contour, { t: 19 })} ; perçage Ø8 de 12 mm → ${layerName(profile.drill, { d: 8, z: 12, t: 19 })}.`);
  preset.addEventListener("change", () => {
    const chosen = LAYER_PROFILES.find((p) => p.id === preset.value);
    if (!chosen) return;
    Object.assign(profile, chosen.profile);
    contour.value = profile.contour;
    drill.value = profile.drill;
    example();
  });
  example();
  const content = el("div", { class: "space-y-2 text-xs" },
    el("p", { class: "text-gray-600 dark:text-gray-300" }, "Beaucoup de logiciels de commande numérique usinent d'après le nom du calque : réglez-le comme votre machine l'attend. {d} : diamètre, {z} : profondeur, {t} : épaisseur du panneau (en mm)."),
    preset, el("label", { class: "grid gap-0.5" }, "Contours", contour), el("label", { class: "grid gap-0.5" }, "Perçages", drill), sample,
    edges.length ? el("p", { class: "text-amber-700 dark:text-amber-400" }, `Perçages sur chant à faire à part (perceuse horizontale), cotés sur les fiches : ${edges.join(", ")}.`) : null);
  const close = openModal("DXF pour la commande numérique", content, [
    {
      label: "Exporter",
      run: () => {
        try {
          localStorage.setItem(LAYERS_KEY, JSON.stringify(profile));
        } catch {
          // Not remembered: only this time.
        }
        downloadText("pieces-cnc.dxf", partsDxf(parts, 20, profile), "application/dxf");
        editor.notify(`DXF exporté : ${parts.length} pièce${parts.length > 1 ? "s" : ""}${skipped.length ? ` (sans face plane : ${skipped.join(", ")})` : ""}.`, "success");
        close();
      },
    },
    { label: "Annuler", run: () => close() },
  ]);
}

function loadOptions(): GcodeOptions {
  try {
    return { ...GCODE, ...(JSON.parse(localStorage.getItem(GCODE_KEY) ?? "null") as Partial<GcodeOptions> | null) };
  } catch {
    return { ...GCODE };
  }
}

/** The parts by material and thickness, each on the sheets it is cut from. */
function gcodeGroups(parts: (FlatPart & { material: string })[]) {
  const by = new Map<string, { label: string; size: [number, number]; parts: FlatPart[] }>();
  for (const p of parts) {
    const key = `${p.material}|${Number(p.thickness.toFixed(1))}`;
    const group = by.get(key) ?? { label: `${p.material} ${Number(p.thickness.toFixed(1))} mm`, size: MATERIALS.find((m) => m.name === p.material)?.sheet ?? [2800, 2070], parts: [] };
    group.parts.push(p);
    by.set(key, group);
  }
  return [...by.values()];
}

/** The G-code of these parts, with the settings of the machine as last set. */
export const savedGcode = (parts: (FlatPart & { material: string })[]) => partsGcode(gcodeGroups(parts), loadOptions()).code;

async function showGcode(viewport: Viewport, editor: Editor, geometry: GeometryClient): Promise<void> {
  const { parts, skipped, flip, edges } = await flatParts(viewport, editor, geometry);
  if (!parts.length) return editor.notify("Aucune pièce à usiner.", "info");
  const o = loadOptions();
  const groups = () => gcodeGroups(parts);
  const summary = el("p", { class: "text-xs text-gray-600 dark:text-gray-300" });
  const refresh = () => {
    const { sheets, skipped: left } = partsGcode(groups(), o);
    const out = [...skipped.map((n) => `${n} (sans face plane)`), ...left];
    summary.textContent = `${parts.length} pièce(s) sur ${sheets} panneau(x) brut(s).${out.length ? ` Non usinées : ${out.join(" ; ")}.` : ""}${flip.length ? ` Perçages borgnes sur l'autre face, à faire en retournant la pièce : ${flip.join(", ")}.` : ""}${edges.length ? ` Perçages sur chant, à faire à part (cotés sur les fiches) : ${edges.join(", ")}.` : ""}`;
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

/** The sheet of labels, one per part, or null with no part. */
export function labelsPage(viewport: Viewport, editor: Editor): PrintPage | null {
  const { rows } = cutList(editor.doc, partsOf(viewport, editor.doc));
  if (!rows.length) return null;
  const project = document.title.split("·")[0]?.trim() ?? "";
  const labels = rows.flatMap((r) =>
    r.names.map((name) => {
      const size = [r.length, r.width, r.thickness].map((mm) => formatLength(mm, editor.unit).replace(/ \S+$/, "")).join(" × ") + ` ${UNIT_LABELS[editor.unit]}`;
      // The QR code opens the piece's page in the workshop tracking (its step, to move on with a tap).
      return `<div class="label"><div class="qr">${qrSvg(pieceUrl(name))}</div><div class="text"><b>${escapeHtml(name)}</b><span>${escapeHtml(size)}</span><span>${escapeHtml(r.material)}</span><span>Chants : ${escapeHtml(edgeText(r.edges))} · Fil : ${escapeHtml(grainText(r.grain))}</span><small>${escapeHtml(project)}</small></div></div>`;
    }),
  );
  return {
    title: "Étiquettes",
    html: `<div class="labels">${labels.join("")}</div>`,
    css: `@page{size:A4;margin:0}body{margin:0}.labels{display:grid;grid-template-columns:repeat(3,70mm);grid-auto-rows:37mm}
     .label{box-sizing:border-box;display:flex;gap:2mm;padding:3mm;overflow:hidden;page-break-inside:avoid;border:0.2mm dashed #ccc}
     .qr{width:22mm;height:22mm;flex:none}.qr svg{width:100%;height:100%}.text{display:flex;flex-direction:column;gap:0.6mm;font-size:8pt;min-width:0}
     .text b{font-size:9pt}.text small{color:#666}`,
  };
}

function printLabels(viewport: Viewport, editor: Editor): void {
  const page = labelsPage(viewport, editor);
  if (!page) return editor.notify("Aucune pièce à étiqueter.", "info");
  printHtml(page.title, page.html, page.css);
  editor.notify(`${page.html.split('class="label"').length - 1} étiquette(s) prête(s) à imprimer (A4, 3 × 8).`, "success");
}

export function bindCnc(root: HTMLElement, viewport: Viewport, editor: Editor, geometry: GeometryClient): void {
  root.querySelector('[data-workshop="dxf"]')?.addEventListener("click", () => void exportDxf(viewport, editor, geometry));
  root.querySelector('[data-workshop="gcode"]')?.addEventListener("click", () => void showGcode(viewport, editor, geometry));
  root.querySelector('[data-workshop="labels"]')?.addEventListener("click", () => printLabels(viewport, editor));
}
