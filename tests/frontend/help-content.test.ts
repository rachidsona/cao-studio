/** L'aide : chaque bouton de l'éditeur a sa fiche, et une fiche ne parle que de boutons qui existent. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_FAMILIES } from "../../frontend/src/app/help-content";
import { searchCommands } from "../../frontend/src/ui/command-search";

const PAGE = readFileSync("templates/editor/editor.html", "utf8");
const ATTRIBUTES = ["data-action", "data-sketch-tool", "data-sketch-command", "data-workshop", "data-new-sketch", "data-select-plus", "data-select-window", "data-section", "data-linked-copy", "data-library", "data-snap", "data-hidden-joints"];
/** Not tools: the help itself, and the buttons that only open and close a panel on a phone. */
const NOT_TOOLS = new Set(["data-action:help", "data-action:panel", "data-action:close-panels"]);

/** What keyOf says of each button of the page. */
function pageKeys(): Set<string> {
  const keys = [...PAGE.matchAll(/<button\b([^>]*)>/g)].flatMap((match) => {
    const attributes = match[1] ?? "";
    for (const name of ATTRIBUTES) {
      const found = new RegExp(`(?:^|\\s)${name}(?:="([^"]*)")?(?=\\s|$)`).exec(attributes);
      if (!found) continue;
      const view = /data-view="([^"]*)"/.exec(attributes)?.[1];
      return [`${name}:${found[1] ?? ""}${view ? `:${view}` : ""}`];
    }
    return [];
  });
  return new Set(keys.filter((key) => !NOT_TOOLS.has(key)));
}

const TOOLS = HELP_FAMILIES.flatMap((family) => family.tools);
const WRITTEN = TOOLS.flatMap((tool) => tool.keys);

describe("aide de l'éditeur", () => {
  it("a une fiche pour chaque bouton d'outil", () => {
    expect([...pageKeys()].filter((key) => !WRITTEN.includes(key))).toEqual([]);
  });

  it("ne parle pas de boutons qui n'existent plus", () => {
    const keys = pageKeys();
    expect(WRITTEN.filter((key) => !keys.has(key))).toEqual([]);
    const named = TOOLS.flatMap((tool) => (tool.selector ? [/data-[a-z-]+|aria-label='([^']+)'/.exec(tool.selector)?.[1] ?? /data-[a-z-]+/.exec(tool.selector)?.[0] ?? tool.selector] : []));
    expect(named.filter((name) => !PAGE.includes(name))).toEqual([]);
  });

  it("explique un outil une seule fois", () => {
    expect(WRITTEN.filter((key, i) => WRITTEN.indexOf(key) !== i)).toEqual([]);
  });

  it("dit à quoi sert chaque outil et comment s'en servir", () => {
    for (const tool of TOOLS) {
      expect(tool.name, JSON.stringify(tool.keys)).not.toBe("");
      expect(tool.what, tool.name).not.toBe("");
      expect(tool.steps.length, tool.name).toBeGreaterThan(0);
    }
    for (const family of HELP_FAMILIES) expect(family.where, family.title).not.toBe("");
  });

  it("ne cite aucun autre logiciel", () => {
    const text = TOOLS.map((tool) => [tool.what, ...tool.steps, tool.tip ?? ""].join(" ")).join(" ");
    expect(text).not.toMatch(/Fusion|SketchUp|Polyboard|Curic|JHS|OpenCutList|Shapr3D/);
  });

  it("trouve un outil par son nom ou par ce qu'il fait, sans les accents", () => {
    const commands = TOOLS.map((tool, i) => ({ key: String(i), label: tool.name, group: "", hint: [tool.what, ...tool.steps].join(" ") }));
    expect(searchCommands(commands, "etagere")[0]?.label).toMatch(/Étagère/);
    expect(searchCommands(commands, "tiroirs").length).toBeGreaterThan(0);
  });
});
