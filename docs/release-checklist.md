# Projecto Desktop Release Checklist

## Preflight

- Run `npm run lint`
- Run `npm run typecheck`
- Run `npm test`
- Confirm `projecto://` protocol opens packaged builds
- Confirm sign-in opens `https://projecto.adityakosuru.online/desktop-login`
- Confirm subscription verification uses only backend APIs
- Confirm editor-terminal mode requires the Projecto extension unless legacy automation is explicitly enabled

## Packaging

- Windows: `npm run make`, then sign the installer when certificates are available.
- macOS: package, sign, and notarize when Apple credentials are available.
- Linux: build `.deb` and `.rpm`; add AppImage later if needed.

## Manual Smoke

- Sign in from desktop
- Import a project
- Launch in OS Terminal
- Stop a running OS Terminal process from Projecto
- Switch to Editor terminal with extension connected
- Confirm command appears in the editor terminal
- Revoke the desktop session from the web account page
- Confirm desktop verification fails and requires sign-in again
