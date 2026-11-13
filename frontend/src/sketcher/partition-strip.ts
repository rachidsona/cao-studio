/**
 * La bande de face d'une Répartition dans le panneau de l'outil (partition-tool.ts), comme celle du linéaire de la
 * cuisine : le dessin de partition-face-svg.ts, et ce qu'on y fait à la souris. Un clic choisit une étagère, une
 * cloison, un bloc de tiroirs ou une tringle ; un clic ailleurs (dans une niche, dans une case) ne choisit rien et
 * laisse ce qui l'était. Chaque côté entre deux cases porte une poignée en laiton : tirée, la case de gauche change de
 * largeur au centimètre, celle de droite prend la différence. Une étagère ou une cloison se tire le long de son axe :
 * au pas de 32 mm, ou sur celle d'une case voisine quand elle passe près (Alt : librement), ses deux niches affichées.
 * Des tiroirs ou une tringle se portent dans une autre niche ; une tringle se monte ou se descend. Un clic sur une cote
 * l'ouvre sur place : Entrée la règle, Échap la laisse. Le panneau reçoit chaque geste ; OK les enregistre en une étape.
 */
import { el } from "../ui/dom";
import { cm, faceFont, faceViewBox, pulledWidths, type FacePick, type PartitionFace } from "./partition-face";
import { snapPiece, snapRod, nicheUnder } from "./partition-face-edit";
import { BRASS, partitionFaceSvg } from "./partition-face-svg";

const SVG = "http://www.w3.org/2000/svg";
/** Less than this (screen pixels) is a click, not a pull. */
const SLOP = 3;

export interface StripHost {
  face: PartitionFace;
  picked: FacePick | null;
  /** What the strip is the face of, for the screen readers. */
  label: string;
  /** Something clicked (null: nothing, a click beside everything). */
  pick(pick: FacePick | null): void;
  /** An edge of a case pulled and let go: the shares of the cases. */
  widths(shares: number[]): void;
  /** The k-th piece let go with its middle here (face's frame, along its axis). */
  movePiece(k: number, at: number): void;
  /** Drawers or a rod let go: at this point of the face, its rod moved by `dy` (face's frame). */
  dropEquip(id: string, x: number, y: number, dy: number): void;
  /** The k-th dimension typed (as the person wrote it). */
  edit(k: number, text: string): void;
  /** A length as it is typed (the project's unit, no unit written). */
  format(mm: number): string;
  key(event: KeyboardEvent): void;
}

/** The strip, as wide as the panel, with room for a dimension typed on it. */
export function partitionStrip(host: StripHost): HTMLElement {
  const { face } = host;
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("viewBox", faceViewBox(face));
  node.setAttribute("class", "block w-full max-h-[42vh] select-none outline-none focus-visible:ring-2 focus-visible:ring-amber-500");
  node.setAttribute("role", "img");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", host.label);
  node.setAttribute("data-partition-strip", "");
  node.innerHTML = partitionFaceSvg(face, host.picked);
  const wrap = el("div", { class: "relative" }, node);
  node.addEventListener("keydown", (event) => host.key(event));
  // A click on nothing that can be chosen leaves what was chosen.
  for (const empty of node.querySelectorAll<SVGRectElement>("[data-case]")) empty.addEventListener("click", () => host.picked && host.pick(null));
  for (const target of node.querySelectorAll<SVGRectElement>("[data-piece]")) pull(node, target, host, Number(target.dataset.piece), null);
  for (const target of node.querySelectorAll<SVGRectElement>("[data-equip]")) pull(node, target, host, null, face.equips[Number(target.dataset.equip)]?.id ?? null);
  for (const text of node.querySelectorAll<SVGTextElement>("[data-edit]")) text.addEventListener("click", (event) => (event.stopPropagation(), typeIn(wrap, text, host, Number(text.dataset.edit))));
  // A grip on each side between two cases: pulled, the case on its left changes width, the one on its right follows.
  face.cases.slice(0, -1).forEach((_, i) => edge(node, host, i, "right"));
  return wrap;
}

