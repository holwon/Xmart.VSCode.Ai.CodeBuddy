/**
 * Extension entry point.
 *
 * Activation is `onStartupFinished`, which is enough for a local, always-on
 * provider: the model list is registered once at startup and Copilot Chat
 * picks it up without restart.
 */

import * as vscode from 'vscode';
import { disposeLog, registerCodeBuddyProvider } from './provider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(registerCodeBuddyProvider());
  console.log('[codebuddy-provider] registered CodeBuddy language model provider');
}

export function deactivate(): void {
  disposeLog();
}
