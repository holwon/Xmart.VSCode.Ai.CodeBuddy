/**
 * Message & tool conversion between the VS Code chat request shape and the
 * CodeBuddy (OpenAI-compatible) request shape.
 *
 * Message ordering: VS Code hands the provider the conversation newest-first
 * (the most recent user message — which may carry tool results — comes first,
 * followed by the assistant message that made the tool calls, then the
 * original user request). CodeBuddy/OpenAI expects oldest-first with each
 * `role: "tool"` message immediately after the assistant message that called
 * the tool, so the list is reversed before conversion.
 *
 * See `.scratch/codebuddy-vscode-provider/research/01-vscode-lm-provider-api.md`
 * §4 for the tool-call round-trip.
 */

import {
  ChatRequestMessage,
  ChatTool,
  CodeBuddyChatMessage,
  CodeBuddyToolCall,
  CodeBuddyToolDefinition,
} from './types';

export function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  try {
    const serialized = JSON.stringify(content);
    return serialized ?? String(content);
  } catch {
    return String(content);
  }
}

/**
 * Convert VS Code chat messages (newest-first) into CodeBuddy messages
 * (oldest-first, OpenAI semantics).
 */
export function toCodeBuddyMessages(messages: readonly ChatRequestMessage[]): CodeBuddyChatMessage[] {
  // Oldest-first: reverse in place on a copy, never mutate the caller's array.
  const ordered = [...messages].reverse();

  const result: CodeBuddyChatMessage[] = [];

  for (const message of ordered) {
    let text = '';
    const toolCalls: CodeBuddyToolCall[] = [];
    const toolResults: { callId: string; content: string }[] = [];

    for (const part of message.parts) {
      switch (part.kind) {
        case 'text':
          text += part.text;
          break;
        case 'tool-call':
          toolCalls.push({
            id: part.callId,
            type: 'function',
            function: {
              name: part.name,
              // VS Code's `input` is an object; CodeBuddy expects a JSON string.
              arguments: JSON.stringify(part.input ?? {}),
            },
          });
          break;
        case 'tool-result':
          toolResults.push({ callId: part.callId, content: stringifyToolResult(part.content) });
          break;
      }
    }

    // Tool results become standalone `role: "tool"` messages so they can carry
    // their `tool_call_id`. They follow the assistant message in output order
    // because the source list was reversed above.
    for (const toolResult of toolResults) {
      result.push({
        role: 'tool',
        content: toolResult.content,
        tool_call_id: toolResult.callId,
      });
    }

    if (message.role === 'assistant') {
      const assistantMessage: CodeBuddyChatMessage = {
        role: 'assistant',
        content: text === '' ? null : text,
      };
      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls;
      }
      result.push(assistantMessage);
    } else if (text !== '') {
      // A user message that carries only tool results has no user text; it is
      // represented solely by the `role: "tool"` messages above. Empty user
      // messages are meaningless to the upstream API, so they are skipped.
      result.push({
        role: 'user',
        content: text,
      });
    }
  }

  return result;
}

/**
 * Convert VS Code tool definitions into CodeBuddy `tools` payload.
 * Returns undefined when there are no tools (the field is then omitted).
 */
export function toCodeBuddyTools(tools: readonly ChatTool[] | undefined): CodeBuddyToolDefinition[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/**
 * Convert the VS Code tool mode into a CodeBuddy `tool_choice`.
 *
 * `LanguageModelChatToolMode.Auto` (1) → omitted (upstream default is auto);
 * `LanguageModelChatToolMode.Required` (2) → `"required"`.
 */
export function toCodeBuddyToolChoice(toolMode: number | undefined): string | undefined {
  if (toolMode === 2) {
    return 'required';
  }
  return undefined;
}
