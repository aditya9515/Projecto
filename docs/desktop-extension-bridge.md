# Projecto Desktop Extension Bridge

Projecto Desktop is the local execution plane. The Projecto VS Code extension is the stable way to make editor-terminal execution visible inside VS Code.

## Runtime Flow

1. Desktop starts a localhost-only HTTP bridge on `127.0.0.1`.
2. Desktop writes `bridge-auth.json` into Electron `userData` with a random startup token.
3. The extension reads that local file, authenticates with the token, and registers open workspace paths.
4. When Terminal Strategy is `Editor terminal`, Desktop sends `RUN_COMMAND_IN_EDITOR` events over the bridge stream.
5. The extension uses the VS Code terminal API to create/reveal a terminal and run the saved Projecto command.

## Security Rules

- The bridge binds only to `127.0.0.1`.
- Every endpoint requires the random bridge token.
- The bridge never exposes Firebase, Dodo, or desktop session tokens.
- Extension-triggered runs must map to saved Projecto projects, profiles, or commands.
- Legacy window automation is disabled by default.

## Main Files

- `src/main/services/desktopBridgeService.ts`
- `src/main/services/launcherService.ts`
- `src/main/services/editorService.ts`
- `src/renderer/components/settings/SettingsForm.tsx`
- `D:\projecto extention\extension.js`
- `D:\projecto-protocol\src\index.ts`
