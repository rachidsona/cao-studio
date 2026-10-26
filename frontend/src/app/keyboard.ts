/** Global keyboard shortcuts of the editor (3D model mode; sketch mode handles its own keys). */

export interface ShortcutTarget {
  /** Active tool panel (extrusion, fillet…): receives Escape / Enter first. */
  activeTool(): { handleKey(event: KeyboardEvent): boolean } | null;
  /** Sketch mode shortcuts; returns true when handled. */
  sketchKey(event: KeyboardEvent): boolean;
  save(): void;
  undo(): void;
  redo(): void;
  escape(): void;
  deleteSelected(): void;
  fit(): void;
  hole(): void;
  extrude(): void;
}

export function bindShortcuts(target: ShortcutTarget): void {
  window.addEventListener("keydown", (event) => {
    const typing = event.target instanceof Element ? event.target.closest("input, textarea, select") : null;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const tool = target.activeTool();
    // Ctrl and Tab also go to the tool (Truelle: double line, side of the double line, reverse push/pull).
    if (tool && (event.key === "Escape" || (!typing && (event.key === "Enter" || event.key === "Tab" || (event.key === "Control" && !event.repeat))))) {
      if (tool.handleKey(event)) event.preventDefault();
    } else if (mod && key === "s") {
      event.preventDefault();
      target.save();
    } else if (typing) {
      return;
    } else if (target.sketchKey(event)) {
      event.preventDefault();
    } else if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) target.redo();
      else target.undo();
    } else if (mod && key === "y") {
      event.preventDefault();
      target.redo();
    } else if (event.key === "Escape") {
      target.escape();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      target.deleteSelected();
    } else if (key === "f") {
      target.fit();
    } else if (key === "h") {
      target.hole();
    } else if (key === "e") {
      target.extrude();
    }
  });
}
