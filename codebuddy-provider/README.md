# CodeBuddy Model Provider

Register CodeBuddy (Tencent) models as a VS Code language model provider, usable directly inside **Copilot Chat / Agent** — keeping the Copilot UI while driving CodeBuddy's cloud models.

## Features

- Registers CodeBuddy models in the Copilot model picker (Manage Models / chat input)
- Supports **agent mode** (tool calling) for models that support it
- Streaming responses, conversation context managed by VS Code
- No external proxy process needed — this extension replaces the standalone `腾讯CodeBuddy-proxy.js` HTTP proxy

## Requirements

- VS Code **1.125 or newer** (the `engines` field enforces this at install time; the model-configuration picker needs 1.126+)
- GitHub Copilot Chat extension installed (the chat UI)
- A CodeBuddy access token (created in the CodeBuddy console/backend)

> Note: the extension declares the `chatProvider` API proposal for the model-configuration (Thinking Effort) picker. If the Thinking Effort selector does not appear in the model picker, relaunch VS Code with `--enable-proposed-api=local.codebuddy-provider`.

## Configuration

Open VS Code settings (User or Workspace) and set:

| Setting | Description |
|---|---|
| `codebuddy.accessToken` | Your CodeBuddy access token (stored securely). Required. |
| `codebuddy.userId` | Your CodeBuddy account uid (optional — when empty the `X-No-User-Id: 1` fallback is used). |

```json
{
  "codebuddy.accessToken": "ck_...",
  "codebuddy.userId": ""
}
```

## Usage

1. Install the extension (and reload VS Code).
2. Open **Copilot Chat**.
3. Pick a model from the **CodeBuddy (Tencent)** group in the model picker (e.g. DeepSeek V4 Pro).
4. Chat. Agent mode is available for models with tool calling enabled.

## Available models

DeepSeek V4 Pro/Flash · GLM-5.2 / 5.1 / 5V Turbo · Kimi K2.7 · MiniMax M3 · Hunyuan 3 (hy3 / hy3-preview / hy3-preview-agent)

## How it works

The extension implements the stable `vscode.lm.registerLanguageModelChatProvider` API and translates the VS Code chat/tool protocol to CodeBuddy's OpenAI-compatible streaming endpoint (`copilot.tencent.com/v2/chat/completions`). All protocol quirks (empty `finish_reason`, `tool_calls: []`, `reasoning_content`, `{code,msg}` error envelopes, `X-User-Id` auth) are handled internally.

## License

MIT
