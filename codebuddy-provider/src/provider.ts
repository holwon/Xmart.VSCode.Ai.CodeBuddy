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
 * - `delta.reasoning_content` (DeepSeek thinking) cannot be expressed as a
 *   part in the stable API, so it is dropped. Revisit if the `chatProvider`
 *   proposal with `LanguageModelThinkingPart` is adopted.
 */

import * as vscode from 'vscode';
import { CodeBuddyApiError, CodeBuddyClient } from './codebuddy/client';
import { convertResponse } from './codebuddy/dto';
import { toCodeBuddyMessages, toCodeBuddyTools, toCodeBuddyToolChoice } from './codebuddy/messages';
import { CODEBUDDY_MODELS, ModelInfo } from './codebuddy/models';
import { estimateTokenCount } from './codebuddy/token';
import { ToolCallAccumulator } from './codebuddy/toolcalls';
import { ChatMessagePart, ChatRequestMessage, ChatTool } from './codebuddy/types';

const VENDOR = 'codebuddy';

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
  const accessToken = config.get<string>('accessToken', '');
  if (!accessToken) {
    throw vscode.LanguageModelError.NoPermissions(
      'CodeBuddy access token is not configured. Set "codebuddy.accessToken" in your settings.',
    );
  }
  return new CodeBuddyClient({
    accessToken,
    userId: config.get<string>('userId', '') || undefined,
  });
}

function toModelInformation(model: ModelInfo): vscode.LanguageModelChatInformation {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    version: model.version,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    tooltip: model.detail,
    capabilities: {
      toolCalling: model.toolCalling,
    },
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
    if (typeof item === 'string') {
      if (item !== '') {
        parts.push({ kind: 'text', text: item });
      }
      continue;
    }
    if (item instanceof vscode.LanguageModelTextPart) {
      parts.push({ kind: 'text', text: item.value });
    } else if (item instanceof vscode.LanguageModelToolCallPart) {
      parts.push({ kind: 'tool-call', callId: item.callId, name: item.name, input: item.input });
    } else if (item instanceof vscode.LanguageModelToolResultPart) {
      parts.push({ kind: 'tool-result', callId: item.callId, content: flattenToolResult(item.content) });
    } else {
      // Unknown part type: fall back to a best-effort textual representation.
      try {
        parts.push({ kind: 'text', text: JSON.stringify(item) });
      } catch {
        // Unserializable part: skip it.
      }
    }
  }
  return parts;
}

/**
 * Tool results arrive as an array of parts (`LanguageModelTextPart`, strings,
 * etc.). Flatten them into plain text so the upstream API receives clean
 * content instead of a JSON-wrapped array.
 */
function flattenToolResult(content: readonly unknown[]): string {
  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item instanceof vscode.LanguageModelTextPart) {
        return item.value;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join('\n');
}

function toChatRequestMessage(message: vscode.LanguageModelChatRequestMessage): ChatRequestMessage {
  return {
    role: message.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' : 'user',
    parts: toChatMessageParts(message.content),
  };
}

function mapErrorCode(error: CodeBuddyApiError): vscode.LanguageModelError {
  if (error.httpStatus === 401 || error.httpStatus === 403 || error.code === 11217) {
    // 11217 = "login ing" — the token is invalid or expired.
    return vscode.LanguageModelError.NoPermissions(
      `CodeBuddy authentication failed (${error.message}). Check "codebuddy.accessToken".`,
    );
  }
  if (error.httpStatus === 404) {
    return vscode.LanguageModelError.NotFound(error.message);
  }
  return new vscode.LanguageModelError(error.message);
}

export function registerCodeBuddyProvider(): vscode.Disposable {
  const provider: vscode.LanguageModelChatProvider = {
    provideLanguageModelChatInformation: async () => {
      return CODEBUDDY_MODELS.map(toModelInformation);
    },

    provideLanguageModelChatResponse: async (model, messages, options, progress, token) => {
      log(
        `→ request model=${model.id} messages=${messages.length} ` +
          `tools=${(options.tools ?? []).length} toolMode=${options.toolMode}`,
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

      log(
        `  → codebuddy messages: ${convertedMessages
          .map(
            (m) =>
              `${m.role}(${m.content === null ? 'null' : `${(m.content as string).length}ch`}` +
              `${m.tool_calls ? `,${m.tool_calls.length}tc` : ''}${m.tool_call_id ? ',tid' : ''})`,
          )
          .join(' | ')}`,
      );
      log(`  → codebuddy tools: ${tools ? `${tools.length} tools` : 'none'} tool_choice: ${toolChoice ?? 'auto'}`);

      const controller = new AbortController();
      if (token.isCancellationRequested) {
        controller.abort();
      }
      const cancellationSubscription = token.onCancellationRequested(() => controller.abort());
      const toolCalls = new ToolCallAccumulator();
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
          },
          {
            onEvent: (payload) => {
              eventCount += 1;
              const converted = convertResponse(payload) as {
                choices?: { delta?: Record<string, unknown> }[];
              };
              const delta = converted.choices?.[0]?.delta;
              if (!delta) {
                return;
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
        }
        if (error instanceof CodeBuddyApiError) {
          throw mapErrorCode(error);
        }
        throw new vscode.LanguageModelError(
          `CodeBuddy request failed: ${(error as Error).message ?? String(error)}`,
        );
      } finally {
        cancellationSubscription.dispose();
      }
    },

    provideTokenCount: async (_model, text) => {
      if (typeof text === 'string') {
        return estimateTokenCount(text);
      }
      const raw = text.content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (part instanceof vscode.LanguageModelTextPart) {
            return part.value;
          }
          if (part instanceof vscode.LanguageModelToolCallPart) {
            return `${part.name}(${JSON.stringify(part.input)})`;
          }
          if (part instanceof vscode.LanguageModelToolResultPart) {
            return JSON.stringify(part.content);
          }
          return '';
        })
        .join(' ');
      return estimateTokenCount(raw);
    },
  };

  return vscode.lm.registerLanguageModelChatProvider(VENDOR, provider);
}
