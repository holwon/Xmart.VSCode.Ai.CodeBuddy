// Path: codebuddy-provider/src/codebuddy/model-catalog.ts
/**
 * Remote Model Catalog client — fetches the CodeBuddy model directory and
 * resolves Model Availability (the account's actually-usable subset).
 *
 * The endpoint is community-verified, NOT officially documented (see
 * `.scratch/codebuddy-vscode-provider/research/02-codebuddy-api-protocol.md`
 * and ADR-0001). It may change or be blocked; every failure here must be
 * handled by the caller's fallback chain.
 *
 * Pure logic, zero `vscode` dependency. Network is injectable so tests can
 * stage responses without real sockets.
 */

import https from 'node:https';
import { URL } from 'node:url';
import { CodeBuddyApiError } from './client';
import { detectCodeBuddyError } from './dto';

/**
 * Default remote model-directory endpoint. Kept for backward compatibility and
 * as the personal-user fallback. Prefer `resolveModelsEndpoint(enterpriseId)`
 * which picks the enterprise or personal path based on configuration.
 */
export const CODEBUDDY_MODELS_ENDPOINT = 'https://copilot.tencent.com/console/enterprises/personal/models';

/** Conservative fallback when contextWindow/maxTokens parse fails. */
const DEFAULT_MAX_INPUT_TOKENS = 131_072;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** Wire model as returned by the directory endpoint. */
export interface RemoteModelMeta {
  id: string;
  name?: string;
  description?: string;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  contextWindow?: unknown;
  maxTokens?: unknown;
  disabled?: boolean;
  disabledReason?: string;
  isDefault?: boolean;
  configurable?: boolean;
  configured?: boolean;
  credits?: unknown;
}

/** The normalized catalog entry consumed by the Model Registry. */
export interface ModelCatalogEntry {
  id: string;
  name: string;
  description?: string;
  supportsImages: boolean;
  supportsReasoning: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** Whether the model is disabled upstream (kept in `all` for diagnostics). */
  disabled?: boolean;
}

export interface ModelCatalogResult {
  /** Availability-filtered, usable entries (cli whitelist ∩ !disabled). */
  models: ModelCatalogEntry[];
  /** Full catalog before availability filtering (for diagnostics). */
  all: ModelCatalogEntry[];
}

/** Abstraction over the network so tests can inject a fake. */
export interface CatalogTransport {
  get(
    url: URL,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ statusCode: number; body: string }>;
}

const defaultTransport: CatalogTransport = {
  get(url, headers, timeoutMs): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers, timeout: timeoutMs },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () =>
            resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
          );
        },
      );
      req.on('timeout', () =>
        req.destroy(new CodeBuddyApiError(-1, 'CodeBuddy model catalog request timed out')),
      );
      req.on('error', reject);
    });
  },
};

export interface FetchModelCatalogOptions {
  accessToken: string;
  userId?: string;
  enterpriseId?: string;
  endpoint?: string;
  timeoutMs?: number;
  transport?: CatalogTransport;
}

/** Base models endpoint shared by both personal and enterprise paths. */
const CODEBUDDY_MODELS_BASE = 'https://copilot.tencent.com/console/enterprises';

/**
 * Resolve the models endpoint URL. When `enterpriseId` is provided we hit the
 * enterprise-scoped `/config/models` path (matching the official plugin);
 * otherwise we fall back to the community-verified `/personal/models` path.
 */
export function resolveModelsEndpoint(enterpriseId?: string): string {
  const id = enterpriseId?.trim();
  if (id && id.length > 0) {
    return `${CODEBUDDY_MODELS_BASE}/${encodeURIComponent(id)}/config/models`;
  }
  return `${CODEBUDDY_MODELS_BASE}/personal/models`;
}

