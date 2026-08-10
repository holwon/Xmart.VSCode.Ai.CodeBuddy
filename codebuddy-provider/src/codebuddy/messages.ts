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
 *
 * Tool results are **matched by callId** against the assistant tool calls
 * seen so far, and only emitted as `role: "tool"` messages when their callId
 * corresponds to an outstanding assistant call. VS Code interleaves tool
 * results across user messages in ways that do not always align 1:1 with the
 * preceding assistant message, so a naive positional pass produces invalid
 * sequences (`tool` without a preceding `assistant` call, or two `tool`
 * messages for one call) that CodeBuddy rejects with `code 11133`. Any tool
 * result that cannot be matched is folded into the user text instead.
 */
export function toCodeBuddyMessages(messages: readonly ChatRequestMessage[]): CodeBuddyChatMessage[] {
  const result: CodeBuddyChatMessage[] = [];
  // callIds of assistant tool calls that have been sent but not yet answered.
  const pendingToolCallIds = new Set<string>();

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

    if (message.role === 'assistant') {
      const assistantMessage: CodeBuddyChatMessage = {
        role: 'assistant',
        content: text === '' ? null : text,
      };
      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls;
        for (const call of toolCalls) {
          pendingToolCallIds.add(call.id);
        }
      }
      result.push(assistantMessage);
    } else {
      // user message: emit tool results only for outstanding assistant calls,
      // in encounter order; fold anything unmatched back into the user text.
      const matchedCallIds = new Set<string>();
      for (const toolResult of toolResults) {
        if (pendingToolCallIds.has(toolResult.callId)) {
          pendingToolCallIds.delete(toolResult.callId);
          matchedCallIds.add(toolResult.callId);
          result.push({
            role: 'tool',
            content: toolResult.content,
            tool_call_id: toolResult.callId,
          });
        }
      }
      const unmatched = toolResults.filter((tr) => !matchedCallIds.has(tr.callId));
      if (unmatched.length > 0) {
        const folded = unmatched.map((tr) => `[tool result ${tr.callId}]\n${tr.content}`).join('\n');
        text = text === '' ? folded : `${folded}\n\n${text}`;
      }
      if (text !== '') {
        result.push({ role: 'user', content: text });
      }
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
