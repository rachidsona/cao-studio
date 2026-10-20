/** File commands of the editor: manual save, export (STEP, STL, native) and import of a native project. */
import type { CadDocument } from "../document/types";
import type { GeometryClient } from "../geometry/client";
import type { ExportFormat } from "../io/exporters";
import { NATIVE_EXTENSION, parseNative, serializeNative } from "../io/native";
import { download, slugify } from "../ui/dom";
import type { DocumentSession } from "./session";

export interface FileCommandsHost {
  session: DocumentSession;
  geometry: GeometryClient;
  projectName: string;
  doc(): CadDocument;
  notify(message: string, kind?: "info" | "success" | "error"): void;
  /** A document was imported: the editor resets its selection, units field and regenerates. */
  imported(doc: CadDocument): Promise<void>;
}

export class FileCommands {
  constructor(private readonly host: FileCommandsHost) {}

  async save(): Promise<void> {
    if (!this.host.session.dirty) {
      this.host.notify("Aucune modification à enregistrer.");
      return;
    }
    await this.host.session.save("Enregistrement manuel").catch(() => undefined);
  }

  async exportGeometry(format: ExportFormat): Promise<void> {
    try {
      const names = Object.fromEntries(this.host.doc().features.map((f) => [f.id, f.name]));
      const blob = await this.host.geometry.export(format, names);
      download(blob, `${slugify(this.host.projectName)}.${format}`);
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  exportNative(): void {
    download(serializeNative(this.host.doc()), `${slugify(this.host.projectName)}${NATIVE_EXTENSION}`);
  }

  async importNative(file: File): Promise<void> {
    try {
      await this.host.imported(parseNative(await file.text()));
      this.host.notify(`« ${file.name} » importé.`, "success");
    } catch (error) {
      this.host.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }
}
