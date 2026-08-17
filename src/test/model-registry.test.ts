// Path: codebuddy-provider/src/test/model-registry.test.ts
import { describe, expect, it } from 'vitest';
import { ModelCatalogEntry } from '../codebuddy/model-catalog';
import { LocalModelPatch } from '../codebuddy/local-models';
import { ModelInfo } from '../codebuddy/models';
import { ModelRegistry } from '../codebuddy/model-registry';

const HARDCODED: ModelInfo[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    family: 'deepseek-v4',
    version: 'pro',
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
    toolCalling: true,
  },
  {
    id: 'kimi-k2.7',
    name: 'Kimi K2.7',
    family: 'kimi',
    version: 'k2.7',
    maxInputTokens: 262_144,
    maxOutputTokens: 8192,
    toolCalling: true,
  },
];

const REMOTE: ModelCatalogEntry[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro (cloud)',
    supportsImages: false,
    supportsReasoning: false,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
  },
  {
    id: 'glm-5.2',
    name: 'GLM-5.2',
    supportsImages: true,
    supportsReasoning: false,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
  },
];

function makeRegistry(
  overrides: {
    remote?: ModelCatalogEntry[] | null;
    local?: { user: LocalModelPatch[]; project: LocalModelPatch[] };
    ttlMs?: number;
    failLocal?: boolean;
  } = {},
): { registry: ModelRegistry; setNow: (t: number) => void } {
  const remote = overrides.remote === undefined ? REMOTE : overrides.remote;
  const local = overrides.local ?? { user: [], project: [] };
  let now = 0;
  const registry = new ModelRegistry({
    deps: {
      fetchCatalog: async () => {
        if (remote === null) {
          throw new Error('network down');
        }
        return remote;
      },
      readLocal: () => {
        if (overrides.failLocal) {
          throw new Error('fs error');
        }
        return {
          user: new Map(local.user.map((p) => [p.id, p])),
          project: new Map(local.project.map((p) => [p.id, p])),
        };
      },
      ttlMs: overrides.ttlMs ?? 30 * 60 * 1000,
    },
    hardcoded: HARDCODED,
    now: () => now,
  });
  return {
    registry,
    setNow: (t: number) => {
      now = t;
    },
  };
}

describe('ModelRegistry', () => {
  it('merges remote with hardcoded fallback for missing ids', async () => {
    const { registry } = makeRegistry();
    await registry.refresh(true);
    const ids = registry.getAll().map((m) => m.id);
    expect(ids).toContain('deepseek-v4-pro');
    expect(ids).toContain('glm-5.2');
    expect(ids).toContain('kimi-k2.7'); // hardcoded kept
  });

  it('remote wins over hardcoded for the same id', async () => {
    const { registry } = makeRegistry();
    await registry.refresh(true);
    const pro = registry.getAll().find((m) => m.id === 'deepseek-v4-pro');
    expect(pro?.name).toBe('DeepSeek V4 Pro (cloud)');
    expect(pro?.provenance).toBe('remote');
  });

  it('applies local patch field-level on top of remote', async () => {
    const { registry } = makeRegistry({
      local: { project: [{ id: 'glm-5.2', maxInputTokens: 999, supportsToolCall: false }], user: [] },
    });
    await registry.refresh(true);
    const glm = registry.getAll().find((m) => m.id === 'glm-5.2');
    expect(glm?.maxInputTokens).toBe(999);
    expect(glm?.toolCalling).toBe(false);
    expect(glm?.name).toBe('GLM-5.2'); // remote name kept
  });

  it('project patch overrides user patch per field', async () => {
    const { registry } = makeRegistry({
      local: {
        project: [{ id: 'glm-5.2', maxInputTokens: 999 }],
        user: [{ id: 'glm-5.2', maxInputTokens: 111 }],
      },
    });
    await registry.refresh(true);
    const glm = registry.getAll().find((m) => m.id === 'glm-5.2');
    expect(glm?.maxInputTokens).toBe(999);
  });

  it('falls back to local+hardcoded when remote fails', async () => {
    const { registry } = makeRegistry({ remote: null });
    await registry.refresh(true);
    const ids = registry.getAll().map((m) => m.id);
    expect(ids).toContain('deepseek-v4-pro');
    expect(ids).toContain('kimi-k2.7');
    expect(registry.getAll().every((m) => m.provenance !== 'remote')).toBe(true);
  });

  it('falls back to hardcoded when remote and local both fail', async () => {
    const { registry } = makeRegistry({ remote: null, failLocal: true });
    await registry.refresh(true);
    expect(registry.getAll().length).toBe(HARDCODED.length);
  });

  it('serves cached list within TTL without refetching', async () => {
    let fetchCount = 0;
    const { registry, setNow } = makeRegistry({ ttlMs: 1000 });
    (registry as unknown as { deps: { fetchCatalog: () => Promise<ModelCatalogEntry[]> } }).deps.fetchCatalog =
      async () => {
        fetchCount += 1;
        return REMOTE;
      };
    await registry.refresh(true);
    setNow(500);
    await registry.refresh(false);
    expect(fetchCount).toBe(1);
  });

  it('refetches after TTL expires', async () => {
    let fetchCount = 0;
    const { registry, setNow } = makeRegistry({ ttlMs: 1000 });
    (registry as unknown as { deps: { fetchCatalog: () => Promise<ModelCatalogEntry[]> } }).deps.fetchCatalog =
      async () => {
        fetchCount += 1;
        return REMOTE;
      };
    await registry.refresh(true);
    setNow(2000);
    await registry.refresh(false);
    expect(fetchCount).toBe(2);
  });

  it('deduplicates concurrent refresh calls (single in-flight)', async () => {
    let fetchCount = 0;
    const { registry } = makeRegistry({ ttlMs: 1000 });
    (registry as unknown as { deps: { fetchCatalog: () => Promise<ModelCatalogEntry[]> } }).deps.fetchCatalog =
      async () => {
        fetchCount += 1;
        await new Promise((r) => setTimeout(r, 10));
        return REMOTE;
      };
    await Promise.all([registry.refresh(true), registry.refresh(true), registry.refresh(true)]);
    expect(fetchCount).toBe(1);
  });

  it('fires onDidChange only when content actually changed', async () => {
    const { registry } = makeRegistry();
    let fired = 0;
    registry.onDidChange(() => fired++);
    await registry.refresh(true);
    await registry.refresh(true); // content unchanged
    expect(fired).toBe(1);
  });

  it('keeps provenance per model', async () => {
    const { registry } = makeRegistry({
      local: { project: [{ id: 'local-only', name: 'Local Only' }], user: [] },
    });
    await registry.refresh(true);
    const localOnly = registry.getAll().find((m) => m.id === 'local-only');
    expect(localOnly?.provenance).toBe('local');
    const kimi = registry.getAll().find((m) => m.id === 'kimi-k2.7');
    expect(kimi?.provenance).toBe('hardcoded');
  });
});