/** The point of the face under the pointer. */
function facePoint(node: SVGSVGElement, event: PointerEvent): [number, number] {
  const matrix = node.getScreenCTM()?.inverse();
  if (!matrix) return [event.clientX, event.clientY];
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
  return [p.x, p.y];
}

/**
 * A piece (`k`) or an equipment (`id`) under the pointer: a click picks it, a pull moves a brass copy of it — snapped —
 * and the panel gets where it was let go.
 */
function pull(node: SVGSVGElement, target: SVGElement, host: StripHost, k: number | null, id: string | null): void {
  const { face } = host;
  const fs = faceFont(face);
  target.addEventListener("pointerdown", (down) => {
    if (down.button !== 0) return;
    down.preventDefault();
    down.stopPropagation();
    target.setPointerCapture?.(down.pointerId);
    const [x0, y0] = facePoint(node, down);
    let ghost: SVGGElement | null = null;
    let moved = false;
    let last: { at?: number; x: number; y: number; dy: number } = { x: x0, y: y0, dy: 0 };
    const piece = k === null ? null : face.pieces[k];
    const rod = id === null ? undefined : face.rods.find((r) => r.id === id);
    const motion = (event: PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < SLOP) return;
      moved = true;
      const [x, y] = facePoint(node, event);
      if (!ghost) {
        ghost = document.createElementNS(SVG, "g");
        ghost.setAttribute("pointer-events", "none");
        ghost.setAttribute("data-ghost", "");
        node.append(ghost);
      }
      if (piece && k !== null) {
        const at = snapPiece(face, k, piece.centre + (piece.vertical ? x - x0 : y - y0), event.altKey);
        const [a, b] = [at - piece.travel[0], piece.travel[1] - at];
        const r = piece.vertical ? { x: at - piece.w / 2, y: piece.y, w: piece.w, h: piece.h } : { x: piece.x, y: at - piece.h / 2, w: piece.w, h: piece.h };
        const text = piece.vertical ? `← ${cm(a)} · ${cm(b)} →` : `↑ ${cm(a)} · ↓ ${cm(b)}`;
        const [tx, ty] = piece.vertical ? [at, piece.y - fs * 0.3] : [piece.x + piece.w / 2, at - piece.h / 2 - fs * 0.3];
        ghost.innerHTML = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${BRASS}" fill-opacity="0.6" stroke="${BRASS}" stroke-width="2" vector-effect="non-scaling-stroke"/><text x="${tx}" y="${ty}" text-anchor="middle" font-size="${fs}" fill="${BRASS}" stroke="white" stroke-width="3" paint-order="stroke" vector-effect="non-scaling-stroke" font-weight="600">${text}</text>`;
        last = { at, x, y, dy: 0 };
      } else if (id !== null) {
        const dy = rod ? snapRod(face, id, rod.y + y - y0, event.altKey) - rod.y : y - y0;
        const dx = x - x0;
        const path = nicheUnder(face, x, y);
        const target = path && face.niches.find((n) => n.path.join(".") === path.join("."));
        const parts = rod
          ? `<line x1="${rod.x0 + dx}" y1="${rod.y + dy}" x2="${rod.x1 + dx}" y2="${rod.y + dy}" stroke="${BRASS}" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/><text x="${Math.min(rod.x0, rod.x1) + dx}" y="${rod.y + dy - fs * 0.4}" font-size="${fs}" fill="${BRASS}" stroke="white" stroke-width="3" paint-order="stroke" vector-effect="non-scaling-stroke" font-weight="600">tringle ${cm(face.height - rod.y - dy)}</text>`
          : face.fronts.filter((f) => f.of === id).map((f) => `<rect x="${f.x + dx}" y="${f.y + y - y0}" width="${f.w}" height="${f.h}" fill="${BRASS}" fill-opacity="0.35" stroke="${BRASS}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("");
        const aim = target ? `<rect x="${target.x}" y="${target.y}" width="${target.w}" height="${target.h}" fill="none" stroke="${BRASS}" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" data-aim=""/>` : "";
        ghost.innerHTML = aim + parts;
        last = { x, y, dy };
      }
    };
    const up = () => {
      target.removeEventListener("pointermove", motion);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      (ghost as SVGGElement | null)?.remove();
      if (!moved) return host.pick(k !== null ? { kind: "piece", index: k } : { kind: "equip", id: id! });
      if (k !== null && last.at !== undefined) host.movePiece(k, last.at);
      else if (id !== null) host.dropEquip(id, last.x, last.y, last.dy);
    };
    target.addEventListener("pointermove", motion);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  });
}

