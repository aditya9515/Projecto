import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  CommandRunResult,
  LaunchCommand,
  RunEvent,
  RunStatus,
  TerminalStrategy,
} from "../types/shared";
import { CommandRunResultSchema } from "../types/shared";

type CommandExecutionRequest = {
  projectId: string;
  projectName: string;
  projectPath: string;
  command: LaunchCommand;
  terminalStrategy: TerminalStrategy;
  launchId?: string;
  profileId?: string;
};

const EXTERNAL_EXIT_MARKER = "__PROJECTO_EXIT_CODE:";

type ExternalRunMetadata = {
  projectId: string;
  title: string;
  request: CommandExecutionRequest;
};

type ExternalRunProcess = {
  pid: number;
  startedAtFileTime: string;
};

function isOsInternalStrategy(strategy: TerminalStrategy): boolean {
  return strategy === "os-internal";
}

function isOsExternalStrategy(strategy: TerminalStrategy): boolean {
  return strategy === "os-external";
}

function escapeBashPath(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

function quoteBash(value: string): string {
  return `'${escapeBashPath(value)}'`;
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function escapePowerShellDoubleQuoted(value: string): string {
  return value.replace(/[`"$]/g, "`$&");
}

function buildExternalTerminalTitle(
  projectName: string,
  runId: string,
): string {
  return `Projecto: ${projectName} (${runId.slice(0, 8)})`;
}

function emitStatus(
  emitter: EventEmitter,
  request: CommandExecutionRequest,
  runId: string,
  status: RunStatus,
  message: string,
  exitCode?: number | null,
  managed = false,
): void {
  const event: RunEvent = {
    runId,
    projectId: request.projectId,
    launchId: request.launchId,
    profileId: request.profileId,
    commandId: request.command.id,
    kind: "status",
    status,
    message,
    timestamp: new Date().toISOString(),
    exitCode,
    executionMode: request.terminalStrategy,
    managed,
  };

  emitter.emit("run-event", event);
}

async function openWindowsMirroredExternalTerminal(options: {
  cwd: string;
  scriptPath: string;
  title: string;
}): Promise<void> {
  try {
    await spawnDetached("wt.exe", [
      "-d",
      options.cwd,
      "--title",
      options.title,
      "--suppressApplicationTitle",
      "powershell.exe",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      options.scriptPath,
    ]);
  } catch {
    const script = [
      `$scriptPath = '${escapePowerShellSingleQuoted(options.scriptPath)}';`,
      `$workingDirectory = '${escapePowerShellSingleQuoted(options.cwd)}';`,
      "$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath) -WorkingDirectory $workingDirectory -WindowStyle Normal -PassThru;",
    ].join(" ");

    await spawnDetached(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      { windowsHide: true },
    );
  }
}

async function openMacMirroredExternalTerminal(
  scriptPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "osascript",
      [
        "-e",
        `tell application "Terminal" to do script "bash \\"${escapeAppleScript(scriptPath)}\\""`,
      ],
      { detached: true, stdio: "ignore" },
    );

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function openLinuxMirroredExternalTerminal(
  scriptPath: string,
): Promise<void> {
  const command = `${quoteBash(scriptPath)}`;
  const candidates: Array<{ executable: string; args: string[] }> = [
    {
      executable: "x-terminal-emulator",
      args: ["-e", "bash", "-lc", command],
    },
    {
      executable: "gnome-terminal",
      args: ["--", "bash", "-lc", command],
    },
    {
      executable: "konsole",
      args: ["-e", "bash", "-lc", command],
    },
  ];

  let lastError: Error | undefined;

  for (const candidate of candidates) {
    try {
      await spawnDetached(candidate.executable, candidate.args);
      return;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw (
    lastError ??
    new Error("Unable to open an external terminal on this system.")
  );
}

async function spawnDetached(
  executable: string,
  args: string[],
  options?: { windowsHide?: boolean },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: options?.windowsHide,
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function revealWindowsTerminal(
  title: string,
  runId?: string,
): Promise<boolean> {
  const script = [
    "$shell = New-Object -ComObject WScript.Shell;",
    `$activated = $shell.AppActivate("${escapePowerShellDoubleQuoted(title)}");`,
    runId
      ? [
          "if (-not $activated) {",
          `  $runId = '${escapePowerShellSingleQuoted(runId)}';`,
          "  $terminalProcesses = Get-CimInstance Win32_Process | Where-Object {",
          "    $_.CommandLine -and",
          "    $_.CommandLine.Contains($runId) -and",
          "    @('WindowsTerminal.exe', 'powershell.exe', 'pwsh.exe', 'cmd.exe', 'conhost.exe') -contains $_.Name",
          "  } | Sort-Object @{ Expression = { if ($_.Name -eq 'WindowsTerminal.exe') { 0 } else { 1 } } };",
          "  foreach ($terminalProcess in $terminalProcesses) {",
          "    if ($shell.AppActivate([int] $terminalProcess.ProcessId)) { $activated = $true; break }",
          "  }",
          "}",
        ].join(" ")
      : "",
    "if (-not $activated) { exit 1 }",
  ].join(" ");

  return new Promise<boolean>((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

async function revealMacTerminal(title: string): Promise<boolean> {
  const escapedTitle = escapeAppleScript(title);
  const script = [
    'tell application "Terminal"',
    "  repeat with terminalWindow in windows",
    "    repeat with terminalTab in tabs of terminalWindow",
    `      if (name of terminalTab contains "${escapedTitle}") or (custom title of terminalTab contains "${escapedTitle}") then`,
    "        set selected tab of terminalWindow to terminalTab",
    "        set index of terminalWindow to 1",
    "        activate",
    "        return",
    "      end if",
    "    end repeat",
    "  end repeat",
    '  error "Projecto terminal not found"',
    "end tell",
  ].join("\n");

  return new Promise<boolean>((resolve) => {
    const child = spawn("osascript", ["-e", script], {
      detached: false,
      stdio: "ignore",
    });

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

async function revealLinuxTerminal(title: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      "xdotool",
      ["search", "--name", title, "windowactivate"],
      {
        detached: false,
        stdio: "ignore",
      },
    );

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

async function closeWindowsExternalTerminal(
  title: string,
  runId: string,
  trackedProcess?: ExternalRunProcess,
): Promise<boolean> {
  const script = [
    `$runId = '${escapePowerShellSingleQuoted(runId)}';`,
    `$title = "${escapePowerShellDoubleQuoted(title)}";`,
    `$trackedProcessId = ${trackedProcess?.pid ?? "$null"};`,
    `$trackedProcessStartedAt = '${trackedProcess?.startedAtFileTime ?? ""}';`,
    "$stopped = $false;",
    "if ($trackedProcessId) {",
    "  $trackedProcess = Get-Process -Id $trackedProcessId -ErrorAction SilentlyContinue;",
    "  if ($trackedProcess -and ([string] $trackedProcess.StartTime.ToFileTimeUtc()) -eq $trackedProcessStartedAt) {",
    "    & taskkill.exe /PID $trackedProcessId /T /F | Out-Null;",
    "    if ($LASTEXITCODE -eq 0) { $stopped = $true }",
    "  }",
    "}",
    "if (-not $stopped) {",
    "  $processes = @();",
    "  try {",
    "    $processes = Get-CimInstance Win32_Process | Where-Object {",
    "      $_.CommandLine -and",
    "      $_.CommandLine.Contains($runId) -and",
    "      @('powershell.exe', 'pwsh.exe', 'cmd.exe') -contains $_.Name",
    "    };",
    "  } catch {}",
    "  foreach ($process in $processes) {",
    "    & taskkill.exe /PID $process.ProcessId /T /F | Out-Null;",
    "    if ($LASTEXITCODE -eq 0) { $stopped = $true }",
    "  }",
    "}",
    "if (-not $stopped) {",
    "  $shell = New-Object -ComObject WScript.Shell;",
    "  if ($shell.AppActivate($title)) {",
    "    Start-Sleep -Milliseconds 150;",
    "    $shell.SendKeys('%{F4}');",
    "    $stopped = $true;",
    "  }",
    "}",
    "if (-not $stopped) { exit 1 }",
  ].join(" ");

  return new Promise<boolean>((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

async function closeUnixExternalTerminal(runId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn("pkill", ["-TERM", "-f", runId], {
      detached: false,
      stdio: "ignore",
    });

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

export class CommandRunner {
  private readonly events = new EventEmitter();
  private readonly activeChildren = new Map<string, ChildProcess>();
  private readonly activeRequests = new Map<string, CommandExecutionRequest>();
  private readonly externalTailers = new Map<string, NodeJS.Timeout>();
  private readonly externalRuns = new Map<string, ExternalRunMetadata>();
  private readonly stoppingRunIds = new Set<string>();

  constructor(
    private readonly runsDirectory = path.join(os.tmpdir(), "projecto-runs"),
    private readonly externalTailTimeoutMs = 12 * 60 * 60 * 1_000,
  ) {}

  onRunEvent(listener: (event: RunEvent) => void): () => void {
    this.events.on("run-event", listener);
    return () => {
      this.events.off("run-event", listener);
    };
  }

  async runCommand(
    request: CommandExecutionRequest,
  ): Promise<CommandRunResult> {
    const runId = crypto.randomUUID();
    const resolvedCwd = path.isAbsolute(request.command.cwd)
      ? request.command.cwd
      : path.resolve(request.projectPath, request.command.cwd);

    emitStatus(
      this.events,
      request,
      runId,
      "started",
      `Queued ${request.command.label}`,
    );

    if (isOsInternalStrategy(request.terminalStrategy)) {
      await this.runManagedExternalCommand(request, runId, resolvedCwd);

      return CommandRunResultSchema.parse({
        runId,
        commandId: request.command.id,
        status: "spawned",
        executionMode: request.terminalStrategy,
        managed: true,
      });
    }

    if (isOsExternalStrategy(request.terminalStrategy)) {
      await this.openMirroredExternalTerminal(request, runId, resolvedCwd);

      return CommandRunResultSchema.parse({
        runId,
        commandId: request.command.id,
        status: "spawned",
        executionMode: request.terminalStrategy,
        managed: false,
      });
    }

    throw new Error(
      `CommandRunner does not handle the ${request.terminalStrategy} terminal strategy.`,
    );
  }

  async revealExternalRun(
    runId: string,
    fallbackTitle?: string,
  ): Promise<boolean> {
    const metadata = this.externalRuns.get(runId);
    const title = metadata?.title ?? fallbackTitle;

    if (!title) {
      return false;
    }

    if (process.platform === "win32") {
      return revealWindowsTerminal(title, runId);
    }

    if (process.platform === "darwin") {
      return revealMacTerminal(title);
    }

    return revealLinuxTerminal(title);
  }

  async closeExternalRun(
    runId: string,
    fallbackTitle?: string,
  ): Promise<boolean> {
    const metadata = this.externalRuns.get(runId);
    const title = metadata?.title ?? fallbackTitle;

    if (!title) {
      return false;
    }

    const trackedProcess = process.platform === "win32"
      ? await this.readExternalRunProcess(runId)
      : undefined;
    const closed = process.platform === "win32"
      ? await closeWindowsExternalTerminal(title, runId, trackedProcess)
      : await closeUnixExternalTerminal(runId);

    if (!closed) {
      return false;
    }

    const tailer = this.externalTailers.get(runId);
    if (tailer) {
      clearInterval(tailer);
      this.externalTailers.delete(runId);
    }

    this.externalRuns.delete(runId);
    await this.removeExternalRunProcess(runId);

    if (metadata) {
      emitStatus(
        this.events,
        metadata.request,
        runId,
        "stopped",
        "Projecto closed the mapped OS terminal.",
        null,
        false,
      );
    }

    return true;
  }

  stopRun(runId: string): boolean {
    const child = this.activeChildren.get(runId);
    const request = this.activeRequests.get(runId);

    if (!child || !request) {
      return false;
    }

    this.stoppingRunIds.add(runId);

    if (process.platform === "win32" && child.pid) {
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    } else {
      child.kill("SIGTERM");
    }

    return true;
  }

  stopAll(): void {
    for (const runId of [...this.activeChildren.keys()]) {
      this.stopRun(runId);
    }
  }

  private async runManagedExternalCommand(
    request: CommandExecutionRequest,
    runId: string,
    cwd: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(request.command.command, {
        cwd,
        shell: true,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let spawned = false;

      const emitOutput = (kind: "stdout" | "stderr", chunk: Buffer): void => {
        this.events.emit("run-event", {
          runId,
          projectId: request.projectId,
          launchId: request.launchId,
          profileId: request.profileId,
          commandId: request.command.id,
          kind,
          message: chunk.toString("utf8"),
          timestamp: new Date().toISOString(),
          executionMode: request.terminalStrategy,
          managed: true,
        } satisfies RunEvent);
      };

      child.stdout?.on("data", (chunk: Buffer) => emitOutput("stdout", chunk));
      child.stderr?.on("data", (chunk: Buffer) => emitOutput("stderr", chunk));

      child.once("error", (error) => {
        this.activeChildren.delete(runId);
        this.activeRequests.delete(runId);
        this.stoppingRunIds.delete(runId);

        if (!spawned) {
          reject(error);
          return;
        }

        emitStatus(
          this.events,
          request,
          runId,
          "failed",
          error.message,
          undefined,
          true,
        );
      });

      child.once("spawn", () => {
        spawned = true;
        this.activeChildren.set(runId, child);
        this.activeRequests.set(runId, request);
        emitStatus(
          this.events,
          request,
          runId,
          "spawned",
          "Started in the background. Projecto is streaming output into Run Logs.",
          undefined,
          true,
        );
        resolve();
      });

      child.once("close", (code, signal) => {
        this.activeChildren.delete(runId);
        this.activeRequests.delete(runId);
        const stoppedByUser = this.stoppingRunIds.delete(runId);
        const exitCode = code ?? (stoppedByUser ? null : undefined);
        const status: RunStatus = stoppedByUser
          ? "stopped"
          : code === 0
            ? "completed"
            : "failed";
        const message = stoppedByUser
          ? "Project stopped by Projecto."
          : code === 0
            ? "Background command completed."
            : signal
              ? `Background command exited after signal ${signal}.`
              : Number.isInteger(code)
                ? `Background command exited with code ${code}.`
                : "Background command exited.";

        emitStatus(
          this.events,
          request,
          runId,
          status,
          message,
          exitCode,
          true,
        );
      });
    });
  }

  private async openMirroredExternalTerminal(
    request: CommandExecutionRequest,
    runId: string,
    cwd: string,
  ): Promise<void> {
    await fs.mkdir(this.runsDirectory, { recursive: true });
    const logPath = path.join(this.runsDirectory, `${runId}.log`);
    const terminalTitle = buildExternalTerminalTitle(
      request.projectName,
      runId,
    );
    this.externalRuns.set(runId, {
      projectId: request.projectId,
      title: terminalTitle,
      request,
    });

    await fs.writeFile(logPath, "", "utf8");
    this.startExternalLogTail(request, runId, logPath);

    if (process.platform === "win32") {
      await this.openMirroredWindowsExternalTerminal(
        request,
        runId,
        cwd,
        logPath,
        terminalTitle,
      );
      return;
    }

    await this.openMirroredUnixExternalTerminal(
      request,
      runId,
      cwd,
      logPath,
      terminalTitle,
    );
  }

  private async openMirroredWindowsExternalTerminal(
    request: CommandExecutionRequest,
    runId: string,
    cwd: string,
    logPath: string,
    terminalTitle: string,
  ): Promise<void> {
    const commandPath = path.join(this.runsDirectory, `${runId}.cmd`);
    const scriptPath = path.join(this.runsDirectory, `${runId}.ps1`);
    const processPath = this.getExternalRunProcessPath(runId);
    const safeCwd = cwd.replace(/"/g, '""');

    await fs.writeFile(
      commandPath,
      [
        "@echo off",
        "chcp 65001 > nul",
        `cd /d "${safeCwd}"`,
        `call ${request.command.command}`,
        "exit /b %ERRORLEVEL%",
        "",
      ].join("\r\n"),
      "utf8",
    );
    await fs.writeFile(
      scriptPath,
      [
        "chcp 65001 > $null",
        `$Host.UI.RawUI.WindowTitle = '${escapePowerShellSingleQuoted(terminalTitle)}'`,
        "[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()",
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()",
        "$OutputEncoding = [System.Text.UTF8Encoding]::new()",
        `$cmdPath = '${escapePowerShellSingleQuoted(commandPath)}'`,
        `$logPath = '${escapePowerShellSingleQuoted(logPath)}'`,
        `$processPath = '${escapePowerShellSingleQuoted(processPath)}'`,
        "$utf8NoBom = [System.Text.UTF8Encoding]::new($false)",
        "$script:projectoExitCode = 0",
        "$script:projectoFinalized = $false",
        "[System.IO.File]::WriteAllText($processPath, \"$PID|$([Diagnostics.Process]::GetCurrentProcess().StartTime.ToFileTimeUtc())\", $utf8NoBom)",
        "function Write-ProjectoLogLine {",
        "  param([string] $line)",
        "  [System.IO.File]::AppendAllText($logPath, $line + [Environment]::NewLine, $utf8NoBom)",
        "  Write-Output $line",
        "}",
        "function Write-ProjectoFinalStatus {",
        "  if ($script:projectoFinalized) { return }",
        "  $script:projectoFinalized = $true",
        `  $marker = '${EXTERNAL_EXIT_MARKER}' + $script:projectoExitCode`,
        "  [System.IO.File]::AppendAllText($logPath, $marker + [Environment]::NewLine, $utf8NoBom)",
        "  Write-Host $marker",
        "  Write-Host ''",
        "  Write-Host 'Projecto mirrored this terminal output into the desktop Run Logs.'",
        "}",
        "$cmdInvocation = '\"' + $cmdPath + '\"'",
        "[System.IO.File]::WriteAllText($logPath, '', $utf8NoBom)",
        "try {",
        "  cmd.exe /d /s /c $cmdInvocation 2>&1 | ForEach-Object { Write-ProjectoLogLine ([string] $_) }",
        "  if ($null -ne $LASTEXITCODE) { $script:projectoExitCode = $LASTEXITCODE }",
        "} catch {",
        "  if ($script:projectoExitCode -eq 0) { $script:projectoExitCode = 130 }",
        "  Write-Error $_",
        "} finally {",
        "  Write-ProjectoFinalStatus",
        "  Remove-Item -LiteralPath $processPath -Force -ErrorAction SilentlyContinue",
        "}",
        "exit $script:projectoExitCode",
        "",
      ].join("\r\n"),
      "utf8",
    );

    await openWindowsMirroredExternalTerminal({
      cwd,
      scriptPath,
      title: terminalTitle,
    });
  }

  private async openMirroredUnixExternalTerminal(
    request: CommandExecutionRequest,
    runId: string,
    cwd: string,
    logPath: string,
    terminalTitle: string,
  ): Promise<void> {
    const scriptPath = path.join(this.runsDirectory, `${runId}.sh`);

    await fs.writeFile(
      scriptPath,
      [
        "#!/usr/bin/env bash",
        "set +e",
        `printf '\\033]0;%s\\007' ${quoteBash(terminalTitle)}`,
        `cd ${quoteBash(cwd)} || exit 1`,
        `: > ${quoteBash(logPath)}`,
        "projecto_exit_code=0",
        "projecto_finalized=0",
        "projecto_finalize() {",
        '  if [ "$projecto_finalized" -eq 1 ]; then return; fi',
        "  projecto_finalized=1",
        `  printf '%s%s\\n' '${EXTERNAL_EXIT_MARKER}' "$projecto_exit_code" | tee -a ${quoteBash(logPath)}`,
        '  printf "\\nProjecto mirrored this terminal output into the desktop Run Logs.\\n"',
        "}",
        "trap 'projecto_exit_code=130; projecto_finalize; exit \"$projecto_exit_code\"' INT TERM",
        "trap 'projecto_finalize' EXIT",
        "{",
        request.command.command,
        `} 2>&1 | tee -a ${quoteBash(logPath)}`,
        "projecto_exit_code=${PIPESTATUS[0]}",
        'exit "$projecto_exit_code"',
        "",
      ].join("\n"),
      "utf8",
    );
    await fs.chmod(scriptPath, 0o755);

    if (process.platform === "darwin") {
      await openMacMirroredExternalTerminal(scriptPath);
      return;
    }

    await openLinuxMirroredExternalTerminal(scriptPath);
  }

  private getExternalRunProcessPath(runId: string): string {
    return path.join(this.runsDirectory, `${runId}.process`);
  }

  private async readExternalRunProcess(
    runId: string,
  ): Promise<ExternalRunProcess | undefined> {
    try {
      const [pidText, startedAtFileTime] = (
        await fs.readFile(this.getExternalRunProcessPath(runId), "utf8")
      )
        .trim()
        .split("|", 2);
      const pid = Number(pidText);

      if (
        !Number.isSafeInteger(pid) ||
        pid <= 0 ||
        !startedAtFileTime ||
        !/^\d+$/.test(startedAtFileTime)
      ) {
        return undefined;
      }

      return { pid, startedAtFileTime };
    } catch {
      return undefined;
    }
  }

  private async removeExternalRunProcess(runId: string): Promise<void> {
    try {
      await fs.rm(this.getExternalRunProcessPath(runId), { force: true });
    } catch {
      // The terminal process may have already removed its own tracking file.
    }
  }

  private startExternalLogTail(
    request: CommandExecutionRequest,
    runId: string,
    logPath: string,
  ): void {
    let offset = 0;
    let finished = false;
    const startedAt = Date.now();
    const timeoutMs = this.externalTailTimeoutMs;

    const stopTailing = () => {
      const tailer = this.externalTailers.get(runId);

      if (tailer) {
        clearInterval(tailer);
        this.externalTailers.delete(runId);
      }
    };

    const tailer = setInterval(() => {
      void fs
        .readFile(logPath, "utf8")
        .then((content) => {
          if (offset >= content.length) {
            if (!finished && Date.now() - startedAt > timeoutMs) {
              finished = true;
              emitStatus(
                this.events,
                request,
                runId,
                "stopped",
                "External terminal stopped responding or was closed. Session marked as stopped.",
                null,
              );
              this.externalRuns.delete(runId);
              stopTailing();
            }
            return;
          }

          const chunk = content.slice(offset);
          offset = content.length;

          if (chunk.length > 0) {
            this.events.emit("run-event", {
              runId,
              projectId: request.projectId,
              launchId: request.launchId,
              profileId: request.profileId,
              commandId: request.command.id,
              kind: "stdout",
              message: chunk,
              timestamp: new Date().toISOString(),
              executionMode: request.terminalStrategy,
              managed: false,
            } satisfies RunEvent);
          }

          const markerLine = content
            .split(/\r?\n/)
            .find((line) => line.includes(EXTERNAL_EXIT_MARKER));

          if (!finished && markerLine) {
            finished = true;
            const exitCode = Number(
              markerLine
                .slice(
                  markerLine.indexOf(EXTERNAL_EXIT_MARKER) +
                    EXTERNAL_EXIT_MARKER.length,
                )
                .trim(),
            );
            emitStatus(
              this.events,
              request,
              runId,
              exitCode === 0 ? "completed" : "failed",
              Number.isFinite(exitCode)
                ? `OS terminal command exited with code ${exitCode}.`
                : "OS terminal command finished.",
              Number.isFinite(exitCode) ? exitCode : undefined,
            );
            this.events.emit("run-event", {
              runId,
              projectId: request.projectId,
              launchId: request.launchId,
              profileId: request.profileId,
              commandId: request.command.id,
              kind: "system",
              message: Number.isFinite(exitCode)
                ? `External terminal command exited with code ${exitCode}.`
                : "External terminal command finished.",
              timestamp: new Date().toISOString(),
              exitCode: Number.isFinite(exitCode) ? exitCode : undefined,
              executionMode: request.terminalStrategy,
              managed: false,
            } satisfies RunEvent);
            this.externalRuns.delete(runId);
            stopTailing();
          }
        })
        .catch(() => {
          if (!finished && Date.now() - startedAt > timeoutMs) {
            finished = true;
            emitStatus(
              this.events,
              request,
              runId,
              "stopped",
              "External terminal stopped responding or was closed. Session marked as stopped.",
              null,
            );
            this.externalRuns.delete(runId);
            stopTailing();
          }
        });
    }, 500);

    tailer.unref?.();
    this.externalTailers.set(runId, tailer);
  }
}
