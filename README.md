# Projecto

Projecto is a desktop workspace for developers who work across many local projects. It turns ordinary folders into organized developer projects, detects likely stacks, manages launch commands, tracks running terminals, opens detected local app URLs, and syncs project metadata with the hosted Projecto platform.

The desktop app is built with Electron, React, TypeScript, and a context-isolated IPC bridge. It is designed to feel like a practical project control center: import folders, understand what each project is, launch it safely, see logs, stop it cleanly, and keep access aligned with the user's subscription plan.

## Demo Video

Watch the Projecto desktop walkthrough on the hosted website:

[Projecto demo video](https://projecto.adityakosuru.online/#demo)

<a href="https://projecto.adityakosuru.online/#demo">
  <img src="https://projecto.adityakosuru.online/demo/projecto-explanation-poster.jpg" alt="Projecto demo video preview" width="720" />
</a>

Direct video file:

- Hosted website: `https://projecto.adityakosuru.online/demo/projecto-explanation.mp4`
- GitHub release asset: `https://github.com/aditya9515/Projecto/releases/download/v1.0.4/projecto_explaination.mp4`

## Highlights

- Import local project folders with a native Electron directory picker.
- Detect common stacks including Node.js, TypeScript, Next.js, Vite, React, Python, FastAPI, Flask, Rust, Docker, Git, and mixed full-stack workspaces.
- Create and edit reusable launch profiles and project commands.
- Launch projects from the dashboard, project detail page, or command palette.
- Run commands through managed terminal sessions with mirrored logs.
- Parse terminal output for local app URLs and open reachable detected links automatically.
- Track Projecto-owned ports so duplicate launches and cross-project port conflicts can be handled safely.
- Show clear launch states such as Launch, Running, Ready, Stop, Failed, and Locked.
- Stop running projects from the app and clean up mapped terminal sessions.
- Keep project metadata visible during subscription downgrades while locking only features that exceed the Free plan.
- Support offline handling with a full-page reconnect experience.
- Provide update checks and Windows installer metadata through the hosted Projecto website.
- Preview and safely clean old run artifacts, stale write leftovers, verified legacy metadata, and Electron caches without touching projects or credentials.
- Keep the renderer sandboxed behind validated preload APIs and main-process services.

## Product Model

Projecto spans three related pieces:

- `D:\projecto`
  Electron desktop app installed by users.
- `D:\projecto_frontend`
  Hosted website, backend routes, desktop auth exchange, subscription verification, Firestore project metadata, billing flows, download page, and update API.
- `D:\projecto extention`
  VS Code extension workstream for editor-side terminal integration.

The desktop app owns local project discovery, launch behavior, terminal sessions, local command approvals, local settings, logs, and UI state. The hosted website owns account identity, subscription state, desktop session exchange, Firestore-backed project directory records, and public release metadata.

## Subscription Behavior

Projecto treats the backend `free` plan as the desktop Free tier and `pro` as Pro.

Free users can:

- Keep all existing projects visible.
- Run up to the allowed project limit based on deterministic usage ranking.
- Delete projects, including locked projects.
- Continue using core project detection and launch features within the Free limits.

Pro users can:

- Unlock all projects automatically after subscription refresh.
- Use higher project limits.
- Run more advanced workflows.
- Use bulk import and premium workspace capabilities when enabled by the backend plan.

Subscription checks are verified through the hosted backend instead of trusting local UI state.

## Launch And Terminal Flow

Projecto uses a preflight launch path before running commands:

1. Validate the project, launch profile, folder path, command approval, subscription access, and concurrent launch rules.
2. Check whether the project already has an active mapped terminal session.
3. Track Projecto-owned ports and avoid relaunching the same active project.
4. Spawn the command through the main process.
5. Mirror output into Run Logs.
6. Parse URLs and ports from common development server output.
7. Wait for reachable app URLs and open them once.
8. Mark the project as Ready when the app is usable.
9. Stop and clean up the session when the user stops the project.

Projecto never kills unknown external processes that happen to use a port. It only manages ports detected from its own sessions.

## Storage Maintenance

Projecto runs a conservative allowlisted cleanup once per desktop version and
also exposes a preview-and-confirm workflow in Settings. Run artifacts are kept
for 30 days and capped at 250 MB. Active runs, project folders, current settings,
command approvals, subscriptions, browser sessions, credentials, and recovery
backups are always protected.

## Auto Update Flow

The desktop app checks the hosted Projecto website for update metadata. The website returns the latest supported Windows installer version, file name, SHA-256 hash, setup URL, and Squirrel feed URL.

Current desktop build target:

- Version: `1.0.7`
- Installer: `Projecto-1.0.7.Setup.exe`
- Release feed: GitHub Releases
- Windows maker: Squirrel.Windows through Electron Forge

The download page and update API are maintained in `D:\projecto_frontend` and
must be updated when the `1.0.7` artifacts are published.

## Setup

Requirements:

- Node.js 20+
- npm 10+
- Windows for the current packaged installer flow

Install dependencies:

```bash
npm install
```

Start the Electron development app:

```bash
npm start
```

Run validation:

```bash
npm run typecheck
npm test
npm run lint
```

Package the desktop app:

```bash
npm run package
```

Create platform installers:

```bash
npm run make
```

## Environment

Projecto can be pointed at the hosted web app through `BILLING_URL`.

Example:

```bash
BILLING_URL=https://projecto.adityakosuru.online/pricing
```

The desktop app expects the hosted platform to provide:

- Pricing page: `https://projecto.adityakosuru.online/pricing?source=desktop`
- Desktop login page: `https://projecto.adityakosuru.online/desktop-login`
- Desktop auth exchange routes under `/api/desktop/auth/*`
- Subscription verification under `/api/desktop/subscription/verify`
- Project sync routes under `/api/desktop/projects/*`
- Update checks under `/api/desktop/update/check`
- Custom protocol callback: `projecto://auth/callback?code=TEMPORARY_CODE&state=TEMPORARY_STATE`

## Major Code Areas

- App bootstrap and lifecycle: [src/main/index.ts](/D:/projecto/src/main/index.ts), [src/main/windows.ts](/D:/projecto/src/main/windows.ts)
- IPC handlers: [src/main/ipc](/D:/projecto/src/main/ipc)
- Preload bridge: [src/preload/index.ts](/D:/projecto/src/preload/index.ts)
- Project storage and sync: [src/main/services/projectStore.ts](/D:/projecto/src/main/services/projectStore.ts)
- Project scanning and detection: [src/main/services/projectScanner.ts](/D:/projecto/src/main/services/projectScanner.ts), [src/main/services/projectDetector.ts](/D:/projecto/src/main/services/projectDetector.ts)
- Launch orchestration: [src/main/services/launcherService.ts](/D:/projecto/src/main/services/launcherService.ts)
- Command execution: [src/main/services/commandRunner.ts](/D:/projecto/src/main/services/commandRunner.ts)
- Terminal session persistence: [src/main/services/terminalSessionStore.ts](/D:/projecto/src/main/services/terminalSessionStore.ts)
- Terminal output parsing: [src/main/services/launchOutputParser.ts](/D:/projecto/src/main/services/launchOutputParser.ts)
- Command safety: [src/main/services/commandSafetyService.ts](/D:/projecto/src/main/services/commandSafetyService.ts)
- Subscription verification: [src/main/services/subscriptionService.ts](/D:/projecto/src/main/services/subscriptionService.ts)
- Settings storage: [src/main/services/settingsStore.ts](/D:/projecto/src/main/services/settingsStore.ts)
- Auto update service: [src/main/services/updateService.ts](/D:/projecto/src/main/services/updateService.ts)
- Renderer app shell: [src/renderer/App.tsx](/D:/projecto/src/renderer/App.tsx)
- Renderer routes: [src/renderer/routes](/D:/projecto/src/renderer/routes)
- Renderer state stores: [src/renderer/store](/D:/projecto/src/renderer/store)
- Shared launch helpers: [src/shared](/D:/projecto/src/shared)
- Visual system: [src/renderer/styles/index.css](/D:/projecto/src/renderer/styles/index.css)

## Security Notes

- `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- Browser window sandboxing is enabled.
- The renderer has no direct filesystem or child-process access.
- IPC inputs are validated in the main process.
- Commands are executed only from the main process.
- Project source code is not uploaded by the desktop app.
- Command approval and command risk decisions are stored locally.
- Billing, Firebase admin access, payment webhooks, and Firestore privileged operations stay in the hosted backend.
- Desktop sessions are restored and re-verified instead of trusting browser state directly.
- Projecto only manages processes and ports it started or detected from its own terminal sessions.

## Manual Pro Overrides

Manual developer subscription overrides are managed from the backend repo, not from the Electron app.

Use the helper in `D:\projecto_frontend`:

```bash
npm run admin:subscription-override -- --action grant --email user@example.com --billingCycle yearly --reason "support grant" --updatedBy "your-name"
```

Remove an override:

```bash
npm run admin:subscription-override -- --action delete --email user@example.com --updatedBy "your-name"
```

Effective access resolves in this order:

1. Active manual override
2. Active paid subscription
3. Free fallback

## Production Checklist

Before shipping a new desktop release:

```bash
npm run typecheck
npm test
npm run lint
npm run make
```

Then:

1. Create a versioned GitHub Release.
2. Upload the Windows installer, full nupkg, and `RELEASES` file.
3. Update the website desktop update metadata in `D:\projecto_frontend`.
4. Run website typecheck, tests, lint, and build.
5. Deploy the website rollout.
6. Verify the public download page and update API.

## Documentation

- Desktop-extension bridge: [docs/desktop-extension-bridge.md](/D:/projecto/docs/desktop-extension-bridge.md)
- Command safety: [docs/command-safety.md](/D:/projecto/docs/command-safety.md)
- Release checklist: [docs/release-checklist.md](/D:/projecto/docs/release-checklist.md)

## Future Work

- Deeper VS Code extension integration for editor-side terminal control.
- Per-project environment variable presets.
- Searchable run history.
- Better monorepo and nested workspace detection.
- Rich project notes and markdown previews.
- Cross-device sync for selected local sidecar data.
