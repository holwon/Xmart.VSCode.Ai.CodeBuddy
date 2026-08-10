/**
 * Module augmentation for VS Code proposed Language Model Provider API fields
 * that are not yet present in `@types/vscode` (DefinitelyTyped only ships
 * stable API). These mirror `vscode.proposed.chatProvider.d.ts` and are used
 * to opt into the model-configuration (Thinking Effort) picker.
 *
 * See `.scratch/codebuddy-vscode-provider/research/03-reasoning-effort.md`.
 */
import 'vscode';

declare module 'vscode' {
  /**
   * A property of a model's configuration schema. When `group` is
   * `'navigation'`, the property is shown as a primary action in the model
   * picker (e.g. a "Thinking Effort" selector).
   */
  interface LanguageModelConfigurationSchema {
    readonly properties?: {
      readonly [key: string]: Record<string, unknown> & {
        readonly enumItemLabels?: string[];
        readonly group?: string;
      };
    };
  }

  interface LanguageModelChatInformation {
    /**
     * JSON schema describing per-model configuration the user can set in the
     * model picker. Values flow back to the provider via
     * `ProvideLanguageModelChatResponseOptions.modelConfiguration`.
     * (proposed API)
     */
    configurationSchema?: LanguageModelConfigurationSchema;
  }

  interface ProvideLanguageModelChatResponseOptions {
    /**
     * Values the user configured for this model in the language model
     * configuration file / picker, validated against the model's
     * configurationSchema. (proposed API)
     */
    readonly modelConfiguration?: { readonly [key: string]: any };
  }
}
