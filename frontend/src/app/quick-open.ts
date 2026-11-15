/**
 * Quick opening of a project: the model last computed from this very document, kept in the browser
 * (persistence/model-cache.ts), is shown at once while the 3D kernel starts and recomputes; the exact model then takes
 * its place. What needs the exact shapes (measures, outlines, exports) waits for it (geometry/client.ts).
 */
import { kernelDocument } from "../geometry/client";
import { browserStore, ModelCache, modelKey, type CachedModel } from "../persistence/model-cache";
import type { CadDocument } from "../document/types";
import type { RecomputeResponse } from "../geometry/protocol";

/** What quick opening needs of the editor. */
export interface QuickOpenHost {
  readonly doc: CadDocument;
  show(result: RecomputeResponse, doc: CadDocument | null): void;
  onShown: (result: RecomputeResponse, doc: CadDocument | null) => void;
}

/** How long after the last model shown it is kept (not at each step of a quick series of changes). */
const WRITE_DELAY_MS = 1500;

export class QuickOpen {
  private readonly kept: Promise<CachedModel | null>;

  /** Starts reading what is kept for the project, while its document loads. */
  constructor(private readonly projectId: string, private readonly cache = new ModelCache(browserStore())) {
    this.kept = cache.read(projectId);
  }

  /** Shows the kept model if it was computed from the host's document; true when shown. */
  async show(host: QuickOpenHost): Promise<boolean> {
    const model = this.cache.matching(this.projectId, await this.kept, modelKey(kernelDocument(host.doc)));
    if (!model) return false;
    host.show({ statuses: model.statuses, bodies: model.bodies, durationMs: 0 }, host.doc);
    return true;
  }

  /** From now on, keeps each real model shown, a moment after the last one, and at once when the page is left. */
  follow(host: QuickOpenHost): void {
    let pending: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The first model of the opening is kept at once (one may leave soon); the next ones a moment after the last.
    let delay = 0;
    const flush = () => {
      clearTimeout(timer);
      pending?.();
      pending = null;
    };
    const shown = host.onShown;
    host.onShown = (result, doc) => {
      shown(result, doc);
      if (!doc) return;
      clearTimeout(timer);
      pending = () => void this.cache.write(this.projectId, modelKey(kernelDocument(doc)), result).then((written) => written && performance.mark("cao:model-kept"));
      timer = setTimeout(flush, delay);
      delay = WRITE_DELAY_MS;
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }
}
