// Path: codebuddy-provider/src/test/model-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { URL } from 'node:url';
import { CodeBuddyApiError } from '../codebuddy/client';
import { CatalogTransport, fetchModelCatalog, toNumber } from '../codebuddy/model-catalog';

function makeTransport(statusCode: number, body: string): CatalogTransport {
  return {
    async get(_url, _headers) {
      return { statusCode, body };
    },
  };
}

const VALID_BODY = JSON.stringify({
  code: 0,
  data: {
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1_000_000, maxTokens: 8192, disabled: false },
      { id: 'hy3', name: 'Hunyuan 3', contextWindow: 262_144, maxTokens: 8192, supportsImages: true },
      { id: 'retired', name: 'Retired', disabled: true },
    ],
    agents: [{ name: 'cli', models: ['deepseek-v4-pro', 'hy3', 'retired'] }],
  },
});

describe('fetchModelCatalog', () => {
  it('fetches, filters by cli whitelist and disabled, returns usable models', async () => {
    const result = await fetchModelCatalog({
      accessToken: 'tok',
      transport: makeTransport(200, VALID_BODY),
    });
    expect(result.models.map((m) => m.id)).toEqual(['deepseek-v4-pro', 'hy3']);
    expect(result.models[0].maxInputTokens).toBe(1_000_000);
    expect(result.models[1].supportsImages).toBe(true);
    expect(result.models[1].maxInputTokens).toBe(262_144);
    expect(result.all.map((m) => m.id)).toEqual(['deepseek-v4-pro', 'hy3', 'retired']);
  });

  it('throws CodeBuddyApiError on non-200 status', async () => {
    const transport = makeTransport(500, JSON.stringify({ code: 500, msg: 'boom' }));
    await expect(fetchModelCatalog({ accessToken: 'tok', transport })).rejects.toBeInstanceOf(
      CodeBuddyApiError,
    );
  });

  it('throws CodeBuddyApiError on a {code!==0} envelope', async () => {
    const transport = makeTransport(200, JSON.stringify({ code: 401, msg: 'unauthorized', data: null }));
    await expect(fetchModelCatalog({ accessToken: 'tok', transport })).rejects.toMatchObject({
      code: 401,
    });
  });

  it('returns empty models when the whitelist is empty', async () => {
    const transport = makeTransport(
      200,
      JSON.stringify({ code: 0, data: { models: [{ id: 'm1' }], agents: [] } }),
    );
    const result = await fetchModelCatalog({ accessToken: 'tok', transport });
    expect(result.models).toEqual([]);
  });

  it('defensively parses contextWindow as string and object shapes', async () => {
    const transport = makeTransport(
      200,
      JSON.stringify({
        code: 0,
        data: {
          models: [
            { id: 'a', contextWindow: '1000', maxTokens: '500' },
            { id: 'b', contextWindow: { value: 2000 }, maxTokens: { value: 600 } },
            { id: 'c', contextWindow: 'oops', maxTokens: 700 },
          ],
          agents: [{ name: 'cli', models: ['a', 'b', 'c'] }],
        },
      }),
    );
    const result = await fetchModelCatalog({ accessToken: 'tok', transport });
    const byId = Object.fromEntries(result.models.map((m) => [m.id, m]));
    expect(byId.a.maxInputTokens).toBe(1000);
    expect(byId.a.maxOutputTokens).toBe(500);
    expect(byId.b.maxInputTokens).toBe(2000);
    expect(byId.b.maxOutputTokens).toBe(600);
    expect(byId.c.maxInputTokens).toBe(131_072); // fallback
    expect(byId.c.maxOutputTokens).toBe(700);
  });

  it('sends Authorization and Origin headers', async () => {
    let captured: Record<string, string> = {};
    const transport: CatalogTransport = {
      async get(url, headers) {
        captured = headers;
        void url;
        return { statusCode: 200, body: JSON.stringify({ code: 0, data: { models: [], agents: [] } }) };
      },
    };
    await fetchModelCatalog({ accessToken: 'tok', userId: 'uid-1', transport });
    expect(captured.Authorization).toBe('Bearer tok');
    expect(captured['X-User-Id']).toBe('uid-1');
    expect(captured.Origin).toContain('codebuddy.cn');
  });
});

describe('toNumber', () => {
  it('parses number, string, object, and falls back', () => {
    expect(toNumber(100, 0)).toBe(100);
    expect(toNumber('100', 0)).toBe(100);
    expect(toNumber({ value: 100 }, 0)).toBe(100);
    expect(toNumber('nope', 42)).toBe(42);
    expect(toNumber(undefined, 42)).toBe(42);
  });
});
