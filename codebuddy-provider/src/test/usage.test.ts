// Path: codebuddy-provider/src/test/usage.test.ts
import { describe, expect, it } from 'vitest';
import { aggregateRequestUsage, parseCodeBuddyUsage, TokenUsage } from '../codebuddy/usage';

describe('parseCodeBuddyUsage', () => {
  it('parses OpenAI-style field names', () => {
    const usage = parseCodeBuddyUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    });
    expect(usage).toEqual<TokenUsage>({ input: 100, output: 20, cached: 0, reasoning: 0 });
  });

  it('parses Anthropic-style field names', () => {
    const usage = parseCodeBuddyUsage({
      input_tokens: 150,
      output_tokens: 30,
    });
    expect(usage).toEqual<TokenUsage>({ input: 150, output: 30, cached: 0, reasoning: 0 });
  });

  it('prefers OpenAI names when both are present', () => {
    const usage = parseCodeBuddyUsage({
      prompt_tokens: 100,
      input_tokens: 150,
      completion_tokens: 20,
      output_tokens: 30,
    });
    expect(usage.input).toBe(100);
    expect(usage.output).toBe(20);
  });

  it('parses cached token details', () => {
    const usage = parseCodeBuddyUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      input_tokens_details: { cached_tokens: 40 },
    });
    expect(usage.cached).toBe(40);
  });

  it('parses reasoning token details', () => {
    const usage = parseCodeBuddyUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      output_tokens_details: { reasoning_tokens: 8 },
    });
    expect(usage.reasoning).toBe(8);
  });

  it('handles the full CodeBuddy shape', () => {
    const usage = parseCodeBuddyUsage({
      input_tokens: 200,
      output_tokens: 50,
      input_tokens_details: { cached_tokens: 60 },
      output_tokens_details: { reasoning_tokens: 12 },
    });
    expect(usage).toEqual<TokenUsage>({ input: 200, output: 50, cached: 60, reasoning: 12 });
  });

  it('returns zeros for missing usage object', () => {
    expect(parseCodeBuddyUsage(undefined)).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
    expect(parseCodeBuddyUsage(null)).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
  });

  it('returns zeros for non-object input', () => {
    expect(parseCodeBuddyUsage('nope' as unknown)).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
    expect(parseCodeBuddyUsage(42 as unknown)).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
  });

  it('ignores non-finite or negative token counts', () => {
    const usage = parseCodeBuddyUsage({
      prompt_tokens: '100' as unknown,
      completion_tokens: -5,
      input_tokens_details: { cached_tokens: 'x' },
    });
    expect(usage).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
  });
});

describe('aggregateRequestUsage', () => {
  it('returns the single chunk usage when one chunk carries it', () => {
    const usage = aggregateRequestUsage([{ prompt_tokens: 100, completion_tokens: 20 }]);
    expect(usage).toEqual<TokenUsage>({ input: 100, output: 20, cached: 0, reasoning: 0 });
  });

  it('dedups repeated usage across multiple chunks (counts once)', () => {
    const usage = aggregateRequestUsage([
      { prompt_tokens: 100, completion_tokens: 20 },
      { prompt_tokens: 100, completion_tokens: 20 },
      { prompt_tokens: 100, completion_tokens: 20 },
    ]);
    expect(usage).toEqual<TokenUsage>({ input: 100, output: 20, cached: 0, reasoning: 0 });
  });

  it('uses the first non-empty chunk when earlier chunks carry no usage', () => {
    const usage = aggregateRequestUsage([{}, { prompt_tokens: 50, completion_tokens: 5 }]);
    expect(usage).toEqual<TokenUsage>({ input: 50, output: 5, cached: 0, reasoning: 0 });
  });

  it('returns all-zero when no chunk carries usage', () => {
    expect(aggregateRequestUsage([])).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
    expect(aggregateRequestUsage([{}, undefined, null])).toEqual<TokenUsage>({
      input: 0,
      output: 0,
      cached: 0,
      reasoning: 0,
    });
  });

  it('degrades malformed payloads safely', () => {
    const usage = aggregateRequestUsage([
      { prompt_tokens: 'nope' as unknown, completion_tokens: -1 },
      'garbage' as unknown,
    ]);
    expect(usage).toEqual<TokenUsage>({ input: 0, output: 0, cached: 0, reasoning: 0 });
  });
});
