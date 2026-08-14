// Path: codebuddy-provider/src/codebuddy/model-registry.ts
/**
 * Model Registry — the single test seam for dynamic model listing (see
 * `.scratch/codebuddy-vscode-provider/spec-dynamic-model-list.md`).
 *
 * Merges three sources into the final list exposed to VS Code:
 *   - remote Model Catalog (+ Availability filtering)
 *   - local models.json patches
 *   - hardcoded fallback (CODEBUDDY_MODELS)
 *
 * Merge is field-level, keyed by model id, with priority remote > local >
 * hardcoded per field (see ADR-0001). Fallback chain: remote success →
 * (remote+local+hardcoded); remote failure → (local+hardcoded); local also
 * fails → hardcoded.
 *
 * Caching: configurable TTL (default 30 min), single in-flight dedup, manual
 * `refresh(force)` bypasses TTL. An `onDidChange` event fires only when the
 * serialized content actually changed.
 *
 * Pure logic, zero `vscode` dependency. Dependencies (catalog fetch + local
 * read) are injected for the single-seam test.
 */

import { ModelCatalogEntry } from './model-catalog';
import { LocalModelPatch } from './local-models';
import { CODEBUDDY_MODELS, ModelInfo } from './models';

export type ModelProvenance = 'remote' | 'local' | 'hardcoded';

export interface ModelRegistryDeps {
  fetchCatalog: (opts: { accessToken: string; userId?: string }) => Promise<ModelCatalogEntry[]>;
  readLocal: () => { user: Map<string, LocalModelPatch>; project: Map<string, LocalModelPatch> };
  ttlMs?: number;
}

export interface ModelRegistryOptions {
  deps: ModelRegistryDeps;
  hardcoded?: readonly ModelInfo[];
  now?: () => number;
}

type ChangeListener = () => void;

/**
 * Converts a catalog entry to a ModelInfo with family/version derived from the
 * id, conservative defaults, and remote provenance.
 */
export function catalogEntryToModelInfo(entry: ModelCatalogEntry): ModelInfo {
  const { family, version } = splitFamilyVersion(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    family,
    version,
    maxInputTokens: entry.maxInputTokens,
    maxOutputTokens: entry.maxOutputTokens,
    toolCalling: true,
    detail: entry.description,
    supportsImages: entry.supportsImages,
    provenance: 'remote',
  };
}

/** Split a model id like `deepseek-v4-pro` into family/version. */
export function splitFamilyVersion(id: string): { family: string; version: string } {
  const idx = id.lastIndexOf('-');
  if (idx <= 0) {
    return { family: id, version: 'latest' };
  }
  return { family: id.slice(0, idx), version: id.slice(idx + 1) };
}

/**
 * Field-level merge of a higher-priority patch onto a base ModelInfo. Returns
 * a new object; undefined fields are ignored.
 */
export function applyPatch(base: ModelInfo, patch: LocalModelPatch): ModelInfo {
  return {
    ...base,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.supportsToolCall !== undefined ? { toolCalling: patch.supportsToolCall } : {}),
    ...(patch.supportsImages !== undefined ? { supportsImages: patch.supportsImages } : {}),
    ...(patch.maxInputTokens !== undefined ? { maxInputTokens: patch.maxInputTokens } : {}),
    ...(patch.maxOutputTokens !== undefined ? { maxOutputTokens: patch.maxOutputTokens } : {}),
  };
}

export class ModelRegistry {
  private readonly deps: ModelRegistryDeps;
  private readonly hardcoded: readonly ModelInfo[];
  private readonly now: () => number;
  private readonly ttlMs: number;

  private models: ModelInfo[] = [];
  private loadedAt = 0;
  private inFlight: Promise<ModelInfo[]> | null = null;
  private lastJson = '';
  private readonly listeners = new Set<ChangeListener>();

  constructor(options: ModelRegistryOptions) {
    this.deps = options.deps;
    this.hardcoded = options.hardcoded ?? CODEBUDDY_MODELS;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.deps.ttlMs ?? 30 * 60 * 1000;
  }

