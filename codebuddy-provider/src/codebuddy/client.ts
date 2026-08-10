/**
 * Streaming HTTP client for the CodeBuddy `/v2/chat/completions` endpoint.
 *
 * Authentication and stream-shape facts are from
 * `.scratch/codebuddy-vscode-provider/research/02-codebuddy-api-protocol.md`:
 * - `Authorization: Bearer <token>` and `X-User-Id: <uid>` headers are required
 *   (a missing uid falls back to the community-documented `X-No-User-Id: 1`)
 * - `stream: true` is mandatory — non-streaming requests are rejected with
 *   code 11101 — so this client always streams
 * - the response is standard SSE: `data: {json}` lines, terminated by
 *   `data: [DONE]`
 * - API failures come back in a `{ code, msg, data }` envelope
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { detectCodeBuddyError } from './dto';
import { DONE_MARKER, parseDataLine, SseParser } from './sse';
import { CodeBuddyChatMessage, CodeBuddyToolDefinition } from './types';

export const CODEBUDDY_ENDPOINT = 'https://copilot.tencent.com/v2/chat/completions';

export interface CodeBuddyStreamRequest {
  model: string;
  messages: CodeBuddyChatMessage[];
  tools?: CodeBuddyToolDefinition[];
  tool_choice?: string;
}

export interface CodeBuddyStreamCallbacks {
  /** Called once per complete SSE data event with its parsed JSON payload. */
  onEvent(payload: unknown): void;
  /** Called when the stream ends (`[DONE]` or connection close). */
  onDone(): void;
}

export interface CodeBuddyClientOptions {
  accessToken: string;
  userId?: string;
  endpoint?: string;
}

export class CodeBuddyApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'CodeBuddyApiError';
  }
}

export class CodeBuddyClient {
  constructor(private readonly options: CodeBuddyClientOptions) {}

  /**
   * Stream a chat-completion request. Resolves when the stream completes
   * (including user cancellation via `signal`). Rejects with
   * `CodeBuddyApiError` on non-200 HTTP status or a `{code !== 0}` envelope.
   */
  async stream(
    request: CodeBuddyStreamRequest,
    callbacks: CodeBuddyStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const endpoint = new URL(this.options.endpoint ?? CODEBUDDY_ENDPOINT);
    const body = JSON.stringify({ ...request, stream: true });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      Authorization: `Bearer ${this.options.accessToken}`,
      'X-Requested-With': 'XMLHttpRequest',
      Origin: 'https://www.codebuddy.cn/',
    };
    if (this.options.userId && this.options.userId !== '') {
      headers['X-User-Id'] = this.options.userId;
    } else {
      headers['X-No-User-Id'] = '1';
    }

    const response = await this.sendRequest(endpoint, headers, body, signal);

    if (response.statusCode !== 200) {
      const errorBody = await collectBody(response);
      const parsed = tryParseJson(errorBody);
      const cbError = detectCodeBuddyError(parsed);
      throw new CodeBuddyApiError(
        cbError?.code ?? -1,
        cbError?.msg ?? `CodeBuddy API returned HTTP ${response.statusCode}: ${errorBody.slice(0, 200)}`,
        response.statusCode,
      );
    }

    await this.readSse(response, callbacks, signal);
  }

  private sendRequest(
    url: URL,
    headers: Record<string, string>,
    body: string,
    signal?: AbortSignal,
  ): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const request = https.request(url, { method: 'POST', headers, signal }, (response) => {
        resolve(response);
      });
      request.on('error', reject);
      request.write(body);
      request.end();
    });
  }

  private async readSse(
    response: http.IncomingMessage,
    callbacks: CodeBuddyStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    response.setEncoding('utf8');
    const parser = new SseParser();

    for await (const chunk of response) {
      if (signal?.aborted) {
        response.destroy();
        return;
      }
      for (const line of parser.push(chunk)) {
        this.dispatchLine(line, callbacks);
      }
    }
    for (const line of parser.flush()) {
      this.dispatchLine(line, callbacks);
    }

    if (signal?.aborted) {
      return;
    }
    callbacks.onDone();
  }

  private dispatchLine(line: string, callbacks: CodeBuddyStreamCallbacks): void {
    const payload = parseDataLine(line);
    if (payload === null) {
      return;
    }
    if (payload === DONE_MARKER) {
      callbacks.onDone();
      return;
    }
    const parsed = tryParseJson(payload);
    if (parsed !== undefined) {
      callbacks.onEvent(parsed);
    }
    // Malformed JSON lines are skipped defensively; the stream may still continue.
  }
}

function collectBody(response: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => {
      body += chunk;
    });
    response.on('end', () => resolve(body));
    response.on('error', reject);
  });
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
