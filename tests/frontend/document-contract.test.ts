/**
 * Un seul contrat de document des deux côtés (audit d'architecture du 11/11/2026) : les documents de
 * tests/fixtures/documents, acceptés par le serveur (tests/backend/test_document_contract.py), s'ouvrent dans l'éditeur
 * sans rien désactiver ; et la table des contraintes d'esquisse est le même fichier des deux côtés.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openDocument, validateDocument } from "../../frontend/src/document/validate";

const dir = "tests/fixtures/documents";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("contrat du document", () => {
  it("il y a des documents d'exemple", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s s'ouvre dans l'éditeur sans rien désactiver", (file) => {
    const doc: unknown = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
    expect(validateDocument(doc)).toEqual([]);
    expect(openDocument(doc).problems).toEqual([]);
  });
});
