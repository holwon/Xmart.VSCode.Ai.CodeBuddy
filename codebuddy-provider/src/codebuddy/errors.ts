/**
 * Error-code mapping for CodeBuddy API failures.
 *
 * CodeBuddy wraps failures in a `{ code, msg }` envelope and may also surface
 * them over HTTP status codes. Different failure modes deserve different
 * user-facing messages:
 *
 * - 401 / 403        → authentication failure ("token invalid / no permission")
 * - 11217 ("login ing") → the account is mid-login (distinct from a bad token)
 * - 404              → the model was not found
 * - anything else    → generic upstream failure
 *
 * Pure module (no vscode dependency): it maps a `CodeBuddyApiError` to a
 * plain description the provider can turn into a `LanguageModelError`.
 */

import { CodeBuddyApiError } from './client';

/** CodeBuddy code returned while the account login flow is still in progress. */
export const CODE_LOGIN_IN_PROGRESS = 11217;

export interface ErrorMapping {
  /** Stable category the provider maps to a LanguageModelError factory. */
  kind: 'no-permissions' | 'not-found' | 'unknown';
  /** Human-readable message shown to the user. */
  message: string;
}

/**
 * Map a CodeBuddy API error to a user-facing category and message.
 */
export function mapCodeBuddyError(error: CodeBuddyApiError): ErrorMapping {
  if (error.code === CODE_LOGIN_IN_PROGRESS) {
    return {
      kind: 'no-permissions',
      message: 'CodeBuddy login is still in progress. Please complete login and retry.',
    };
  }
  if (error.httpStatus === 401 || error.httpStatus === 403) {
    return {
      kind: 'no-permissions',
      message: 'CodeBuddy authentication failed. Check your "codebuddy.accessToken" configuration.',
    };
  }
  if (error.httpStatus === 404) {
    return {
      kind: 'not-found',
      message: `CodeBuddy model not found: ${error.msg}`,
    };
  }
  return {
    kind: 'unknown',
    message: `CodeBuddy request failed: ${error.msg}`,
  };
}
