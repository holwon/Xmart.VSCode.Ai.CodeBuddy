/**
 * DTO conversion: CodeBuddy chunk shape → OpenAI-standard chunk shape.
 *
 * The existing standalone proxy (`腾讯CodeBuddy-proxy.js`) did this conversion
 * on the wire; this module is the in-process port of that logic. Every
 * conversion below is documented in the proxy's header diff table and verified
 * against community reverse-engineering (see
 * `.scratch/codebuddy-vscode-provider/research/02-codebuddy-api-protocol.md`).
 *
 * CodeBuddy quirks handled here:
 * - `finish_reason` is `""` while streaming, not `null` → normalize to `null`
 * - `delta.tool_calls` is always `[]` when no tool is invoked → drop the field
 * - `delta.function_call`, `delta.refusal`, `delta.extra_fields`,
 *   `choice.logprobs: null`, `usage: null` are empty noise → drop
 * - `delta.reasoning_content` is a DeepSeek extension (thinking). It is
 *   passed through in the converted DTO and reported by the provider as a
 *   `LanguageModelThinkingPart` (see `provider.ts`).
 */

const VALID_FINISH_REASONS = new Set<string | null>(['stop', 'tool_calls', 'length', 'content_filter', null]);

export function convertDelta(cbDelta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!cbDelta) {
    return {};
  }

  const result: Record<string, unknown> = {};

  // content: core text, pass through verbatim.
  if (cbDelta.content !== undefined && cbDelta.content !== null) {
    result.content = cbDelta.content;
  }

  // role: carried on the first chunk only.
  if (cbDelta.role !== undefined && cbDelta.role !== null) {
    result.role = cbDelta.role;
  }

  // tool_calls: CodeBuddy always sends [] when idle → drop empty arrays,
  // pass through real tool-call fragments untouched (VS Code accumulates them).
  if (Array.isArray(cbDelta.tool_calls) && cbDelta.tool_calls.length > 0) {
    result.tool_calls = cbDelta.tool_calls;
  }

  // reasoning_content: DeepSeek thinking stream. Passed through and reported
  // by the provider as a LanguageModelThinkingPart (proposed API).
  if (cbDelta.reasoning_content !== undefined && cbDelta.reasoning_content !== null) {
    result.reasoning_content = cbDelta.reasoning_content;
  }

  // function_call / refusal / extra_fields: legacy or non-standard noise → dropped.
  return result;
}

export function convertChoice(cbChoice: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { index: cbChoice.index ?? 0 };

  if (cbChoice.delta && typeof cbChoice.delta === 'object') {
    result.delta = convertDelta(cbChoice.delta as Record<string, unknown>);
  }

  if (cbChoice.message && typeof cbChoice.message === 'object') {
    const msg = cbChoice.message as Record<string, unknown>;
    result.message = {
      role: msg.role ?? 'assistant',
      content: msg.content ?? null,
    };
  }

  const finishReason = cbChoice.finish_reason;
  if (VALID_FINISH_REASONS.has(finishReason as string | null)) {
    result.finish_reason = finishReason;
  } else {
    // "" (in-progress) and any unknown value → null, the OpenAI in-progress marker.
    result.finish_reason = null;
  }

  if (cbChoice.logprobs != null) {
    result.logprobs = cbChoice.logprobs;
  }

  return result;
}

export function convertResponse(cbData: unknown): unknown {
  if (typeof cbData !== 'object' || cbData === null) {
    return cbData;
  }

  const src = cbData as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of ['id', 'model', 'object', 'created'] as const) {
    if (src[key] !== undefined) {
      result[key] = src[key];
    }
  }

  if (Array.isArray(src.choices)) {
    result.choices = src.choices.map((choice) => convertChoice(choice as Record<string, unknown>));
  }

  if (src.usage != null) {
    result.usage = src.usage;
  }

  return result;
}

/**
 * CodeBuddy wraps API failures in a `{ code, msg, data }` envelope where
 * `code !== 0` means failure. Returns the error, or null when the payload is
 * not a CodeBuddy error envelope (or the request succeeded).
 */
export function detectCodeBuddyError(payload: unknown): { code: number; msg: string } | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.code === 'number' && p.code !== 0) {
    return { code: p.code, msg: typeof p.msg === 'string' ? p.msg : String(p.msg ?? '') };
  }
  return null;
}
