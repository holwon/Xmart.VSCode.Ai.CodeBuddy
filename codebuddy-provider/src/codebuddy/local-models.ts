// Path: codebuddy-provider/src/codebuddy/local-models.ts
/**
 * Local models.json parsing — the official CodeBuddy mechanism for users to
 * customise or add models (see `.scratch/codebuddy-vscode-provider/research/02-codebuddy-api-protocol.md`
 * and the official docs "~/.codebuddy/models.json").
 *
 * Reads two locations:
 *   - user-level: `~/.codebuddy/models.json`
 *   - project-level: `.codebuddy/models.json` (in the current working dir)
 *
 * Only a subset of the official schema is consumed — the patch fields that map
 * onto `ModelInfo`. BYOK fields (url/apiKey/vendor/temperature/relatedModels)
 * are intentionally ignored (out of scope; the extension always talks to the
 * CodeBuddy cloud endpoint).
 *
 * Pure logic, zero `vscode` dependency. Filesystem access is injectable so
 * tests can supply a fake fs without touching the real disk.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The patch fields we consume from a models.json entry. `id` is the merge key;
 * the rest are optional overrides applied field-by-field on top of the Model
 * Registry's remote/hardcoded data.
 */
export interface LocalModelPatch {
  id: string;
  name?: string;
  supportsToolCall?: boolean;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

/** Raw shape of a models.json entry as documented by CodeBuddy. */
export interface RawLocalModel {
  id: string;
  name?: string;
  vendor?: string;
  apiKey?: string;
  url?: string;
  temperature?: number;
  supportsToolCall?: boolean;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  relatedModels?: unknown;
}

export interface LocalModelsConfig {
  /** Patch entries from the project-level file, keyed by model id. */
  project: Map<string, LocalModelPatch>;
  /** Patch entries from the user-level file, keyed by model id. */
  user: Map<string, LocalModelPatch>;
}

export interface LocalModelsFs {
  existsSync(filePath: string): boolean;
  readFileSync(filePath: string, encoding: 'utf8'): string;
}

const defaultFs: LocalModelsFs = fs;

/** Resolve the user-level models.json path (`~/.codebuddy/models.json`). */
export function userModelsPath(homedir = os.homedir()): string {
  return path.join(homedir, '.codebuddy', 'models.json');
}

/** Resolve the project-level models.json path (`.codebuddy/models.json`). */
export function projectModelsPath(cwd = process.cwd()): string {
  return path.join(cwd, '.codebuddy', 'models.json');
}

/**
 * Read and parse a single models.json file into patches keyed by id.
 * Missing file, malformed JSON, or invalid entries degrade safely to an empty
 * map — never throws for user-data problems.
 */
export function parseModelsFile(
  filePath: string,
  fsImpl: LocalModelsFs = defaultFs,
): Map<string, LocalModelPatch> {
  const patches = new Map<string, LocalModelPatch>();
  if (!fsImpl.existsSync(filePath)) {
    return patches;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
  } catch {
    return patches;
  }
  if (typeof raw !== 'object' || raw === null) {
    return patches;
  }
  const root = raw as Record<string, unknown>;

  // The official schema accepts either a bare array of models or an object
  // with a `models` array (CLI variant). Accept both.
  const entries = Array.isArray(root) ? root : Array.isArray(root.models) ? (root.models as unknown[]) : [];
  for (const entry of entries) {
    const patch = toLocalModelPatch(entry);
    if (patch) {
      patches.set(patch.id, patch);
    }
  }
  return patches;
}

/**
 * Read both user-level and project-level configs. Never throws. The caller
 * (Model Registry) is responsible for merging with project-level priority.
 */
export function readLocalModelsConfig(
  options: { homedir?: string; cwd?: string; fsImpl?: LocalModelsFs } = {},
): LocalModelsConfig {
  const fsImpl = options.fsImpl ?? defaultFs;
  const user = parseModelsFile(userModelsPath(options.homedir), fsImpl);
  const project = parseModelsFile(projectModelsPath(options.cwd), fsImpl);
  return { user, project };
}

/** Coerce an unknown models.json entry into a usable patch, or null. */
function toLocalModelPatch(entry: unknown): LocalModelPatch | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const raw = entry as RawLocalModel;
  if (typeof raw.id !== 'string' || raw.id === '') {
    return null;
  }
  const patch: LocalModelPatch = { id: raw.id };
  if (typeof raw.name === 'string') {
    patch.name = raw.name;
  }
  if (typeof raw.supportsToolCall === 'boolean') {
    patch.supportsToolCall = raw.supportsToolCall;
  }
  if (typeof raw.supportsImages === 'boolean') {
    patch.supportsImages = raw.supportsImages;
  }
  if (typeof raw.supportsReasoning === 'boolean') {
    patch.supportsReasoning = raw.supportsReasoning;
  }
  if (typeof raw.maxInputTokens === 'number' && Number.isFinite(raw.maxInputTokens)) {
    patch.maxInputTokens = raw.maxInputTokens;
  }
  if (typeof raw.maxOutputTokens === 'number' && Number.isFinite(raw.maxOutputTokens)) {
    patch.maxOutputTokens = raw.maxOutputTokens;
  }
  return patch;
}
