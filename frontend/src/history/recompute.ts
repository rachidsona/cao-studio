/**
 * Incremental regeneration of the parametric history.
 *
 * Features are evaluated in history order. Each feature gets a cache key made
 * of its own geometric parameters and the keys of its inputs, so a change
 * only re-runs the feature that changed and everything downstream of it;
 * untouched results are reused. Failures are isolated: a failing feature is
 * reported, its dependents are marked "blocked", and the last valid bodies
 * stay visible.
 */
import { canonicalJson } from "../document/canonical";
import { isRemovedBody } from "../document/operations";
import { consumedBodies, featureInputs, featureOfBody, PART_SEPARATOR, type CadDocument, type Feature } from "../document/types";
import { buildFeature } from "../features/builders";
import { disposeOutput, type FeatureOutput } from "../features/outputs";
import { GeometryError } from "../geometry/kernel";

export type FeatureState = "ok" | "error" | "blocked" | "suppressed";

export interface FeatureStatus {
  id: string;
  state: FeatureState;
  message?: string;
  /** Informative note shown in the tree (e.g. degrees of freedom of a sketch). */
  detail?: string;
  /** Sketch solving summary, for sketch features. */
  sketch?: { dof: number; redundant: string[]; closed: boolean };
  /** True when the cached result was reused without running the kernel. */
  reused: boolean;
  durationMs: number;
}

export interface RecomputeResult {
  statuses: FeatureStatus[];
  /** Ids of the features whose solid output is a final, visible body. */
  bodies: string[];
}

interface CacheEntry {
  key: string;
  output: FeatureOutput;
}

/** Cache key of an input; a piece of a multi-body feature depends on that feature. */
function inputKey(keys: Map<string, string>, id: string): string {
  const own = keys.get(id);
  if (own !== undefined) return own;
  const base = featureOfBody(id);
  return `${keys.get(base) ?? ""}${PART_SEPARATOR}${id.slice(base.length + 1)}`;
}

/** Cache key ignores presentation-only fields (name, hidden). */
function featureKey(feature: Feature, inputKeys: string[]): string {
  // The offsets of a sketch only describe how some of its curves were made (timeline), not its geometry.
  const { name: _name, hidden: _hidden, offsets: _offsets, ...geometric } = feature as Feature & { offsets?: unknown };
  return `${canonicalJson(geometric)}|${inputKeys.join("|")}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof GeometryError) return error.message;
  const detail = error instanceof Error ? error.message : String(error);
  return `Échec du noyau géométrique : ${detail}`;
}

/** Sketch summary attached to a status: degrees of freedom, redundancy, closed profile. */
function describe(output: FeatureOutput): Pick<FeatureStatus, "detail" | "sketch"> {
  if (output.kind !== "profile") return {};
  const parts = [output.dof === 0 ? "Entièrement contrainte" : `${output.dof} cote(s) ou contrainte(s) manquante(s)`];
  if (output.redundant.length) parts.push(`contraintes redondantes : ${output.redundant.join(", ")}`);
  if (output.openReason) parts.push(output.openReason);
  return {
    detail: parts.join(" — "),
    sketch: { dof: output.dof, redundant: output.redundant, closed: output.drawing !== null },
  };
}

export class Recomputer {
  private cache = new Map<string, CacheEntry>();
  /** Outputs of the last pass (aliases for suppressed features are not owned). */
  private outputs = new Map<string, FeatureOutput>();

  /** Output of a feature, or one body of a multi-body feature ("split1#2"). */
  output(id: string): FeatureOutput | undefined {
    const direct = this.outputs.get(id);
    if (direct) return direct;
    const base = featureOfBody(id);
    if (base === id) return undefined;
    const parent = this.outputs.get(base);
    const shape = parent?.kind === "solids" ? parent.shapes[Number(id.slice(base.length + 1))] : undefined;
    return shape ? { kind: "solid", shape } : undefined;
  }

  recompute(doc: CadDocument): RecomputeResult {
    const statuses: FeatureStatus[] = [];
    const keys = new Map<string, string>();
    const states = new Map<string, FeatureState>();
    const consumedBy = new Map<string, string>();
    this.outputs = new Map();
    const seen = new Set<string>();

    this.features = new Map(doc.features.map((f) => [f.id, f]));
    for (const feature of doc.features) {
      const started = performance.now();
      const status = this.evaluate(feature, keys, states, seen);
      status.durationMs = performance.now() - started;
      statuses.push(status);
      states.set(feature.id, status.state);
      seen.add(feature.id);
      if (this.outputs.has(feature.id)) {
        for (const body of consumedBodies(feature)) consumedBy.set(body, feature.id);
      }
    }

    this.evictStale(doc);
    const bodies = doc.features
      .filter((f) => states.get(f.id) === "ok" || states.get(f.id) === "suppressed")
      .flatMap((f) => {
        const out = this.outputs.get(f.id);
        if (out?.kind === "solid") return [f.id];
        if (out?.kind === "solids") return out.shapes.map((_, i) => `${f.id}${PART_SEPARATOR}${i}`);
        return [];
      })
      .filter((id) => !consumedBy.has(id) && !isRemovedBody(doc, id));
    return { statuses, bodies };
  }

  /** The features of the document being regenerated (a feature built from another's settings reads them here). */
  private features = new Map<string, Feature>();

  private evaluate(
    feature: Feature,
    keys: Map<string, string>,
    states: Map<string, FeatureState>,
    seen: Set<string>,
  ): FeatureStatus {
    const base = { id: feature.id, reused: false, durationMs: 0 };
    const inputs = featureInputs(feature);
    for (const input of inputs) {
      if (!seen.has(featureOfBody(input))) {
        this.drop(feature.id);
        return { ...base, state: "error", message: `Référence introuvable ou postérieure : « ${input} ».` };
      }
      if (!this.output(input)) {
        this.drop(feature.id);
        return { ...base, state: "blocked", message: `Dépend de « ${input} », qui n'a pas de résultat valide.` };
      }
    }

    if (feature.suppressed) {
      // A suppressed feature passes its consumed body through unchanged.
      const passthrough = consumedBodies(feature)[0];
      const alias = passthrough ? this.output(passthrough) : undefined;
      if (alias && passthrough) {
        this.outputs.set(feature.id, alias);
        keys.set(feature.id, inputKey(keys, passthrough));
      }
      this.drop(feature.id);
      return { ...base, state: "suppressed" };
    }

    const key = featureKey(feature, inputs.map((id) => inputKey(keys, id)));
    keys.set(feature.id, key);
    const cached = this.cache.get(feature.id);
    if (cached && cached.key === key) {
      this.outputs.set(feature.id, cached.output);
      return { ...base, ...describe(cached.output), state: "ok", reused: true };
    }

    this.drop(feature.id);
    try {
      const output = buildFeature(feature, (id) => this.output(id), (id) => this.features.get(id));
      this.cache.set(feature.id, { key, output });
      this.outputs.set(feature.id, output);
      return { ...base, ...describe(output), state: "ok" };
    } catch (error) {
      return { ...base, state: "error", message: errorMessage(error) };
    }
  }

  private drop(id: string): void {
    const entry = this.cache.get(id);
    if (!entry) return;
    disposeOutput(entry.output);
    this.cache.delete(id);
  }

  private evictStale(doc: CadDocument): void {
    const alive = new Set(doc.features.map((f) => f.id));
    for (const id of [...this.cache.keys()]) if (!alive.has(id)) this.drop(id);
  }

  dispose(): void {
    for (const id of [...this.cache.keys()]) this.drop(id);
    this.outputs.clear();
  }
}
