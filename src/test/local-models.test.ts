// Path: codebuddy-provider/src/test/local-models.test.ts
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  LocalModelsFs,
  parseModelsFile,
  projectModelsPath,
  readLocalModelsConfig,
  userModelsPath,
} from '../codebuddy/local-models';

/** In-memory fake fs so no real disk is touched. */
class FakeFs implements LocalModelsFs {
  files = new Map<string, string>();
  existsSync(filePath: string): boolean {
    return this.files.has(filePath);
  }
  readFileSync(filePath: string): string {
    return this.files.get(filePath) ?? '';
  }
}

// Platform-aware paths (path.join uses the host separator).
const USER_DIR = path.join('home', 'user');
const PROJ_DIR = path.join('repo');
const USER_PATH = path.join(USER_DIR, '.codebuddy', 'models.json');
const PROJ_PATH = path.join(PROJ_DIR, '.codebuddy', 'models.json');

describe('parseModelsFile', () => {
  it('returns an empty map when the file is missing', () => {
    const fsImpl = new FakeFs();
    expect(parseModelsFile(USER_PATH, fsImpl).size).toBe(0);
  });

  it('returns an empty map when JSON is malformed', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(USER_PATH, '{ not valid json');
    expect(parseModelsFile(USER_PATH, fsImpl).size).toBe(0);
  });

  it('parses a bare array of models', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(USER_PATH, JSON.stringify([{ id: 'm1', name: 'M1', maxInputTokens: 1000 }]));
    const patches = parseModelsFile(USER_PATH, fsImpl);
    expect(patches.size).toBe(1);
    expect(patches.get('m1')).toEqual({ id: 'm1', name: 'M1', maxInputTokens: 1000 });
  });

  it('parses an object with a models array', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(USER_PATH, JSON.stringify({ models: [{ id: 'm1' }] }));
    const patches = parseModelsFile(USER_PATH, fsImpl);
    expect(patches.get('m1')).toEqual({ id: 'm1' });
  });

  it('ignores BYOK fields (url/apiKey/vendor/temperature/relatedModels)', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(
      USER_PATH,
      JSON.stringify([
        {
          id: 'm1',
          name: 'M1',
          url: 'https://x/chat/completions',
          apiKey: 'sk-xxx',
          vendor: 'acme',
          temperature: 0.7,
          relatedModels: { reasoning: 'm1-r' },
          supportsToolCall: true,
        },
      ]),
    );
    const patches = parseModelsFile(USER_PATH, fsImpl);
    expect(patches.get('m1')).toEqual({ id: 'm1', name: 'M1', supportsToolCall: true });
  });

  it('drops entries without a string id', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(USER_PATH, JSON.stringify([{ name: 'no-id' }, { id: 42 }, { id: '' }]));
    expect(parseModelsFile(USER_PATH, fsImpl).size).toBe(0);
  });

  it('only keeps boolean/valid-number fields', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(
      USER_PATH,
      JSON.stringify([
        {
          id: 'm1',
          supportsToolCall: 'yes',
          supportsImages: false,
          maxInputTokens: 5000,
          maxOutputTokens: 'many',
        },
      ]),
    );
    const patches = parseModelsFile(USER_PATH, fsImpl);
    expect(patches.get('m1')).toEqual({ id: 'm1', supportsImages: false, maxInputTokens: 5000 });
  });
});

describe('readLocalModelsConfig', () => {
  it('returns user and project maps', () => {
    const fsImpl = new FakeFs();
    fsImpl.files.set(USER_PATH, JSON.stringify([{ id: 'a', name: 'A-user' }, { id: 'b' }]));
    fsImpl.files.set(PROJ_PATH, JSON.stringify([{ id: 'a', name: 'A-proj' }, { id: 'c' }]));

    const config = readLocalModelsConfig({ homedir: USER_DIR, cwd: PROJ_DIR, fsImpl });

    expect(config.user.size).toBe(2);
    expect(config.project.size).toBe(2);
  });

  it('is safe when both files are missing', () => {
    const fsImpl = new FakeFs();
    const config = readLocalModelsConfig({ homedir: USER_DIR, cwd: PROJ_DIR, fsImpl });
    expect(config.user.size).toBe(0);
    expect(config.project.size).toBe(0);
  });
});

describe('path resolution', () => {
  it('builds the user models path under the homedir', () => {
    expect(userModelsPath(USER_DIR)).toBe(path.join(USER_DIR, '.codebuddy', 'models.json'));
  });
  it('builds the project models path under the cwd', () => {
    expect(projectModelsPath(PROJ_DIR)).toBe(path.join(PROJ_DIR, '.codebuddy', 'models.json'));
  });
});
