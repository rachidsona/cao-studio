/**
 * « Plan de travail en barres » (groupe Cuisine) : chaque plan de travail coupé en longueurs du commerce, ses joints
 * posés sur le côté d'un meuble et loin des découpes, l'angle en joint droit ou en onglet (document/worktop-bars.ts).
 * La fenêtre règle la longueur des barres vendues et l'angle, montre chaque plan vu de dessus (ses découpes, ses
 * joints, ses morceaux cotés) et ce qu'il faut acheter ; le devis compte ces barres et les ferrures de jonction.
 * Le réglage est gardé avec le compte.
 */
import { BAR_LENGTHS, barName, setWorktopSettings, WORKTOP_DEFAULTS, worktopBars, worktopSettings, type WorktopPlan, type WorktopSettings } from "../../document/worktop-bars";
import { formatLength } from "../../measurements/units";
import { el } from "../../ui/dom";
import type { Editor } from "../editor";
import { openModal } from "../workshop/workshop-ui";

const KEY = "cao.worktop-bars";
const SELECT = "h-8 border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-900";

function load(): WorktopSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<WorktopSettings> | null;
    return { bar: BAR_LENGTHS.includes(saved?.bar ?? 0) ? saved!.bar! : WORKTOP_DEFAULTS.bar, corner: saved?.corner === "mitre" ? "mitre" : "butt" };
  } catch {
    return { ...WORKTOP_DEFAULTS };
  }
}

/** A worktop seen from above, as a strip: its pieces, its joints in red, its cut-outs, its ends against another. */
function strip(t: WorktopPlan, length: (mm: number) => string): SVGSVGElement {
  const W = 600;
  const s = W / Math.max(t.length, 1);
  const h = Math.max(24, Math.min(60, t.depth * s));
  const parts: string[] = [`<rect x="0" y="10" width="${W}" height="${h}" fill="#f5f5f4" stroke="#78716c" stroke-width="1"/>`];
  for (const [a, b] of t.cutouts) parts.push(`<rect x="${a * s}" y="${10 + h * 0.2}" width="${(b - a) * s}" height="${h * 0.6}" fill="#e7e5e4" stroke="#a8a29e" stroke-dasharray="3 2"/>`);
  for (const j of t.joints) parts.push(`<line x1="${j * s}" y1="4" x2="${j * s}" y2="${16 + h}" stroke="#dc2626" stroke-width="2"/>`);
  for (const c of t.corners) {
    const x = c.end === "start" ? 0 : W;
    parts.push(c.joint === "mitre" ? `<line x1="${x}" y1="10" x2="${c.end === "start" ? h : W - h}" y2="${10 + h}" stroke="#dc2626" stroke-width="2"/>` : `<line x1="${x}" y1="6" x2="${x}" y2="${14 + h}" stroke="#dc2626" stroke-width="3"/>`);
  }
  for (const p of t.pieces) parts.push(`<text x="${((p.from + p.to) / 2) * s}" y="${10 + h + 14}" font-size="11" text-anchor="middle" fill="currentColor">${length(p.to - p.from)}</text>`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `-4 0 ${W + 8} ${h + 30}`);
  svg.setAttribute("class", "w-full max-w-[640px] text-gray-700 dark:text-gray-200");
  svg.innerHTML = parts.join("");
  return svg;
}

export function openWorktopBars(editor: Editor): void {
  const body = el("div", { class: "space-y-3 text-sm", "data-worktop-bars": "" });
  const length = (mm: number) => formatLength(mm, editor.unit);
  const draw = () => {
    const s = worktopSettings();
    const { tops, bars, fittings, problems } = worktopBars(editor.doc, s);
    const bar = el("select", { class: SELECT, "aria-label": "Longueur des barres" }, ...BAR_LENGTHS.map((l) => el("option", { value: String(l), selected: l === s.bar }, length(l))));
    const corner = el("select", { class: SELECT, "aria-label": "Angle des plans" }, el("option", { value: "butt", selected: s.corner === "butt" }, "Joint droit (l'un passe)"), el("option", { value: "mitre", selected: s.corner === "mitre" }, "Coupe d'onglet (à 45°)"));
    const set = (change: Partial<WorktopSettings>) => {
      const next = { ...worktopSettings(), ...change };
      setWorktopSettings(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // For this window only.
      }
      draw();
    };
    bar.addEventListener("change", () => set({ bar: Number(bar.value) }));
    corner.addEventListener("change", () => set({ corner: corner.value as WorktopSettings["corner"] }));
    const children: (HTMLElement | null)[] = [
      el("div", { class: "flex flex-wrap items-center gap-3" }, el("label", { class: "flex items-center gap-2" }, "Barres vendues de", bar), el("label", { class: "flex items-center gap-2" }, "À l'angle", corner)),
      ...problems.map((p) => el("p", { class: "bg-amber-50 px-2 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-100", role: "alert" }, p)),
      tops.length ? null : el("p", { class: "text-gray-500" }, "Aucun plan de travail : posez la cuisine d'abord (Plan de cuisine ou Implantation)."),
      ...tops.map((t) =>
        el(
          "section",
          { class: "space-y-1 border border-gray-200 p-2 dark:border-gray-700", "data-worktop": t.name },
          el("h3", { class: "font-medium" }, `${t.name} — ${length(t.length)} × ${length(t.depth)}, ${t.material} ${Math.round(t.thickness)} mm`),
          strip(t, length),
          el("p", { class: "text-xs text-gray-600 dark:text-gray-300" }, [
            t.joints.length ? `Joint${t.joints.length > 1 ? "s" : ""} à ${t.joints.map(length).join(", ")} du début` : "D'un seul morceau",
            ...t.corners.map((c) => `contre ${c.with} : ${c.joint === "mitre" ? "coupe d'onglet" : "joint droit"}`),
          ].join(" ; ") + "."),
        ),
      ),
      bars.length
        ? el("div", { class: "border-t border-gray-200 pt-2 dark:border-gray-700", "data-worktop-buy": "" }, el("p", { class: "font-medium" }, "À acheter"), el("ul", { class: "list-disc pl-5" }, ...bars.map((b) => el("li", {}, `${b.count} × ${barName(b)}`)), fittings ? el("li", {}, `${fittings} ferrures de jonction`) : null))
        : null,
      el("p", { class: "text-xs text-gray-500" }, "Les joints sont posés sur le côté d'un meuble (pour être portés) et à 10 cm au moins d'une découpe. Le devis compte ces barres, au prix du m² de leur matière, et les ferrures de jonction."),
    ];
    body.replaceChildren(...children.filter((c): c is HTMLElement => c !== null));
  };
  draw();
  const close = openModal("Plan de travail en barres", body, [{ label: "Fermer", run: () => close() }]);
}

export function bindWorktopBars(root: HTMLElement, editor: Editor): void {
  setWorktopSettings(load());
  for (const b of root.querySelectorAll('[data-workshop="worktop-bars"]')) b.addEventListener("click", () => openWorktopBars(editor));
}
