/**
 * CodeBuddy API wire types, plus light chat-message types that mirror the
 * vscode `LanguageModelChatRequestMessage` structures.
 *
 * The provider layer maps vscode objects onto the light types so that the
 * conversion logic (`messages.ts`) stays free of the vscode module and can be
 * unit-tested without the vscode runtime.
 */

// ─── CodeBuddy wire types (OpenAI-compatible chat/completions) ───

export interface CodeBuddyToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded arguments string (streamed chunks are accumulated by the caller). */
    arguments: string;
  };
}

export interface CodeBuddyChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** `null` is valid for assistant messages that carry only tool_calls. */
  content: string | null;
  tool_calls?: CodeBuddyToolCall[];
  tool_call_id?: string;
}

export interface CodeBuddyToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

// ─── Light chat types (mirror vscode.LanguageModelChatRequestMessage) ───

export type ChatMessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; callId: string; name: string; input: unknown }
  | { kind: 'tool-result'; callId: string; content: unknown };

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  parts: ChatMessagePart[];
}

export interface ChatTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}
