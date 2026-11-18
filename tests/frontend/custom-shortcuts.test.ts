/** Les raccourcis clavier de chacun : la combinaison d'une touche, donnée à un outil, une seule par outil et par touche. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assign, comboOf, readShortcuts, shortcutOf } from "../../frontend/src/app/custom-shortcuts";

const key = (k: string, code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ key: k, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe("raccourcis clavier personnels", () => {
  beforeEach(() => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) });
  });

  it("lit la combinaison : la lettre à sa place sur le clavier, avec ses touches de modification ; rien pour une modification seule", () => {
    expect(comboOf(key("m", "KeyM"))).toBe("M");
    expect(comboOf(key("µ", "KeyM", { altKey: true }))).toBe("⌥+M");
    expect(comboOf(key("D", "KeyD", { ctrlKey: true, shiftKey: true }))).toMatch(/^(Ctrl|⌘)\+Maj\+D$/);
    expect(comboOf(key("3", "Digit3"))).toBe("3");
    expect(comboOf(key("F2", "F2"))).toBe("F2");
    expect(comboOf(key("Shift", "ShiftLeft", { shiftKey: true }))).toBeNull();
  });

  it("une touche par outil, un outil par touche ; celles de l'éditeur restent les siennes ; Retour l'enlève", () => {
    const pull = { key: "data-tool:pull", label: "Tirer une face" };
    const hole = { key: "data-tool:hole", label: "Perçage" };
    expect(assign(pull, "M")).toBeNull();
    expect(readShortcuts()).toEqual({ M: { command: "data-tool:pull", label: "Tirer une face" } });
    // Another key for the same tool: the first one goes.
    assign(pull, "⌥+M");
    expect(Object.keys(readShortcuts())).toEqual(["⌥+M"]);
    // The same key for another tool: taken from the first.
    assign(hole, "⌥+M");
    expect(shortcutOf(readShortcuts(), pull.key)).toBeNull();
    expect(shortcutOf(readShortcuts(), hole.key)).toBe("⌥+M");
    expect(assign(pull, "Échap")).toMatch(/raccourci de l'éditeur/);
    assign(hole, null);
    expect(readShortcuts()).toEqual({});
  });
});
