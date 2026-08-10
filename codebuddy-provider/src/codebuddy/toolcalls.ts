/**
 * Accumulator for streaming `delta.tool_calls` fragments.
 *
 * CodeBuddy (OpenAI-compatible streaming) sends each tool call split across
 * multiple chunks: the first fragment carries `id` + `function.name`, and
 * `function.arguments` arrives as a string that must be concatenated across
 * subsequent fragments. VS Code's `LanguageModelToolCallPart` needs a complete
 * `{ callId, name, input }` object, so the provider accumulates fragments and
 * only emits complete calls once the stream ends.
 */

export interface ToolCallFragment {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface CompletedToolCall {
  callId: string;
  name: string;
  /** Always an object — VS Code's `LanguageModelToolCallPart` requires one. */
  input: object;
}

export class ToolCallAccumulator {
  private calls = new Map<number, { index: number; id: string; name: string; args: string }>();

  add(fragment: ToolCallFragment): void {
    const index = fragment.index ?? 0;
    const existing = this.calls.get(index) ?? { index, id: '', name: '', args: '' };
    if (fragment.id) {
      existing.id = fragment.id;
    }
    if (fragment.function?.name) {
      existing.name = fragment.function.name;
    }
    if (fragment.function?.arguments) {
      existing.args += fragment.function.arguments;
    }
    this.calls.set(index, existing);
  }

  /**
   * All accumulated tool calls, ordered by stream index. Fragments that never
   * received an `id` or a `name` are dropped. `arguments` (a JSON string) is
   * parsed into an object; unparseable arguments are wrapped as `{ raw }`.
   */
  toParts(): CompletedToolCall[] {
    const parts: CompletedToolCall[] = [];
    const ordered = [...this.calls.values()].sort((a, b) => a.index - b.index);
    for (const call of ordered) {
      if (!call.id || !call.name) {
        continue;
      }
      let input: object = {};
      if (call.args !== '') {
        try {
          const parsed: unknown = JSON.parse(call.args);
          // JSON.parse may yield a string/number/boolean; wrap non-objects so
          // the part always carries an object input.
          input = parsed !== null && typeof parsed === 'object' ? (parsed as object) : { value: parsed };
        } catch {
          input = { raw: call.args };
        }
      }
      parts.push({ callId: call.id, name: call.name, input });
    }
    return parts;
  }

  get size(): number {
    return this.calls.size;
  }
}
