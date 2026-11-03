/**
 * The standard views of a sheet (front, top, side and isometric, at a scale that fits the paper), and the sheet of
 * one cabinet: « Mise en plan du caisson sélectionné » (menu of the project's name) makes a sheet named after it,
 * where every other body of the model is left out (`hiddenBodies`), with its standard views; opened again, the same
 * sheet is brought up to date (the bodies of the model changed) and keeps its dimensions and notes.
 */
import type { SheetLayout } from "../../drawing/layout";
import { FORMATS, FRAME_MARGIN, ORIENTATIONS, TITLE_SIZE, freshId, newSheet, placedSide, sheetIds, sideSpec, type DrawingSheet, type DrawingView, type Vec2 } from "../../drawing/model";
import { fitScale } from "./tools";

/** Room between the standard views (paper mm), for their dimensions. */
const GAP_VIEWS = 30;

/** What « Mise en plan du caisson sélectionné » draws: the cabinet's bodies, and the name of its sheet. */
export interface CabinetFocus {
  name: string;
  sheetName: string;
  bodies: string[];
}

export const cabinetSheetName = (name: string) => `Caisson — ${name}`;

/** The sheet with the four standard views of what it shows added (`bodies`: how many are displayed; none, unchanged). */
export function standardViews(sheet: DrawingSheet, layout: SheetLayout, bodies: number): DrawingSheet {
  if (!bodies) return sheet;
  const [w, h] = FORMATS[sheet.format];
  const probe = (spec: DrawingView["spec"]) => layout.geometry(sheet, { id: "probe", kind: "base", spec, scale: 1, at: [0, 0], label: "", hidden: true });
  const front = probe(ORIENTATIONS.front.spec);
  const top = probe(sideSpec(ORIENTATIONS.front.spec, "top"));
  const [W, H, D] = [front.max[0] - front.min[0], front.max[1] - front.min[1], top.max[1] - top.min[1]];
  const room: Vec2 = [(w - 2 * FRAME_MARGIN - 110) / 2, h - 2 * FRAME_MARGIN - TITLE_SIZE[1] - 70];
  const scale = fitScale([W + D, H + D], room);
  const [fw, fh, d] = [W / scale, H / scale, D / scale];
  const x = FRAME_MARGIN + 45 + fw / 2;
  const y = FRAME_MARGIN + 28 + fh / 2;
  const below = sheet.projection === "first" ? y + fh / 2 + GAP_VIEWS + d / 2 : y;
  const frontY = sheet.projection === "first" ? y : y + d + GAP_VIEWS;
  const ids = sheetIds(sheet);
  const id = () => {
    const next = freshId(ids, "view");
    ids.push(next);
    return next;
  };
  const base = id();
  const views: DrawingView[] = [
    { id: base, kind: "base", spec: ORIENTATIONS.front.spec, orientation: "front", scale, at: [x, frontY], label: "Vue de face", hidden: true },
    { id: id(), kind: "projected", spec: sideSpec(ORIENTATIONS.front.spec, placedSide("down", sheet.projection)), orientation: sheet.projection === "first" ? "top" : "bottom", scale, at: [x, sheet.projection === "first" ? below : y], parent: base, label: sheet.projection === "first" ? "Vue de dessus" : "Vue de dessous", hidden: true },
    { id: id(), kind: "projected", spec: sideSpec(ORIENTATIONS.front.spec, placedSide("right", sheet.projection)), orientation: sheet.projection === "first" ? "left" : "right", scale, at: [x + fw / 2 + GAP_VIEWS + d / 2, frontY], parent: base, label: sheet.projection === "first" ? "Vue de gauche" : "Vue de droite", hidden: true },
    { id: id(), kind: "projected", spec: ORIENTATIONS.iso.spec, orientation: "iso", scale, at: [w - FRAME_MARGIN - 20 - (fw + d) / 2, FRAME_MARGIN + 25 + (fh + d) / 2], parent: base, label: "Vue isométrique", hidden: false },
  ];
  return { ...sheet, views: [...sheet.views, ...views] };
}

/**
 * The sheets with the cabinet's own: added with its standard views when there is none, else brought up to date (the
 * other bodies of the model left out again). `title`: the project's, for the title block.
 */
export function cabinetSheet(sheets: readonly DrawingSheet[], focus: CabinetFocus, displayed: readonly string[], layout: SheetLayout, title: string): DrawingSheet[] {
  const keep = new Set(focus.bodies);
  const hiddenBodies = displayed.filter((id) => !keep.has(id));
  const known = sheets.find((s) => s.name === focus.sheetName);
  if (known) return sheets.map((s) => (s === known ? { ...s, hiddenBodies } : s));
  const blank = newSheet(sheets, title);
  const sheet: DrawingSheet = { ...blank, name: focus.sheetName, hiddenBodies, title: { ...blank.title, title: `${title} — ${focus.name}` } };
  return [...sheets, standardViews(sheet, layout, focus.bodies.length)];
}
