/**
 * What the next boards are made of, kept for the session and shared by the tools that need it: the "Panneaux"
 * tool starts from it, and the sketch pattern that spreads dividers inside a rectangle uses the same thickness and
 * side of the outline to make the openings between the boards equal.
 */
export interface PanelDefaults {
  /** Board thickness (mm). */
  thickness: number;
  /** Depth of the boards (mm). */
  depth: number;
  /** Side of the skeleton's outline the boards lie on. */
  align: "inside" | "center" | "outside";
}

export const panelDefaults: PanelDefaults = { thickness: 18, depth: 400, align: "inside" };
