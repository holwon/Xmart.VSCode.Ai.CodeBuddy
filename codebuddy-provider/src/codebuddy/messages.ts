/**
 * Message & tool conversion between the VS Code chat request shape and the
 * CodeBuddy (OpenAI-compatible) request shape.
 *
 * VS Code passes the conversation history to the provider **already in
 * chronological order** (oldest first), with each `role: "tool"` message
 * immediately after the assistant message that made the tool call. That order
 * is exactly what CodeBuddy/OpenAI expects, so messages are forwarded as-is —
 * reordering them (e.g. reversing) makes the upstream API reject the request
 * with `code 11133` ("tool" messages must follow their assistant message).
 *
 * Verified against CodeBuddy `copilot.tencent.com/v2/chat/completions`
 * (HTTP 400 on tool-first sequences) in 2026-08.
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
 * Convert VS Code chat messages into CodeBuddy messages, preserving order.
 */
export function toCodeBuddyMessages(messages: readonly ChatRequestMessage[]): CodeBuddyChatMessage[] {
  const result: CodeBuddyChatMessage[] = [];

  for (const message of messages) {
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
    // their `tool_call_id`. They keep their position relative to the
    // assistant message because the input order is preserved.
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
