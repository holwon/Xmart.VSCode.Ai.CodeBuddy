/**
 * The VS Code `LanguageModelChatProvider` implementation for CodeBuddy.
 *
 * Maps the stable provider API (three methods) onto the CodeBuddy streaming
 * endpoint. All protocol details live in `src/codebuddy/*`; this file is a
 * thin adapter between vscode objects and the light types used there.
 *
 * Design notes (see `.scratch/codebuddy-vscode-provider/research/01-vscode-lm-provider-api.md`):
 * - The stable API has no `provideLanguageModelChatTools` method — tools are
 *   passed per-request via `options.tools`; we convert them and let the model
 *   decide (or force via `toolMode`).
 * - Tool calls are accumulated across stream chunks and reported once the
 *   stream ends (VS Code only acts on them after the response completes).
 * - `delta.reasoning_content` (DeepSeek thinking) is reported as a
 *   `LanguageModelThinkingPart` (proposed `chatProvider` API) so Copilot
 *   renders the reasoning process separately from the final text.
 */

import * as vscode from 'vscode';
import { CodeBuddyApiError, CodeBuddyClient } from './codebuddy/client';
import { convertResponse } from './codebuddy/dto';
import { mapCodeBuddyError } from './codebuddy/errors';
import { toCodeBuddyMessages, toCodeBuddyTools, toCodeBuddyToolChoice } from './codebuddy/messages';
import { ModelInfo } from './codebuddy/models';
import { fetchModelCatalog } from './codebuddy/model-catalog';
import { readLocalModelsConfig } from './codebuddy/local-models';
import { ModelRegistry } from './codebuddy/model-registry';
import { describeEmptyStream, isStreamEmpty } from './codebuddy/response-guard';
import { dispatchPart, renderPartForTokens } from './codebuddy/parts';
import { estimateTokenCount, memoizeTokenCount } from './codebuddy/token';
import { ToolCallAccumulator } from './codebuddy/toolcalls';
import { ChatMessagePart, ChatRequestMessage, ChatTool } from './codebuddy/types';
import { aggregateRequestUsage, toApiUsage } from './codebuddy/usage';
import { SessionLedger } from './codebuddy/session-ledger';

const VENDOR = 'codebuddy';

/**
 * MimeType Copilot Chat uses to consume a `LanguageModelDataPart` carrying real
 * token usage (see `CustomDataPartMimeTypes.Usage` in the Copilot extension).
 * Reporting a usage part with this mimeType is what makes the Session Info /
 * Context Window widget in the bottom-right of Copilot Chat show real numbers.
 */
const USAGE_MIME_TYPE = 'usage';

/**
 * True when the `chatProvider` proposed API is available at runtime. The
 * extension declares `enabledApiProposals: ["chatProvider"]`, but VS Code
 * only exposes proposed APIs when launched with
 * `--enable-proposed-api=local.codebuddy-provider`. Guard every use so the
 * provider degrades gracefully (thinking rendered as plain text) instead of
 * crashing when the proposal is absent.
 */
const thinkingPartSupported =
  typeof (vscode as { LanguageModelThinkingPart?: unknown }).LanguageModelThinkingPart === 'function';

/**
 * Report a reasoning_content chunk to the progress channel. When the proposed
 * `LanguageModelThinkingPart` is available it is emitted as-is (Copilot
 * renders it separately); otherwise it is dropped (NOT degraded to a
 * LanguageModelTextPart) so the reasoning text is never persisted into the
 * conversation history as assistant content — degrading to a TextPart would
 * inflate subsequent input tokens on every later turn.
 *
 * `enabled` is read from the `codebuddy.enableReasoning` setting; when false
 * the chunk is ignored entirely.
 */
function reportReasoningChunk(
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  text: string,
  enabled: boolean,
): void {
  if (!enabled) {
    return;
  }
  if (thinkingPartSupported) {
    progress.report(new vscode.LanguageModelThinkingPart(text) as vscode.LanguageModelResponsePart);
  }
  // When the proposed API is unavailable, drop the chunk instead of falling
  // back to a TextPart that VS Code would persist into history.
}

// Memoized token estimator shared across provideTokenCount calls so repeated
// text (tool schemas, common system content) is computed only once.
const memoizedEstimateTokenCount = memoizeTokenCount(estimateTokenCount);

/**
 * Environment-variable fallback for the access token, matching the CodeBuddy
 * CLI convention (see research/02). Takes effect only when the
 * `codebuddy.accessToken` setting is empty.
 */
export const CODEBUDDY_TOKEN_ENV_VAR = 'CODEBUDDY_AUTH_TOKEN';

