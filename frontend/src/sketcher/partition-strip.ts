/**
 * La bande de face d'une Répartition dans le panneau de l'outil (partition-tool.ts), comme celle du linéaire de la
 * cuisine : le dessin de partition-face.ts, un clic sur une case la choisit (un autre clic sur elle la laisse), et les
 * bords de la case choisie, en laiton, se tirent pour changer sa largeur au centimètre — la case voisine prend la
 * différence, la longueur reste. Le panneau reçoit les nouvelles proportions ; OK les enregistre en une étape.
 */
import { BRASS, faceFont, faceViewBox, partitionFaceSvg, pulledWidths, type PartitionFace } from "./partition-face";

const SVG = "http://www.w3.org/2000/svg";

export interface StripHost {
  face: PartitionFace;
  chosen: number | null;
  /** A case clicked (null: the chosen one clicked again). */
  pick(index: number | null): void;
  /** An edge pulled and let go: the shares of the cases. */
  widths(shares: number[]): void;
  /** What the strip is the face of, for the screen readers. */
  label: string;
}

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

/** The strip, as wide as the panel. */
export function partitionStrip(host: StripHost): SVGSVGElement {
  const { face } = host;
  const node = document.createElementNS(SVG, "svg");
  node.setAttribute("viewBox", faceViewBox(face));
  node.setAttribute("class", "block w-full max-h-[30rem] select-none");
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", host.label);
  node.setAttribute("data-partition-strip", "");
  node.innerHTML = partitionFaceSvg(face, host.chosen);
  for (const piece of node.querySelectorAll<SVGRectElement>("[data-case]")) {
    piece.addEventListener("click", () => {
      const i = Number(piece.dataset.case);
      host.pick(i === host.chosen ? null : i);
    });
  }
  if (host.chosen !== null && face.cases[host.chosen]) {
    if (host.chosen < face.cases.length - 1) edge(node, host, host.chosen, "right");
    if (host.chosen > 0) edge(node, host, host.chosen, "left");
  }
  return node;
}

/** An edge of the chosen case: pulled, its width follows by the centimetre, shown as it goes; let go, it is set. */
function edge(node: SVGSVGElement, host: StripHost, i: number, side: "left" | "right"): void {
  const { face } = host;
  const c = face.cases[i]!;
  const [top, bottom] = face.inner;
  const fs = faceFont(face);
  const x0 = side === "right" ? c.x1 : c.x0;
  const handle = document.createElementNS(SVG, "g");
  handle.setAttribute("class", "cursor-ew-resize");
  handle.setAttribute("data-resize", side);
  const h = bottom - top;
  const grip = Math.min(h * 0.3, fs * 4);
  handle.innerHTML = `<title>Tirer pour changer la largeur de la case ${i + 1}</title><rect x="${-fs * 0.5}" y="0" width="${fs}" height="${h}" fill="transparent"/><rect x="${-fs * 0.25}" y="${h / 2 - grip / 2}" width="${fs * 0.5}" height="${grip}" rx="${fs * 0.15}" fill="${BRASS}" stroke="white" stroke-width="1" vector-effect="non-scaling-stroke"/><text y="${-fs * 0.3}" text-anchor="middle" font-size="${fs}" fill="${BRASS}" pointer-events="none"></text>`;
  const at = (x: number) => handle.setAttribute("transform", `translate(${x} ${top})`);
  at(x0);
  const label = handle.querySelector("text")!;
  handle.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    down.stopPropagation();
    const matrix = node.getScreenCTM()?.inverse();
    const x = (event: PointerEvent) => (matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix).x : event.clientX);
    const start = x(down);
    let shares: number[] | null = null;
    handle.setPointerCapture?.(down.pointerId);
    const motion = (event: PointerEvent) => {
      const dx = x(event) - start;
      shares = pulledWidths(face, i, side, side === "right" ? c.width + dx : c.width - dx);
      const width = shares?.[i] ?? c.width;
      at(side === "right" ? c.x0 + width : c.x1 - width);
      label.textContent = cm(width);
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
