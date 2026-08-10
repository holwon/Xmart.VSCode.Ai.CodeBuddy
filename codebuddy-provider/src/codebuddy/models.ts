/**
 * Model metadata for the models exposed to VS Code via
 * `provideLanguageModelChatInformation`.
 *
 * The list is reverse-engineered from the CodeBuddy client (see
 * `.scratch/codebuddy-vscode-provider/research/02-codebuddy-api-protocol.md`
 * §1). Context-window and output-token values are community measurements and
 * may drift; they are conservative estimates and only affect budgeting UI,
 * not correctness. `toolCalling: true` is required for VS Code's agent mode
 * (`suitableForAgentMode` checks `capabilities.toolCalling`).
 */

export interface ModelInfo {
  /** CodeBuddy wire model id (also used as the vscode model id). */
  id: string;
  /** Display name in the model picker. */
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  toolCalling: boolean;
  detail?: string;
  /**
   * Reasoning-effort levels the model exposes in the VS Code model picker
   * ("Thinking Effort" selector). `'off'` disables reasoning entirely.
   * Defaults to none (no selector shown).
   */
  reasoningEffortLevels?: string[];
  /** Default effort when the user has not picked one. */
  defaultReasoningEffort?: string;
}

export const CODEBUDDY_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    family: 'deepseek-v4',
    version: 'pro',
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
    toolCalling: true,
    reasoningEffortLevels: ['off', 'low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    detail: 'DeepSeek V4 Pro (CodeBuddy cloud)',
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    family: 'deepseek-v4',
    version: 'flash',
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
    toolCalling: true,
    reasoningEffortLevels: ['off', 'low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    detail: 'DeepSeek V4 Flash (CodeBuddy cloud)',
  },
  {
    id: 'glm-5.2',
    name: 'GLM-5.2',
    family: 'glm',
    version: '5.2',
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
    toolCalling: true,
    detail: 'GLM-5.2 (CodeBuddy cloud)',
  },
  {
    id: 'glm-5.1',
    name: 'GLM-5.1',
    family: 'glm',
    version: '5.1',
    maxInputTokens: 131_072,
    maxOutputTokens: 8192,
    toolCalling: true,
  },
  {
    id: 'glm-5v-turbo',
    name: 'GLM-5V Turbo',
    family: 'glm-5v',
    version: 'turbo',
    maxInputTokens: 131_072,
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
    detail: 'Kimi K2.7 (CodeBuddy cloud)',
  },
  {
    id: 'minimax-m3-pay',
    name: 'MiniMax M3',
    family: 'minimax-m3',
    version: 'pay',
    maxInputTokens: 204_800,
    maxOutputTokens: 8192,
    toolCalling: true,
  },
  {
    id: 'hy3',
    name: 'Hunyuan 3',
    family: 'hy3',
    version: '3',
    maxInputTokens: 262_144,
    maxOutputTokens: 8192,
    toolCalling: true,
    detail: 'Hunyuan 3 (reasoning_effort: high enables deep thinking)',
  },
  {
    id: 'hy3-preview',
    name: 'Hunyuan 3 Preview',
    family: 'hy3',
    version: 'preview',
    maxInputTokens: 262_144,
    maxOutputTokens: 8192,
    toolCalling: true,
  },
  {
    id: 'hy3-preview-agent',
    name: 'Hunyuan 3 Preview Agent',
    family: 'hy3',
    version: 'preview-agent',
    maxInputTokens: 262_144,
    maxOutputTokens: 8192,
    toolCalling: true,
  },
];
