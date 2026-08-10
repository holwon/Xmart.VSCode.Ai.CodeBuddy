import { describe, expect, it } from 'vitest';
import { CodeBuddyApiError } from '../codebuddy/client';
import { CODE_LOGIN_IN_PROGRESS, mapCodeBuddyError } from '../codebuddy/errors';

describe('mapCodeBuddyError', () => {
  it('maps 401 to no-permissions with a token message', () => {
    const mapping = mapCodeBuddyError(new CodeBuddyApiError(-1, 'unauthorized', 401));
    expect(mapping.kind).toBe('no-permissions');
    expect(mapping.message).toContain('accessToken');
  });

  it('maps 403 to no-permissions', () => {
    const mapping = mapCodeBuddyError(new CodeBuddyApiError(-1, 'forbidden', 403));
    expect(mapping.kind).toBe('no-permissions');
  });

  it('maps 11217 (login in progress) separately from a bad token', () => {
    const mapping = mapCodeBuddyError(new CodeBuddyApiError(CODE_LOGIN_IN_PROGRESS, 'login ing'));
    expect(mapping.kind).toBe('no-permissions');
    expect(mapping.message).toContain('login is still in progress');
    expect(mapping.message).not.toContain('accessToken');
  });

  it('maps 404 to not-found', () => {
    const mapping = mapCodeBuddyError(new CodeBuddyApiError(-1, 'model missing', 404));
    expect(mapping.kind).toBe('not-found');
    expect(mapping.message).toContain('model not found');
  });

  it('maps anything else to unknown', () => {
    const mapping = mapCodeBuddyError(new CodeBuddyApiError(11133, 'invalid request parameters'));
    expect(mapping.kind).toBe('unknown');
    expect(mapping.message).toContain('invalid request parameters');
  });

  it('lets 11217 win even when an HTTP 401 is also present', () => {
    const mapping = mapCodeBuddyError(new CodeBuddyApiError(CODE_LOGIN_IN_PROGRESS, 'login ing', 401));
    expect(mapping.kind).toBe('no-permissions');
    expect(mapping.message).toContain('login is still in progress');
    expect(mapping.message).not.toContain('accessToken');
  });

  it('accepts duck-typed error objects (not just CodeBuddyApiError)', () => {
    const mapping = mapCodeBuddyError({ code: 11133, msg: 'bad', httpStatus: 400 });
    expect(mapping.kind).toBe('unknown');
    expect(mapping.message).toContain('bad');
  });

  it('falls back to code when msg is missing on an unknown error', () => {
    const mapping = mapCodeBuddyError({ code: 999, httpStatus: 500 });
    expect(mapping.kind).toBe('unknown');
    expect(mapping.message).toContain('999');
  });

  it('falls back to unknown error when everything is empty', () => {
    const mapping = mapCodeBuddyError({});
    expect(mapping.kind).toBe('unknown');
    expect(mapping.message).toContain('unknown error');
  });

  it('treats an empty-string msg as missing', () => {
    const mapping = mapCodeBuddyError({ msg: '', httpStatus: 500 });
    expect(mapping.kind).toBe('unknown');
    expect(mapping.message).toContain('unknown error');
  });
});
