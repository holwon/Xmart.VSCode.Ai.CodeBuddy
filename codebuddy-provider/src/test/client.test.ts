import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:https so no real network is involved. The client uses the default
// import interop, so the factory must provide both the module namespace and
// the default export.
vi.mock('node:https', () => ({
  request: vi.fn(),
  default: { request: vi.fn() },
}));

import https from 'node:https';
import { CodeBuddyApiError, CodeBuddyClient } from '../codebuddy/client';

/**
 * A minimal stand-in for `http.IncomingMessage`: EventEmitter + async
 * iterable, fed via `feed()`/`close()` so the client's `for await` loop can
 * consume the staged SSE body.
 */
class FakeResponse extends EventEmitter {
  statusCode = 200;
  private pending: string[] = [];
  private closed = false;

  setEncoding(): void {
    // no-op
  }

  destroy(): void {
    // no-op
  }

  feed(body: string): void {
    this.pending.push(body);
    this.emit('data', body);
  }

  close(): void {
    this.closed = true;
    this.emit('end');
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    let index = 0;
    const self = this;
    return {
      next(): Promise<IteratorResult<string>> {
        if (index < self.pending.length) {
          const value = self.pending[index];
          index += 1;
          return Promise.resolve({ value, done: false });
        }
        if (self.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          const onData = (chunk: string) => {
            cleanup();
            index += 1;
            resolve({ value: chunk, done: false });
          };
          const onEnd = () => {
            cleanup();
            resolve({ value: undefined, done: true });
          };
          const cleanup = () => {
            self.off('data', onData);
            self.off('end', onEnd);
          };
          self.on('data', onData);
          self.on('end', onEnd);
        });
      },
    };
  }
}

/** Make https.request invoke the callback with a response that streams `body`. */
function stageStream(body: string, statusCode = 200): FakeResponse {
  const response = new FakeResponse();
  response.statusCode = statusCode;
  (https.request as ReturnType<typeof vi.fn>).mockImplementation(
    (_url: unknown, _options: unknown, callback: (res: FakeResponse) => void) => {
      callback(response);
      const request = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
      };
      request.write = vi.fn();
      request.end = vi.fn(() => {
        process.nextTick(() => {
          response.feed(body);
          response.close();
        });
      });
      return request;
    },
  );
  return response;
}

function createClient(): CodeBuddyClient {
  return new CodeBuddyClient({ accessToken: 'test-token', userId: 'test-uid' });
}

describe('CodeBuddyClient.stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onDone exactly once when the stream ends with [DONE]', async () => {
    stageStream('data: {"choices":[{"delta":{"content":"hi"}}]}\ndata: [DONE]\n');
    const client = createClient();
    const events: unknown[] = [];
    let doneCount = 0;

    await client.stream(
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
      { onEvent: (p) => events.push(p), onDone: () => doneCount++ },
    );

    expect(doneCount).toBe(1);
    expect(events).toHaveLength(1);
  });

  it('calls onDone exactly once when the connection closes without [DONE]', async () => {
    stageStream('data: {"choices":[{"delta":{"content":"hi"}}]}\n');
    const client = createClient();
    let doneCount = 0;

    await client.stream(
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
      { onEvent: () => undefined, onDone: () => doneCount++ },
    );

    expect(doneCount).toBe(1);
  });

  it('throws CodeBuddyApiError on non-200 with a {code, msg} envelope', async () => {
    stageStream(JSON.stringify({ code: 11101, msg: 'must stream' }), 500);
    const client = createClient();

    await expect(
      client.stream(
        { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
        { onEvent: () => undefined, onDone: () => undefined },
      ),
    ).rejects.toMatchObject({ code: 11101, msg: 'must stream', httpStatus: 500 });
  });

  it('throws CodeBuddyApiError when an error envelope arrives inside the stream', async () => {
    stageStream('data: {"code":11217,"msg":"login ing"}\ndata: [DONE]\n');
    const client = createClient();

    await expect(
      client.stream(
        { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
        { onEvent: () => undefined, onDone: () => undefined },
      ),
    ).rejects.toMatchObject({ code: 11217, msg: 'login ing' });
  });

  it('sends the Bearer token and X-User-Id headers', async () => {
    stageStream('data: [DONE]\n');
    const client = createClient();

    await client.stream(
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
      { onEvent: () => undefined, onDone: () => undefined },
    );

    const mock = https.request as ReturnType<typeof vi.fn>;
    const options = mock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(options.headers['X-User-Id']).toBe('test-uid');
    expect(options.headers['X-No-User-Id']).toBeUndefined();
  });

  it('falls back to X-No-User-Id when no uid is configured', async () => {
    stageStream('data: [DONE]\n');
    const client = new CodeBuddyClient({ accessToken: 'test-token' });

    await client.stream(
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
      { onEvent: () => undefined, onDone: () => undefined },
    );

    const mock = https.request as ReturnType<typeof vi.fn>;
    const options = mock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(options.headers['X-No-User-Id']).toBe('1');
    expect(options.headers['X-User-Id']).toBeUndefined();
  });

  it('always sends stream: true in the request body', async () => {
    stageStream('data: [DONE]\n');
    const client = createClient();

    await client.stream(
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x' }] },
      { onEvent: () => undefined, onDone: () => undefined },
    );

    const mock = https.request as ReturnType<typeof vi.fn>;
    // The body is sent via request.write(body), not as an https.request argument.
    const request = mock.mock.results[0].value as { write: ReturnType<typeof vi.fn> };
    const body = request.write.mock.calls[0][0] as string;
    expect(JSON.parse(body).stream).toBe(true);
  });
});
