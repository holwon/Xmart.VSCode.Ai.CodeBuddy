import { describe, expect, it } from 'vitest';
import { convertChoice, convertDelta, convertResponse, detectCodeBuddyError } from '../codebuddy/dto';

describe('convertDelta', () => {
  it('passes through content and role', () => {
    expect(convertDelta({ role: 'assistant', content: 'hello' })).toEqual({
      role: 'assistant',
      content: 'hello',
    });
  });

  it('drops the empty tool_calls array (CodeBuddy always sends [])', () => {
    expect(convertDelta({ tool_calls: [] })).toEqual({});
  });

  it('passes through non-empty tool_calls fragments', () => {
    const fragment = {
      tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"a"' } }],
    };
    expect(convertDelta(fragment)).toEqual(fragment);
  });

  it('drops function_call, refusal and extra_fields noise', () => {
    expect(
      convertDelta({ function_call: null, refusal: '', extra_fields: null, content: 'x' }),
    ).toEqual({ content: 'x' });
  });

  it('preserves reasoning_content (DeepSeek thinking extension)', () => {
    expect(convertDelta({ reasoning_content: 'thinking...', content: 'answer' })).toEqual({
      reasoning_content: 'thinking...',
      content: 'answer',
    });
  });

  it('returns an empty object for undefined input', () => {
    expect(convertDelta(undefined)).toEqual({});
  });
});

describe('convertChoice', () => {
  it('normalizes the in-progress empty-string finish_reason to null', () => {
    const choice = convertChoice({ index: 0, delta: { content: 'a' }, finish_reason: '' });
    expect(choice.finish_reason).toBeNull();
  });

  it('passes through a valid terminal finish_reason', () => {
    expect(convertChoice({ index: 0, delta: { content: 'a' }, finish_reason: 'stop' }).finish_reason).toBe('stop');
    expect(convertChoice({ index: 0, delta: { content: 'a' }, finish_reason: 'tool_calls' }).finish_reason).toBe(
      'tool_calls',
    );
    expect(convertChoice({ index: 0, delta: { content: 'a' }, finish_reason: 'length' }).finish_reason).toBe('length');
  });

  it('treats unknown finish_reason values as in-progress', () => {
    expect(convertChoice({ index: 0, delta: {}, finish_reason: 'weird' }).finish_reason).toBeNull();
  });

  it('drops a null logprobs and keeps a real one', () => {
    expect(convertChoice({ index: 0, delta: {}, logprobs: null })).not.toHaveProperty('logprobs');
    const withLogprobs = convertChoice({ index: 0, delta: {}, logprobs: { tokens: [] } });
    expect(withLogprobs.logprobs).toEqual({ tokens: [] });
  });

  it('defaults the index to 0', () => {
    expect(convertChoice({ delta: {} }).index).toBe(0);
  });
});

describe('convertResponse', () => {
  it('converts top-level fields and choices', () => {
    const converted = convertResponse({
      id: 'x',
      model: 'deepseek-v4-pro',
      object: 'chat.completion.chunk',
      created: 1,
      choices: [{ index: 0, delta: { content: 'hi', tool_calls: [] }, finish_reason: '' }],
    }) as Record<string, unknown>;
    expect(converted.id).toBe('x');
    expect(converted.model).toBe('deepseek-v4-pro');
    const choice = (converted.choices as Record<string, unknown>[])[0];
    expect(choice.finish_reason).toBeNull();
    expect(choice.delta).toEqual({ content: 'hi' });
  });

  it('drops a null usage and keeps a real one', () => {
    expect(convertResponse({ choices: [], usage: null })).not.toHaveProperty('usage');
    expect(convertResponse({ choices: [], usage: { total_tokens: 1 } }).usage).toEqual({ total_tokens: 1 });
  });

  it('passes non-object payloads through untouched', () => {
    expect(convertResponse(null)).toBeNull();
    expect(convertResponse('raw')).toBe('raw');
  });
});

describe('detectCodeBuddyError', () => {
  it('detects a non-zero code envelope', () => {
    expect(detectCodeBuddyError({ code: 11101, msg: 'must stream' })).toEqual({
      code: 11101,
      msg: 'must stream',
    });
  });

  it('returns null for success envelopes and non-envelopes', () => {
    expect(detectCodeBuddyError({ code: 0, msg: 'ok' })).toBeNull();
    expect(detectCodeBuddyError({ error: 'openai style' })).toBeNull();
    expect(detectCodeBuddyError('nope')).toBeNull();
    expect(detectCodeBuddyError(null)).toBeNull();
  });
});