  /** The current merged list (may be stale up to TTL). */
  getAll(): ModelInfo[] {
    return this.models;
  }

  /** True when no data has been loaded yet. */
  isCold(): boolean {
    return this.models.length === 0;
  }

  /**
   * Ensure the registry has loaded data (refreshing if stale or never loaded).
   * With `force = true` bypasses the TTL.
   */
  async refresh(force = false): Promise<ModelInfo[]> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (!force && this.isFresh()) {
      return this.models;
    }
    this.inFlight = this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Force an immediate refresh, bypassing the TTL. */
  refreshNow(): Promise<ModelInfo[]> {
    return this.refresh(true);
  }

  /** Subscribe to content-change notifications. Returns unsubscribe fn. */
  onDidChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private isFresh(): boolean {
    return this.models.length > 0 && this.now() - this.loadedAt < this.ttlMs;
  }

  private async load(): Promise<ModelInfo[]> {
    let merged: ModelInfo[];

    let remoteEntries: ModelCatalogEntry[] | null = null;
    try {
      remoteEntries = await this.deps.fetchCatalog({ accessToken: '', userId: undefined });
    } catch {
      remoteEntries = null;
    }

    let local: { user: Map<string, LocalModelPatch>; project: Map<string, LocalModelPatch> } = {
      user: new Map(),
      project: new Map(),
    };
    try {
      local = this.deps.readLocal();
    } catch {
      local = { user: new Map(), project: new Map() };
    }

    if (remoteEntries) {
      merged = remoteEntries.map(catalogEntryToModelInfo);
      merged = this.applyLocal(merged, local);
      merged = this.ensureHardcodedPresent(merged);
    } else {
      merged = this.hardcoded.map((m) => ({ ...m }));
      merged = this.applyLocal(merged, local);
    }

    this.models = merged;
    this.loadedAt = this.now();

    const json = JSON.stringify(this.models);
    if (json !== this.lastJson) {
      this.lastJson = json;
      for (const listener of this.listeners) {
        listener();
      }
    }
    return this.models;
  }

  /** Apply local patches (project then user) field-by-field. */
  private applyLocal(
    models: ModelInfo[],
    local: { user: Map<string, LocalModelPatch>; project: Map<string, LocalModelPatch> },
  ): ModelInfo[] {
    const byId = new Map(models.map((m) => [m.id, m]));
    const mergePatch = (patch: LocalModelPatch) => {
      const existing = byId.get(patch.id);
      if (existing) {
        byId.set(patch.id, applyPatch(existing, patch));
      } else {
        byId.set(patch.id, this.patchToNewModel(patch));
      }
    };
    // User-level first, project-level second so project overrides user for
    // the same id (later merge wins for each field).
    for (const patch of local.user.values()) {
      mergePatch(patch);
    }
    for (const patch of local.project.values()) {
      mergePatch(patch);
    }
    return [...byId.values()];
  }

  /** Build a standalone ModelInfo from a local patch (id has no base entry). */
  private patchToNewModel(patch: LocalModelPatch): ModelInfo {
    const { family, version } = splitFamilyVersion(patch.id);
    return {
      id: patch.id,
      name: patch.name ?? patch.id,
      family,
      version,
      maxInputTokens: patch.maxInputTokens ?? 131_072,
      maxOutputTokens: patch.maxOutputTokens ?? 8192,
      toolCalling: patch.supportsToolCall ?? true,
      supportsImages: patch.supportsImages,
      provenance: 'local',
    };
  }

  /**
   * Ensure every hardcoded model that the remote list lacks is still present
   * (so a remote that omits a familiar model doesn't silently drop it).
   */
  private ensureHardcodedPresent(models: ModelInfo[]): ModelInfo[] {
    const byId = new Map(models.map((m) => [m.id, m]));
    for (const hc of this.hardcoded) {
      if (!byId.has(hc.id)) {
        byId.set(hc.id, { ...hc, provenance: 'hardcoded' });
      }
    }
    return [...byId.values()];
  }
}
