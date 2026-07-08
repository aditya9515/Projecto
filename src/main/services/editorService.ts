import { spawn } from "node:child_process";
import path from "node:path";

import type { AppSettings, Project } from "../types/shared";

function resolveVsCodeExecutable(): string {
  return process.platform === "win32" ? "code.cmd" : "code";
}

function isWindowsCommandScript(executable: string): boolean {
  const extension = path.extname(executable).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

async function spawnDetached(
  executable: string,
  args: string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      reject(
        new Error(
          code === "ENOENT"
            ? "VS Code command not found. Install VS Code and make sure the code command is available on PATH."
            : error.message,
        ),
      );
    });

    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export class EditorService {
  async openProjectEditor(
    project: Project,
    _settings: AppSettings,
    options?: { reuseWindow?: boolean },
  ): Promise<void> {
    const executable = resolveVsCodeExecutable();
    const args = options?.reuseWindow
      ? ["--reuse-window", project.path]
      : [project.path];

    if (process.platform === "win32" && isWindowsCommandScript(executable)) {
      await spawnDetached("cmd.exe", ["/d", "/c", executable, ...args]);
      return;
    }

    await spawnDetached(executable, args);
  }
}
