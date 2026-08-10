import { describe, expect, it } from 'vitest';
import { describeEmptyStream, isStreamEmpty, StreamSummary } from '../codebuddy/response-guard';

describe('isStreamEmpty', () => {
  it('treats a stream with zero events as empty', () => {
    const summary: StreamSummary = { eventCount: 0, contentChars: 0, toolCallCount: 0 };
    expect(isStreamEmpty(summary)).toBe(true);
  });

  it('treats a stream with text content as non-empty', () => {
    const summary: StreamSummary = { eventCount: 10, contentChars: 100, toolCallCount: 0 };
    expect(isStreamEmpty(summary)).toBe(false);
  });

  it('treats a stream with tool calls as non-empty', () => {
    const summary: StreamSummary = { eventCount: 5, contentChars: 0, toolCallCount: 3 };
    expect(isStreamEmpty(summary)).toBe(false);
  });

  it('treats a mixed stream as non-empty', () => {
    const summary: StreamSummary = { eventCount: 20, contentChars: 50, toolCallCount: 2 };
    expect(isStreamEmpty(summary)).toBe(false);
  });

  it('treats events that produced nothing (no content, no tools) as empty', () => {
    const summary: StreamSummary = { eventCount: 8, contentChars: 0, toolCallCount: 0 };
    expect(isStreamEmpty(summary)).toBe(true);
  });
});

describe('describeEmptyStream', () => {
  it('includes the counters in the message', () => {
    const summary: StreamSummary = { eventCount: 8, contentChars: 0, toolCallCount: 0 };
    const message = describeEmptyStream(summary);
    expect(message).toContain('empty response');
    expect(message).toContain('events=8');
    expect(message).toContain('contentChars=0');
    expect(message).toContain('toolCalls=0');
  });
});
