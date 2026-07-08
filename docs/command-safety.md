# Command Safety

Projecto runs local commands, so execution must be visible and intentional.

## Current Safety Layer

- Commands are classified as `safe`, `medium`, or `dangerous`.
- First-run approval is stored locally in `command-approvals.json`.
- Dangerous commands require an explicit confirmed run before approval is stored.
- Integrated-log commands can be stopped from the Run Logs panel.

## Risk Examples

- `safe`: `npm run dev`, `pnpm dev`, `cargo run`
- `medium`: `npm install`, `docker compose up`, commands referencing `.env`
- `dangerous`: `rm -rf`, `sudo rm`, `del /s`, `powershell -enc`, `curl | bash`, `git reset --hard`

## Main Files

- `src/main/services/commandSafetyService.ts`
- `src/main/services/launcherService.ts`
- `src/main/services/commandRunner.ts`
- `src/renderer/components/common/ConfirmDialog.tsx`
- `src/renderer/components/common/LogsPanel.tsx`
