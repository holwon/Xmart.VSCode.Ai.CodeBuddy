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
});
