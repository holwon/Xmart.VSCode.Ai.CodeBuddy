/**
 * Extension entry point.
 *
 * Activation is `onStartupFinished`, which is enough for a local, always-on
 * provider: the model registry loads lazily on first `provideLanguageModelChatInformation`
 * and Copilot Chat picks it up without restart.
 *
 * The shared `ModelRegistry` is created here so the "CodeBuddy: Refresh Models"
 * command can force a refresh; the provider consumes the same instance.
 */

import * as vscode from 'vscode';
import { createDefaultRegistryDeps, disposeLog, registerCodeBuddyProvider } from './provider';
import { ModelRegistry } from './codebuddy/model-registry';

export function activate(context: vscode.ExtensionContext): void {
  // Create the registry from real (config-driven) deps, sharing it between
  // the provider and the refresh command.
  const registry = new ModelRegistry({ deps: createDefaultRegistryDeps() });

  context.subscriptions.push(registerCodeBuddyProvider(registry));

  context.subscriptions.push(
    vscode.commands.registerCommand('codebuddy.refreshModels', async () => {
      try {
        const models = await registry.refreshNow();
        vscode.window.showInformationMessage(
          `CodeBuddy model list refreshed (${models.length} models).`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `CodeBuddy model refresh failed: ${(error as Error).message ?? String(error)}`,
        );
      }
    }),
  );

  console.log('[codebuddy-provider] registered CodeBuddy language model provider');
}

export function deactivate(): void {
  disposeLog();
}
