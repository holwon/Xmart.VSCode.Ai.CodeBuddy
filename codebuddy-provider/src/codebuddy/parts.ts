/**
 * Shared part-dispatch logic: identify VS Code message parts by duck typing
 * and extract their text, independent of the vscode module.
 *
 * Why duck typing: match on shape rather than class identity as a
 * cross-version defensive measure (the vscode classes are not minified in the
 * extension host, but relying on shape keeps this robust to API churn). Matching on shape (a `value`
 * string, a `callId`+`name` pair, a `callId`+array `content`) is a defensive
 * cross-version fallback.
 *
 * Pure module (no vscode dependency) so the dispatch is unit-testable.
 */

/**
 * A part of a chat message, in the light representation used by the
 * conversion layer. Mirrors the union of vscode part classes.
 */
export type DispatchedPart =
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; callId: string; name: string; input: object }
  | { kind: 'tool-result'; callId: string; content: unknown };

/** Shape-checked view of an unknown part object. */
interface PartLike {
  callId?: unknown;
  name?: unknown;
  input?: unknown;
  content?: unknown;
  value?: unknown;
}

/**
 * Dispatch a single unknown part to a light `DispatchedPart`, or `null` when
 * the part is not recognised (callers decide how to skip it).
 */
export function dispatchPart(item: unknown): DispatchedPart | null {
  if (typeof item === 'string') {
    return item === '' ? null : { kind: 'text', text: item };
  }
  if (item === null || typeof item !== 'object') {
    return null;
  }

  const obj = item as PartLike;

  // Tool call: callId + name (+ input object).
  if (typeof obj.callId === 'string' && typeof obj.name === 'string') {
    return {
      kind: 'tool-call',
      callId: obj.callId,
      name: obj.name,
      input: (obj.input as object) ?? {},
    };
  }

  // Tool result: callId + array content.
  if (typeof obj.callId === 'string' && Array.isArray(obj.content)) {
    return { kind: 'tool-result', callId: obj.callId, content: flattenPartArray(obj.content) };
  }

  // Text-like part (TextPart, thinking parts, …): a string `value`.
  if (typeof obj.value === 'string') {
    return obj.value === '' ? null : { kind: 'text', text: obj.value };
  }

  return null;
}

/**
 * Flatten an array of part content (e.g. `LanguageModelToolResultPart.content`)
 * into a single plain string: strings pass through, text-like parts yield
 * their `value`, other objects are JSON-serialised, and entries are joined
 * with newlines.
 */
export function flattenPartArray(content: readonly unknown[]): string {
  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        const value = (item as PartLike).value;
        if (typeof value === 'string') {
          return value;
        }
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join('\n');
}

/**
 * Best-effort textual rendering of a single part for token counting:
 * strings as-is, text parts by value, tool calls as `name(input-json)`,
 * tool results by flattened content. Unknown parts render as empty.
 */
export function renderPartForTokens(item: unknown): string {
  const dispatched = dispatchPart(item);
  if (dispatched === null) {
    return '';
  }
  switch (dispatched.kind) {
    case 'text':
      return dispatched.text;
    case 'tool-call':
      return `${dispatched.name}(${JSON.stringify(dispatched.input)})`;
    case 'tool-result':
      return String(dispatched.content);
  }
}