/** A dimension opened on the spot: a field over it, the value in the project's unit; Entrée sets it, Échap leaves it. */
function typeIn(wrap: HTMLElement, text: SVGTextElement, host: StripHost, k: number): void {
  const entry = host.face.edits[k];
  if (!entry) return;
  wrap.querySelector("[data-face-entry]")?.remove();
  const at = text.getBoundingClientRect();
  const room = wrap.getBoundingClientRect();
  const field = el("input", {
    type: "text",
    inputmode: "decimal",
    "data-face-entry": "",
    // Typed in place, gone when it loses the focus: no keypad beside it (ui/field-keypads.ts).
    "data-no-keypad": "",
    "aria-label": "Nouvelle cote",
    class: "absolute z-10 w-20 border border-amber-500 bg-white px-1 py-0.5 text-right text-xs text-gray-900 shadow dark:bg-gray-900 dark:text-gray-100",
    style: `left:${Math.max(0, Math.min(at.left - room.left + at.width / 2 - 40, room.width - 80))}px;top:${Math.max(0, at.top - room.top + at.height / 2 - 12)}px`,
  }) as HTMLInputElement;
  field.value = host.format(entry.value);
  let done = false;
  const close = (set: boolean) => {
    if (done) return;
    done = true;
    field.remove();
    if (set && field.value.trim() && field.value.trim() !== host.format(entry.value)) host.edit(k, field.value);
  };
  field.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") (event.preventDefault(), close(true));
    else if (event.key === "Escape") (event.preventDefault(), close(false));
  });
  field.addEventListener("blur", () => close(true));
  wrap.append(field);
  field.focus();
  field.select();
}

/** An edge of the chosen case: pulled, its width follows by the centimetre, shown as it goes; let go, it is set. */
function edge(node: SVGSVGElement, host: StripHost, i: number, side: "left" | "right"): void {
  const { face } = host;
  const c = face.cases[i]!;
  const [top, bottom] = face.inner;
  const fs = faceFont(face);
  const x0 = side === "right" ? c.x1 : c.x0;
  const handle = document.createElementNS(SVG, "g");
  handle.setAttribute("class", "cursor-ew-resize opacity-0 hover:opacity-100");
  handle.setAttribute("data-resize", side);
  handle.setAttribute("data-side", String(i));
  const h = bottom - top;
  const grip = Math.min(h * 0.3, fs * 4);
  handle.innerHTML = `<title>Tirer pour changer la largeur des cases ${i + 1} et ${i + 2}</title><rect x="${-fs * 0.5}" y="0" width="${fs}" height="${h}" fill="transparent"/><rect x="${-fs * 0.25}" y="${h / 2 - grip / 2}" width="${fs * 0.5}" height="${grip}" rx="${fs * 0.15}" fill="${BRASS}" stroke="white" stroke-width="1" vector-effect="non-scaling-stroke"/><text y="${-fs * 0.3}" text-anchor="middle" font-size="${fs}" fill="${BRASS}" pointer-events="none"></text>`;
  const at = (x: number) => handle.setAttribute("transform", `translate(${x} ${top})`);
  at(x0);
  const label = handle.querySelector("text")!;
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    const start = facePoint(node, down)[0];
    let shares: number[] | null = null;
    handle.setPointerCapture?.(down.pointerId);
    const motion = (event: PointerEvent) => {
      const dx = facePoint(node, event)[0] - start;
      shares = pulledWidths(face, i, side, side === "right" ? c.width + dx : c.width - dx);
      const width = shares?.[i] ?? c.width;
      at(side === "right" ? c.x0 + width : c.x1 - width);
      label.textContent = `${cm(width)} cm`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", motion);
      handle.removeEventListener("pointerup", up);
      if (shares) host.widths(shares);
    };
    handle.addEventListener("pointermove", motion);
    handle.addEventListener("pointerup", up);
  });
  node.append(handle);
}
