/**
 * Empty-response detection for CodeBuddy streamed responses.
 *
 * A streamed response is considered "empty" when it ends without producing
 * any user-visible output — neither text content nor tool calls. CodeBuddy
 * occasionally returns such streams (truncated or anomalous upstream
 * responses); silently completing them makes VS Code surface a confusing
 * "Response contained no choices" error instead of a meaningful one.
 *
 * This module is pure (no vscode dependency) so the decision is unit-testable;
 * the provider calls it when the stream finishes.
 */

/** Aggregate counters tracked across a single streamed response. */
export interface StreamSummary {
  /** Number of SSE events received. */
  eventCount: number;
  /** Total characters of text content reported. */
  contentChars: number;
  /** Number of tool-call fragments accumulated. */
  toolCallCount: number;
}

/**
 * Decide whether a completed stream produced any output at all.
 *
 * A stream is empty when no events arrived at all, or when events arrived but
 * produced neither text content nor tool calls.
 */
export function isStreamEmpty(summary: StreamSummary): boolean {
  if (summary.eventCount === 0) {
    return true;
  }
  return summary.contentChars === 0 && summary.toolCallCount === 0;
}

/** Human-readable description of an empty stream, for the provider's error. */
export function describeEmptyStream(summary: StreamSummary): string {
  return `CodeBuddy returned an empty response (events=${summary.eventCount}, ` +
    `contentChars=${summary.contentChars}, toolCalls=${summary.toolCallCount}). ` +
    'Please retry; if this persists, the upstream service may be degraded.';
}
