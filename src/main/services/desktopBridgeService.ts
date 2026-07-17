import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import os from "node:os";

import { PROTOCOL_VERSION } from "projecto-protocol";

import type {
  CommandRunResult,
  DesktopBridgeState,
  LaunchCommand,
  Project,
  RunEvent,
} from "../types/shared";
import {
  CommandRunResultSchema,
  DesktopBridgeStateSchema,
} from "../types/shared";
import type { FileSystemService } from "./fileSystemService";
import type { LauncherService } from "./launcherService";
import type { ProjectStore } from "./projectStore";

const DISABLED_MESSAGE =
  "Projecto runs commands in visible Windows Terminal sessions.";

export class DesktopBridgeService {
  private readonly events = new EventEmitter();
  private state: DesktopBridgeState = DesktopBridgeStateSchema.parse({
    status: "stopped",
    host: "127.0.0.1",
    protocolVersion: PROTOCOL_VERSION,
    extensionConnected: false,
    registeredWorkspaceCount: 0,
  });

  constructor(
    fileSystemService: FileSystemService,
    projectStore: ProjectStore,
    userDataPath: string,
  ) {
    void fileSystemService;
    void projectStore;
    void userDataPath;
  }

  setLauncherService(launcherService: LauncherService): void {
    void launcherService;
  }

  onStateChange(listener: (state: DesktopBridgeState) => void): () => void {
    this.events.on("state", listener);
    return () => {
      this.events.off("state", listener);
    };
  }

  getState(): DesktopBridgeState {
    return DesktopBridgeStateSchema.parse(this.state);
  }

  async start(): Promise<void> {
    this.updateState({ status: "stopped" });
  }

  async stop(): Promise<void> {
    this.updateState({ status: "stopped" });
  }

  hasConnectedEditorForPath(projectPath: string): boolean {
    void projectPath;
    return false;
  }

  async runCommandInEditorTerminal(
    project: Project,
    command: LaunchCommand,
  ): Promise<CommandRunResult> {
    void project;
    const runId = randomUUID();
    this.events.emit("run-event", {
      runId,
      projectId: project.id,
      commandId: command.id,
      kind: "status",
      status: "failed",
      message: DISABLED_MESSAGE,
      timestamp: new Date().toISOString(),
      executionMode: "os-external",
      managed: true,
    } satisfies RunEvent);

    return CommandRunResultSchema.parse({
      runId,
      commandId: command.id,
      status: "failed",
      executionMode: "os-external",
      managed: true,
    });
  }

  stopEditorTerminalRun(jobId: string): boolean {
    void jobId;
    return false;
  }

  async revealProjectTerminal(input: {
    projectId: string;
    projectPath: string;
    runId?: string;
  }): Promise<boolean> {
    void input;
    return false;
  }

  onRunEvent(listener: (event: RunEvent) => void): () => void {
    this.events.on("run-event", listener);
    return () => {
      this.events.off("run-event", listener);
    };
  }

  forwardRunEvent(event: RunEvent): void {
    void event;
  }

  getDiscoveryHint(): string {
    return `${DISABLED_MESSAGE} Host: ${os.hostname()}.`;
  }

  private updateState(patch: Partial<DesktopBridgeState>): void {
    const next = DesktopBridgeStateSchema.parse({
      ...this.state,
      ...patch,
      host: "127.0.0.1",
      protocolVersion: PROTOCOL_VERSION,
      extensionConnected: false,
      registeredWorkspaceCount: 0,
    });
    this.state = next;
    this.events.emit("state", next);
  }
}