// ─── Diagnostics ───
// Output channel that logs what the provider receives from VS Code and what
// it sends to CodeBuddy (without tokens or full message contents), so request
// failures can be diagnosed from the "CodeBuddy Provider" output panel.
let outputChannel: vscode.OutputChannel | undefined;

function log(message: string): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('CodeBuddy Provider');
  }
  outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function disposeLog(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}

function createClient(): CodeBuddyClient {
  const config = vscode.workspace.getConfiguration('codebuddy');
  const accessToken =
    config.get<string>('accessToken', '') || process.env[CODEBUDDY_TOKEN_ENV_VAR] || '';
  if (!accessToken) {
    throw vscode.LanguageModelError.NoPermissions(
      'CodeBuddy access token is not configured. Set "codebuddy.accessToken" in your settings, ' +
        `or the "${CODEBUDDY_TOKEN_ENV_VAR}" environment variable.`,
    );
  }
  return new CodeBuddyClient({
    accessToken,
    userId: config.get<string>('userId', '') || undefined,
  });
}

/** Read the enterprise id from settings, trimmed and empty-aware. */
function readEnterpriseId(): string | undefined {
  const config = vscode.workspace.getConfiguration('codebuddy');
  const enterpriseId = config.get<string>('enterpriseId', '') ?? '';
  const trimmed = enterpriseId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Read whether reasoning_content handling is enabled. Defaults to true. */
function readEnableReasoning(): boolean {
  const config = vscode.workspace.getConfiguration('codebuddy');
  return config.get<boolean>('enableReasoning', true) !== false;
}

function toModelInformation(model: ModelInfo): vscode.LanguageModelChatInformation {
  const info: vscode.LanguageModelChatInformation = {
    id: model.id,
    name: model.name,
    family: model.family,
    version: model.version,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    tooltip: model.detail,
    capabilities: {
      toolCalling: model.toolCalling,
      // VS Code 1.98+ surfaces image input; absent → undefined (no capability).
      imageInput: model.supportsImages === true ? true : undefined,
    },
  };

  // Model-configuration picker (proposed API): expose the Thinking Effort
  // selector when the model supports reasoning levels. The user's choice
  // arrives at provideLanguageModelChatResponse via
  // `options.modelConfiguration?.reasoningEffort`.
  if (model.reasoningEffortLevels && model.reasoningEffortLevels.length > 0) {
    info.configurationSchema = {
      properties: {
        reasoningEffort: {
          type: 'string',
          title: 'Thinking Effort',
          enum: model.reasoningEffortLevels,
          enumItemLabels: model.reasoningEffortLevels.map((level) => capitalize(level)),
          enumDescriptions: [
            'Disable extended reasoning for fastest responses',
            'Light reasoning, faster responses',
            'Balanced reasoning and speed',
            'Deep reasoning, slower but more thorough',
          ].slice(0, model.reasoningEffortLevels.length),
          default: model.defaultReasoningEffort,
          group: 'navigation',
        },
      },
    };
  }

  return info;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Build the real (non-test) ModelRegistry dependencies from VS Code
 * configuration. Reads the access token and the models-cache TTL lazily per
 * refresh, mirroring createClient's per-request config read.
 */
export function createDefaultRegistryDeps(): ConstructorParameters<typeof ModelRegistry>[0]['deps'] {
  const config = vscode.workspace.getConfiguration('codebuddy');
  const ttlSeconds = Math.max(30, config.get<number>('modelsCacheTtlSeconds', 1800));
  const readToken = () => {
    const token = config.get<string>('accessToken', '') || process.env[CODEBUDDY_TOKEN_ENV_VAR] || '';
    return {
      accessToken: token,
      userId: config.get<string>('userId', '') || undefined,
      enterpriseId: readEnterpriseId(),
    };
  };

  return {
    ttlMs: ttlSeconds * 1000,
    async fetchCatalog() {
      const { accessToken, userId, enterpriseId } = readToken();
      if (!accessToken) {
        throw vscode.LanguageModelError.NoPermissions(
          'CodeBuddy access token is not configured. Set "codebuddy.accessToken" in your settings, ' +
            `or the "${CODEBUDDY_TOKEN_ENV_VAR}" environment variable.`,
        );
      }
      const result = await fetchModelCatalog({ accessToken, userId, enterpriseId });
      return result.models;
    },
    readLocal: readLocalModelsConfig,
  };
}

function toChatTool(tool: vscode.LanguageModelChatTool): ChatTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function toChatMessageParts(content: readonly unknown[]): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [];
  for (const item of content) {
    const dispatched = dispatchPart(item);
    if (dispatched !== null) {
      parts.push(dispatched);
    }
  }
  return parts;
}

function toChatRequestMessage(message: vscode.LanguageModelChatRequestMessage): ChatRequestMessage {
  return {
    role: message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
    parts: toChatMessageParts(message.content),
  };
}

function mapErrorCode(error: CodeBuddyApiError): vscode.LanguageModelError {
  const mapping = mapCodeBuddyError(error);
  if (mapping.kind === 'no-permissions') {
    return vscode.LanguageModelError.NoPermissions(mapping.message);
  }
  if (mapping.kind === 'not-found') {
    return vscode.LanguageModelError.NotFound(mapping.message);
  }
  return new vscode.LanguageModelError(mapping.message);
}

export function registerCodeBuddyProvider(
  registry: ModelRegistry = new ModelRegistry({ deps: createDefaultRegistryDeps() }),
): vscode.Disposable {
  // Notify VS Code to re-query model information when the registry content
  // changes (stable API optional event — research/01 §2).
  const changeEvent = new vscode.EventEmitter<void>();
  const unsubscribe = registry.onDidChange(() => changeEvent.fire());
  // Session Ledger lives at provider scope so Token Usage accumulates across
  // requests (CONTEXT.md: "跨请求累计 token 记账").
  const ledger = new SessionLedger();

  const provider: vscode.LanguageModelChatProvider = {
    onDidChangeLanguageModelChatInformation: changeEvent.event,

    provideLanguageModelChatInformation: async () => {
      await registry.refresh();
      return registry.getAll().map(toModelInformation);
    },

    provideLanguageModelChatResponse: async (model, messages, options, progress, token) => {
      const enableReasoning = readEnableReasoning();
      log(
        `→ request model=${model.id} messages=${messages.length} ` +
          `tools=${(options.tools ?? []).length} toolMode=${options.toolMode} ` +
          `enableReasoning=${enableReasoning}`,
      );
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const role = m.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user';
        const parts = m.content.map((p) =>
          typeof p === 'string' ? `str(${p.length})` : ((p as object).constructor?.name ?? 'unknown'),
        );
        log(`  [${i}] ${role} parts=${parts.join(',')}`);
      }
      log(
        `  tools=${(options.tools ?? [])
          .map((t) => `${t.name}(schema:${t.inputSchema ? 'yes' : 'no'},desc:${t.description?.length ?? 0})`)
          .join(', ')}`,
      );

      const client = createClient();
      const chatMessages = messages.map(toChatRequestMessage);
      const convertedMessages = toCodeBuddyMessages(chatMessages);
      const tools = toCodeBuddyTools(options.tools?.map(toChatTool));
      // A required tool mode only makes sense when tools were actually provided.
      const toolChoice = tools ? toCodeBuddyToolChoice(options.toolMode) : undefined;
      // Thinking Effort from the model picker (proposed API). 'off' / missing
      // means upstream default; otherwise map to CodeBuddy's reasoning_effort.
      const rawEffort = options.modelConfiguration?.reasoningEffort;
      const reasoningEffort =
        typeof rawEffort === 'string' && rawEffort !== 'off' ? rawEffort : undefined;

      log(
        `  → codebuddy messages: ${convertedMessages
          .map(
            (m) =>
              `${m.role}(${m.content === null ? 'null' : `${(m.content as string).length}ch`}` +
              `${m.tool_calls ? `,${m.tool_calls.length}tc` : ''}${m.tool_call_id ? ',tid' : ''})`,
          )
          .join(' | ')}`,
      );
      log(
        `  → codebuddy tools: ${tools ? `${tools.length} tools` : 'none'} tool_choice: ${toolChoice ?? 'auto'}` +
          ` reasoning_effort: ${reasoningEffort ?? '(default)'}`,
      );

      const controller = new AbortController();
      if (token.isCancellationRequested) {
        controller.abort();
      }
      const cancellationSubscription = token.onCancellationRequested(() => controller.abort());
      const toolCalls = new ToolCallAccumulator();
      // Collect this request's usage chunks, then record once at the end
      // (avoids double-counting when CodeBuddy repeats usage on several chunks).
      const requestUsageChunks: unknown[] = [];
      let reported = false;
      let eventCount = 0;
      let contentChars = 0;

      try {
        await client.stream(
          {
            model: model.id,
            messages: convertedMessages,
            tools,
            tool_choice: toolChoice,
            reasoning_effort: reasoningEffort,
          },
          {
            onEvent: (payload) => {
              eventCount += 1;
              const converted = convertResponse(payload) as {
                choices?: { delta?: Record<string, unknown> }[];
                usage?: unknown;
              };
              // Capture the real Token Usage from the response (CodeBuddy may
              // send it on one of the stream chunks; collect for end-of-request
              // aggregation so repeated chunks count once).
              if (converted.usage !== undefined) {
                requestUsageChunks.push(converted.usage);
              }
              const delta = converted.choices?.[0]?.delta;
              if (!delta) {
                return;
              }
              // reasoning_content: DeepSeek thinking stream (proposed API).
              // Report it as a LanguageModelThinkingPart so Copilot renders it
              // separately from the final text. Gated by the
              // `codebuddy.enableReasoning` setting (default true). When the
              // proposed API is unavailable or the setting is off, the chunk is
              // dropped so it never pollutes the conversation history.
              if (typeof delta.reasoning_content === 'string' && delta.reasoning_content !== '') {
                reportReasoningChunk(progress, delta.reasoning_content, enableReasoning);
              }
              if (typeof delta.content === 'string' && delta.content !== '') {
                contentChars += delta.content.length;
                progress.report(new vscode.LanguageModelTextPart(delta.content));
              }
              if (Array.isArray(delta.tool_calls)) {
                for (const fragment of delta.tool_calls) {
                  toolCalls.add(fragment as { index?: number; id?: string; function?: { name?: string; arguments?: string } });
                }
              }
            },
            onDone: () => {
              // Guard against double delivery (defensive; the client already
              // guarantees exactly one onDone per stream).
              if (reported) {
                return;
              }
              reported = true;
              log(`  ← stream done: events=${eventCount} contentChars=${contentChars} toolCalls=${toolCalls.size}`);
              // Record this request's usage once (dedup across repeated chunks).
              const requestUsage = aggregateRequestUsage(requestUsageChunks);
              ledger.record(requestUsage);
              const usage = ledger.summary();
              log(
                `  ← token usage: input=${usage.input} output=${usage.output}` +
                  ` cached=${usage.cached} reasoning=${usage.reasoning} requests=${usage.requests}`,
              );

              // Report the real Token Usage back to Copilot so the Session Info
              // / Context Window widget shows actual consumption. Copilot's chat
              // endpoint consumes a `LanguageModelDataPart` whose mimeType is
              // `usage` (stable API), parses it as OpenAI-compatible usage and
              // feeds `IChatUsage` into the widget. Skip when no usage arrived.
              if (requestUsage.input > 0 || requestUsage.output > 0) {
                progress.report(
                  new vscode.LanguageModelDataPart(
                    new TextEncoder().encode(JSON.stringify(toApiUsage(requestUsage))),
                    USAGE_MIME_TYPE,
                  ),
                );
              }

              // Empty-response guard: CodeBuddy occasionally ends a stream
              // with no text and no tool calls. Completing silently makes VS
              // Code surface a confusing "Response contained no choices"
              // error; raise a meaningful one instead. Use the count of
              // *complete* tool calls (toParts drops fragments without an id
              // or name), so truncated tool-call fragments don't mask an
              // otherwise empty stream.
              const completeToolCalls = toolCalls.toParts().length;
              if (isStreamEmpty({ eventCount, contentChars, toolCallCount: completeToolCalls })) {
                throw new vscode.LanguageModelError(
                  describeEmptyStream({ eventCount, contentChars, toolCallCount: completeToolCalls }),
                );
              }

              for (const call of toolCalls.toParts()) {
                progress.report(new vscode.LanguageModelToolCallPart(call.callId, call.name, call.input));
              }
            },
          },
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) {
          // User cancelled: complete silently.
          return;
        }
        log(`  ← error: ${(error as Error).stack ?? String(error)}`);
        if (error instanceof CodeBuddyApiError) {
          log(`    code=${error.code} httpStatus=${error.httpStatus} msg=${error.msg.slice(0, 500)}`);
          throw mapErrorCode(error);
        }
        // LanguageModelError (e.g. from the empty-response guard) passes
        // through untouched so the user sees its message.
        if (error instanceof vscode.LanguageModelError) {
          throw error;
        }
        throw new vscode.LanguageModelError(
          `CodeBuddy request failed: ${(error as Error).message ?? String(error)}`,
        );
      } finally {
        cancellationSubscription.dispose();
      }
    },

    provideTokenCount: async (_model, text) => {
      // Memoized estimation: tool schemas and repeated content are estimated
      // repeatedly by VS Code, so caching identical text avoids recomputation.
      if (typeof text === 'string') {
        return memoizedEstimateTokenCount(text);
      }
      const raw = text.content.map(renderPartForTokens).join(' ');
      return memoizedEstimateTokenCount(raw);
    },
  };

  const registration = vscode.lm.registerLanguageModelChatProvider(VENDOR, provider);
  return {
    dispose() {
      unsubscribe();
      changeEvent.dispose();
      registration.dispose();
    },
  };
}
