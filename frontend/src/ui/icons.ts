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

/** A toolbar icon from the editor's sprite (templates/editor/_icons.html), e.g. "i-extrude". */
export function toolIcon(id: string, className = "tool-icon"): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
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

/** A chevron pointing right (rotated a quarter turn when its folder is open), like the editor's header (_hicon.html). */
export function chevronIcon(): SVGElement {
  return icon([{ tag: "path", attrs: { d: "m9 6 6 6-6 6" } }]);
}

/** The drawn chevron of a fold (MASTER.md § 8), 12 px, turned down by `rotate-90` when open; `extra`: its own classes. */
export function foldChevron(extra = ""): SVGElement {
  const svg = fine(chevronIcon(), 12);
  svg.setAttribute("class", `shrink-0 transition-transform ${extra}`);
  for (const node of svg.children) node.setAttribute("stroke-width", "2");
  return svg;
}

/** A bin, to delete. */
export function trashIcon(): SVGElement {
  return icon([
    { tag: "path", attrs: { d: "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" } },
  ]);
}

/** A folder of the navigator (`plus`: to make a new one). */
export function folderIcon(plus = false): SVGElement {
  const shapes: Parameters<typeof icon>[0] = [{ tag: "path", attrs: { d: "M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" } }];
  if (plus) shapes.push({ tag: "path", attrs: { d: "M12 11v6M9 14h6" } });
  return icon(shapes);
}

/** The same icon smaller and drawn with a fine line (the rows of the navigator). */
export function fine<T extends SVGElement>(svg: T, size = 14): T {
  svg.setAttribute("class", "mx-auto");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  for (const node of svg.children) if (node.getAttribute("stroke-width")) node.setAttribute("stroke-width", "1.25");
  return svg;
}
