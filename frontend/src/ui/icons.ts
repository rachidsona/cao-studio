/** Small inline SVG icons drawn in the text colour. */
const SVG = "http://www.w3.org/2000/svg";

function icon(shapes: { tag: "path" | "circle"; attrs: Record<string, string> }[]): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "mx-auto size-[18px]");
  svg.setAttribute("aria-hidden", "true");
  for (const { tag, attrs } of shapes) {
    const node = document.createElementNS(SVG, tag);
    const all = { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs };
    for (const [name, value] of Object.entries(all)) node.setAttribute(name, value);
    svg.append(node);
  }
  return svg;
}

/** Open eye (visible) or crossed-out eye (hidden). */
export function eyeIcon(visible: boolean): SVGElement {
  const shapes: Parameters<typeof icon>[0] = [
    { tag: "path", attrs: { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" } },
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
  ];
  if (!visible) shapes.push({ tag: "path", attrs: { d: "M3 3l18 18" } });
  return icon(shapes);
}

/** Three dots, for a row menu. */
export function dotsIcon(): SVGElement {
  return icon([
    { tag: "circle", attrs: { cx: "5", cy: "12", r: "1.2", fill: "currentColor" } },
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "1.2", fill: "currentColor" } },
    { tag: "circle", attrs: { cx: "19", cy: "12", r: "1.2", fill: "currentColor" } },
  ]);
}