/** Default per-request timeout for the catalog endpoint. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetch the Model Catalog, apply Availability filtering (cli whitelist ∩
 * models[] with `!disabled`), and defensively parse the token windows.
 *
 * Throws `CodeBuddyApiError` on non-200 status, `{code !== 0}` envelope,
 * network error, or timeout.
 */
export async function fetchModelCatalog(
  options: FetchModelCatalogOptions,
): Promise<ModelCatalogResult> {
  const endpoint = new URL(
    options.endpoint ?? resolveModelsEndpoint(options.enterpriseId),
  );
  const transport = options.transport ?? defaultTransport;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${options.accessToken}`,
    Origin: 'https://www.codebuddy.cn/',
    Referer: 'https://www.codebuddy.cn/',
    'User-Agent': 'CLI/2.63.2 CodeBuddy/2.63.2',
  };
  if (options.userId && options.userId !== '') {
    headers['X-User-Id'] = options.userId;
  }

  const { statusCode, body } = await transport.get(endpoint, headers, timeoutMs);

  if (statusCode !== 200) {
    const parsed = tryParseJson(body);
    const cbError = detectCodeBuddyError(parsed);
    throw new CodeBuddyApiError(
      cbError?.code ?? -1,
      cbError?.msg ?? `CodeBuddy model catalog returned HTTP ${statusCode}: ${body.slice(0, 200)}`,
      statusCode,
    );
  }

  const parsed = tryParseJson(body);
  const cbError = detectCodeBuddyError(parsed);
  if (cbError) {
    throw new CodeBuddyApiError(cbError.code, cbError.msg);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodeBuddyApiError(-1, 'CodeBuddy model catalog returned a non-object payload');
  }

  const data = (parsed as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) {
    throw new CodeBuddyApiError(-1, 'CodeBuddy model catalog response is missing data');
  }

  const all = toCatalogEntries((data as Record<string, unknown>).models);
  const whitelist = extractCliWhitelist((data as Record<string, unknown>).agents);
  const usable = all.filter((m) => whitelist.has(m.id) && m.disabled !== true);

  return { models: usable, all };
}

/** Normalize the raw `models[]` payload, keeping disabled entries for `all`. */
function toCatalogEntries(models: unknown): ModelCatalogEntry[] {
  if (!Array.isArray(models)) {
    return [];
  }
  const entries: ModelCatalogEntry[] = [];
  for (const item of models) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const raw = item as RemoteModelMeta;
    if (typeof raw.id !== 'string' || raw.id === '') {
      continue;
    }
    entries.push({
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : raw.id,
      description:
        typeof raw.description === 'string' && raw.description !== '' ? raw.description : undefined,
      supportsImages: raw.supportsImages === true,
      supportsReasoning: raw.supportsReasoning === true,
      maxInputTokens: toNumber(raw.contextWindow, DEFAULT_MAX_INPUT_TOKENS),
      maxOutputTokens: toNumber(raw.maxTokens, DEFAULT_MAX_OUTPUT_TOKENS),
      disabled: raw.disabled === true ? true : undefined,
    });
  }
  return entries;
}

/** Extract the model-id whitelist from `agents[].name == "cli"`. */
function extractCliWhitelist(agents: unknown): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(agents)) {
    return set;
  }
  for (const agent of agents) {
    if (typeof agent !== 'object' || agent === null) {
      continue;
    }
    const a = agent as Record<string, unknown>;
    if (a.name !== 'cli' || !Array.isArray(a.models)) {
      continue;
    }
    for (const id of a.models) {
      if (typeof id === 'string' && id !== '') {
        set.add(id);
      }
    }
  }
  return set;
}

/**
 * Defensive numeric parse for `contextWindow`/`maxTokens`. Accepts number,
 * numeric string, or `{ value: number }` object shapes; anything else or
 * failure yields the provided fallback.
 */
export function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  if (typeof value === 'object' && value !== null) {
    const v = (value as Record<string, unknown>).value;
    return toNumber(v, fallback);
  }
  return fallback;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
