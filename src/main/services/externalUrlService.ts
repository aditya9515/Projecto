import { execFile, spawn } from "node:child_process";

import { shell } from "electron";

const LAUNCH_HANDOFF_GRACE_MS = 500;

type WindowsBrowserFamily = "chromium" | "firefox" | "unknown";
type WindowsBrowserProfile = {
  executablePath: string;
  family: WindowsBrowserFamily;
};

function spawnDetached(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    let settled = false;
    let spawned = false;
    const handoffTimer = setTimeout(() => {
      if (settled || !spawned) {
        return;
      }

      settled = true;
      resolve();
    }, LAUNCH_HANDOFF_GRACE_MS);

    child.once("error", (error) => {
      clearTimeout(handoffTimer);

      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });
    child.once("spawn", () => {
      spawned = true;
      child.unref();
    });
    child.once("exit", (code, signal) => {
      clearTimeout(handoffTimer);

      if (settled) {
        return;
      }

      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${executable} exited before opening the browser (code: ${code ?? "unknown"}, signal: ${signal ?? "none"}).`,
        ),
      );
    });
  });
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function formatExternalOpenError(targetUrl: string, errors: unknown[]): Error {
  const details = errors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .filter(Boolean)
    .join(" | ");

  return new Error(
    details.length > 0
      ? `Projecto could not open ${targetUrl} in your default browser. ${details}`
      : `Projecto could not open ${targetUrl} in your default browser.`,
  );
}

function extractRegistryValue(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const match = lines
    .map((line) => line.match(/REG_\w+\s+(.+)$/))
    .find((result) => result?.[1]);

  return match?.[1]?.trim() ?? null;
}

function extractExecutablePath(command: string): string | null {
  const trimmed = command.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith('"')) {
    const closingQuoteIndex = trimmed.indexOf('"', 1);
    return closingQuoteIndex > 1 ? trimmed.slice(1, closingQuoteIndex) : null;
  }

  const [firstToken] = trimmed.split(/\s+/, 1);
  return firstToken ?? null;
}

function classifyWindowsBrowserFamily(
  executablePath: string,
): WindowsBrowserFamily {
  const normalized = executablePath.toLowerCase();

  if (
    normalized.endsWith("chrome.exe") ||
    normalized.endsWith("msedge.exe") ||
    normalized.endsWith("brave.exe") ||
    normalized.endsWith("opera.exe")
  ) {
    return "chromium";
  }

  if (normalized.endsWith("firefox.exe")) {
    return "firefox";
  }

  return "unknown";
}

function execFileText(
  file: string,
  args: string[],
  options?: { windowsHide?: boolean },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options ?? {}, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

export class ExternalUrlService {
  private windowsBrowserProfilePromise: Promise<WindowsBrowserProfile | null> | null =
    null;

  async openUrl(targetUrl: string): Promise<void> {
    const url = new URL(targetUrl).toString();
    const errors: unknown[] = [];

    for (const launcher of await this.getLaunchers(url)) {
      try {
        await launcher();
        return;
      } catch (error) {
        errors.push(error);
      }
    }

    throw formatExternalOpenError(url, errors);
  }

  private async getLaunchers(url: string): Promise<Array<() => Promise<void>>> {
    if (process.platform === "win32") {
      const preferredBrowserLauncher =
        await this.getPreferredWindowsBrowserLauncher(url);

      return [
        ...(preferredBrowserLauncher ? [preferredBrowserLauncher] : []),
        () => shell.openExternal(url, { activate: true }),
        () => this.openWithPowerShell(url),
        () => this.openWithRunDll(url),
        () => this.openWithExplorer(url),
      ];
    }

    if (process.platform === "darwin") {
      return [
        () => shell.openExternal(url, { activate: true }),
        () => spawnDetached("open", [url]),
      ];
    }

    return [
      () => shell.openExternal(url, { activate: true }),
      () => spawnDetached("xdg-open", [url]),
    ];
  }

  private async getPreferredWindowsBrowserLauncher(
    url: string,
  ): Promise<null | (() => Promise<void>)> {
    const profile = await this.getWindowsBrowserProfile();

    if (!profile) {
      return null;
    }

    if (profile.family === "chromium") {
      return () => spawnDetached(profile.executablePath, ["--new-window", url]);
    }

    if (profile.family === "firefox") {
      return () => spawnDetached(profile.executablePath, ["-new-window", url]);
    }

    return null;
  }

  private async getWindowsBrowserProfile(): Promise<WindowsBrowserProfile | null> {
    if (!this.windowsBrowserProfilePromise) {
      this.windowsBrowserProfilePromise = this.readWindowsBrowserProfile();
    }

    return this.windowsBrowserProfilePromise;
  }

  private async readWindowsBrowserProfile(): Promise<WindowsBrowserProfile | null> {
    try {
      const { stdout: userChoiceOutput } = await execFileText(
        "reg.exe",
        [
          "query",
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
          "/v",
          "ProgId",
        ],
        {
          windowsHide: true,
        },
      );

      const progId = extractRegistryValue(userChoiceOutput);

      if (!progId) {
        return null;
      }

      const { stdout: commandOutput } = await execFileText(
        "reg.exe",
        ["query", `HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command`, "/ve"],
        {
          windowsHide: true,
        },
      );

      const command = extractRegistryValue(commandOutput);
      const executablePath = command ? extractExecutablePath(command) : null;

      if (!executablePath) {
        return null;
      }

      return {
        executablePath,
        family: classifyWindowsBrowserFamily(executablePath),
      };
    } catch {
      return null;
    }
  }

  private async openWithPowerShell(url: string): Promise<void> {
    await spawnDetached("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      `Start-Process -FilePath '${escapePowerShellString(url)}'`,
    ]);
  }

  private async openWithRunDll(url: string): Promise<void> {
    await spawnDetached("rundll32.exe", ["url.dll,FileProtocolHandler", url]);
  }

  private async openWithExplorer(url: string): Promise<void> {
    await spawnDetached("explorer.exe", [url]);
  }

  async openWithSystemLauncher(url: string): Promise<void> {
    for (const launcher of await this.getLaunchers(url)) {
      try {
        await launcher();
        return;
      } catch {
        continue;
      }
    }

    try {
      await shell.openExternal(url, { activate: true });
      return;
    } catch (error) {
      throw formatExternalOpenError(url, [error]);
    }
  }
}
