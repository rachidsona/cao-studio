/** Errors of the editor reported to the server: what is sent, and how often. */
import { describe, expect, it } from "vitest";
import { describeError, ReportFilter } from "../../frontend/src/persistence/error-report";

describe("rapports d'erreur", () => {
  it("décrit une erreur avec son nom, son message et sa pile", () => {
    const report = describeError(new TypeError("x n'est pas défini"), "editor.js:12");
    expect(report).toMatchObject({ message: "TypeError: x n'est pas défini", source: "editor.js:12" });
    expect(report.stack).toContain("TypeError");
    expect(describeError("texte")).toEqual({ message: "texte", source: "" });
    expect(describeError({ code: 3 }).message).toBe('{"code":3}');
  });

  it("envoie chaque erreur une fois, et pas plus de quelques-unes par page", () => {
    const filter = new ReportFilter(2);
    expect(filter.accept({ message: "a" })).toBe(true);
    expect(filter.accept({ message: "a" })).toBe(false);
    expect(filter.accept({ message: "b" })).toBe(true);
    expect(filter.accept({ message: "c" })).toBe(false);
    expect(filter.accept({ message: "" })).toBe(false);
  });
});
