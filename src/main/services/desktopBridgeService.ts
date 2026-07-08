import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";

import {
  BridgeAuthStateSchema,
  BridgeHealthResponseSchema,
  EditorRunEventSchema,
  EditorRunOutputEventSchema,
  EditorTerminalCommandSchema,
  ExtensionRegistrationSchema,
  PROTOCOL_VERSION,
  ProjectoEventSchema,
  ProjectStatusRequestSchema,
  RunCommandRequestSchema,
  RunProfileRequestSchema,
  WorkspaceRegistrationSchema,
  type EditorTerminalCommand,
  type EditorTerminalLocation,
  type EditorRunEvent,
  type EditorRunOutputEvent,
  type ProjectoEvent,
} from "projecto-protocol";

import type {
  CommandRunResult,
  DesktopBridgeState,
  LaunchCommand,
  Project,
  RunEvent,
  RunStatus,
} from "../types/shared";
import {
  CommandRunResultSchema,
  DesktopBridgeStateSchema,
  RunEventSchema,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";
import type { LauncherService } from "./launcherService";
import { ProjectStore } from "./projectStore";

type ExtensionRegistrationState = {
  extensionId: string;
  editorName: string;
  extensionVersion: string;
  registeredAt: string;
  lastSeenAt: string;
};

type SseClient = {
  id: string;
  response: ServerResponse;
};

type EditorRunMetadata = {
  projectId: string;
  launchId?: string;
  profileId?: string;
  commandId: string;
  terminalLocation?: EditorTerminalLocation;
};

function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase();
}

function jsonResponse(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function notFound(response: ServerResponse): void {
  jsonResponse(response, 404, { error: "Bridge endpoint not found." });
}

function unauthorized(response: ServerResponse): void {
  jsonResponse(response, 401, {
    error: "Missing or invalid Projecto bridge token.",
  });
}

function mapEditorRunStatus(status: EditorRunEvent["status"]): RunStatus {
  switch (status) {
    case "accepted":
      return "spawned";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
    case "terminal_closed":
      return "stopped";
  }
}

function getEditorRunMessage(event: EditorRunEvent): string {
  if (event.message) {
    return event.message;
  }

  switch (event.status) {
    case "accepted":
      return "Editor extension accepted the command.";
    case "running":
      return "Running in VS Code terminal.";
    case "completed":
      return "VS Code terminal command completed.";
    case "failed":
      return "VS Code terminal command failed.";
    case "stopped":
      return "VS Code terminal command stopped.";
    case "terminal_closed":
      return "VS Code terminal closed.";
  }
}

function isFinalEditorRunStatus(status: EditorRunEvent["status"]): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "stopped" ||
    status === "terminal_closed"
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export class DesktopBridgeService {
  private readonly events = new EventEmitter();
  private readonly authFilePath: string;
  private readonly token = randomBytes(32).toString("hex");
  private readonly startedAt = Date.now();
  private readonly registeredWorkspaces = new Map<string, string>();
  private readonly sseClients = new Map<string, SseClient>();
  private server: http.Server | null = null;
  private state: DesktopBridgeState = DesktopBridgeStateSchema.parse({
    status: "starting",
    host: "127.0.0.1",
    protocolVersion: PROTOCOL_VERSION,
    extensionConnected: false,
    registeredWorkspaceCount: 0,
  });
  private stopPromise: Promise<void> | null = null;
  private extension: ExtensionRegistrationState | null = null;
  private launcherService: LauncherService | null = null;
  private readonly editorRunMetadata = new Map<string, EditorRunMetadata>();

  constructor(
    private readonly fileSystemService: FileSystemService,
    private readonly projectStore: ProjectStore,
    userDataPath: string,
  ) {
    this.authFilePath = path.join(userDataPath, "bridge-auth.json");
  }

  setLauncherService(launcherService: LauncherService): void {
    this.launcherService = launcherService;
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
    if (this.server) {
      return;
    }

    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        jsonResponse(response, 500, {
          error:
            error instanceof Error ? error.message : "Unexpected bridge error.",
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => {
        this.server?.off("error", reject);
        resolve();
      });
    });

    const address = this.server.address();
    const port =
      typeof address === "object" && address ? address.port : undefined;

    if (!port) {
      throw new Error("Projecto bridge could not determine its local port.");
    }

    const authState = BridgeAuthStateSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      host: "127.0.0.1",
      port,
      token: this.token,
      updatedAt: new Date().toISOString(),
    });
    await this.fileSystemService.writeJsonAtomic(this.authFilePath, authState);
    this.updateState({
      status: "waiting",
      port,
      extensionConnected: false,
      registeredWorkspaceCount: 0,
    });
    this.broadcast({
      type: "BRIDGE_READY",
      protocolVersion: PROTOCOL_VERSION,
      port,
      timestamp: new Date().toISOString(),
    });
  }

  async stop(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise;
    }

    this.stopPromise = this.stopBridge();
    return this.stopPromise.finally(() => {
      this.stopPromise = null;
    });
  }

  hasConnectedEditorForPath(projectPath: string): boolean {
    const normalized = normalizePath(projectPath);
    return (
      this.state.extensionConnected &&
      this.registeredWorkspaces.has(normalized) &&
      this.sseClients.size > 0
    );
  }

  async runCommandInEditorTerminal(
    project: Project,
    command: LaunchCommand,
    options?: {
      launchId?: string;
      profileId?: string;
      terminalLocation?: EditorTerminalLocation;
    },
  ): Promise<CommandRunResult> {
    if (!this.hasConnectedEditorForPath(project.path)) {
      throw new Error(
        "VS Code terminal mode requires the Projecto VS Code extension. Install/connect the extension or choose an OS Terminal mode.",
      );
    }

    const runId = randomUUID();
    const payload = EditorTerminalCommandSchema.parse({
      jobId: runId,
      projectId: project.id,
      projectName: project.name,
      workspacePath: project.path,
      commandId: command.id,
      label: command.label,
      command: command.command,
      cwd: path.isAbsolute(command.cwd)
        ? command.cwd
        : path.resolve(project.path, command.cwd),
      terminalLocation: options?.terminalLocation ?? "panel",
    } satisfies EditorTerminalCommand);
    this.editorRunMetadata.set(runId, {
      projectId: project.id,
      launchId: options?.launchId,
      profileId: options?.profileId,
      commandId: command.id,
      terminalLocation: options?.terminalLocation ?? "panel",
    });

    this.broadcast({
      type: "RUN_COMMAND_IN_EDITOR",
      payload,
      timestamp: new Date().toISOString(),
    });
    this.events.emit("run-event", {
      runId,
      projectId: project.id,
      launchId: options?.launchId,
      profileId: options?.profileId,
      commandId: command.id,
      kind: "status",
      status: "started",
      message: `Waiting for the Projecto editor extension to accept ${command.command}.`,
      timestamp: new Date().toISOString(),
      executionMode:
        options?.terminalLocation === "editor"
          ? "vscode-external"
          : "vscode-internal",
      managed: true,
    } satisfies RunEvent);

    return CommandRunResultSchema.parse({
      runId,
      commandId: command.id,
      status: "started",
      executionMode:
        options?.terminalLocation === "editor"
          ? "vscode-external"
          : "vscode-internal",
      managed: true,
    });
  }

  stopEditorTerminalRun(jobId: string): boolean {
    if (this.sseClients.size === 0) {
      return false;
    }

    this.broadcast({
      type: "STOP_RUN_IN_EDITOR",
      payload: { jobId },
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  async revealProjectTerminal(input: {
    projectId: string;
    projectPath: string;
    runId?: string;
  }): Promise<boolean> {
    if (!this.hasConnectedEditorForPath(input.projectPath)) {
      return false;
    }

    this.broadcast({
      type: "REVEAL_EDITOR_TERMINAL",
      payload: {
        projectId: input.projectId,
        workspacePath: input.projectPath,
        jobId: input.runId,
      },
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  onRunEvent(listener: (event: RunEvent) => void): () => void {
    this.events.on("run-event", listener);
    return () => {
      this.events.off("run-event", listener);
    };
  }

  forwardRunEvent(event: RunEvent): void {
    if (event.kind !== "status") {
      return;
    }

    this.broadcast({
      type: "RUN_STATUS",
      runId: event.runId,
      status:
        event.status === "completed"
          ? "completed"
          : event.status === "failed"
            ? "failed"
            : event.status === "stopped"
              ? "stopped"
              : event.status === "running" || event.status === "ready"
                ? "running"
                : "queued",
      message: event.message,
      timestamp: event.timestamp,
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (!this.isAuthorized(request, requestUrl)) {
      unauthorized(response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      jsonResponse(
        response,
        200,
        BridgeHealthResponseSchema.parse({
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          extensionConnected: this.state.extensionConnected,
          registeredWorkspaceCount: this.registeredWorkspaces.size,
          uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
        }),
      );
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/events/stream") {
      this.handleEventStream(response);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/extension/register"
    ) {
      const body = ExtensionRegistrationSchema.parse(
        await readJsonBody(request),
      );
      const now = new Date().toISOString();
      this.extension = {
        extensionId: body.extensionId,
        editorName: body.editorName,
        extensionVersion: body.extensionVersion,
        registeredAt: this.extension?.registeredAt ?? now,
        lastSeenAt: now,
      };

      for (const workspacePath of body.workspacePaths) {
        this.registeredWorkspaces.set(
          normalizePath(workspacePath),
          workspacePath,
        );
      }

      this.updateState({
        status: "connected",
        extensionConnected: true,
        registeredWorkspaceCount: this.registeredWorkspaces.size,
      });
      this.broadcast({
        type: "EXTENSION_REGISTERED",
        extensionId: body.extensionId,
        editorName: body.editorName,
        timestamp: now,
      });
      jsonResponse(response, 200, { ok: true, state: this.getState() });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/extension/workspace"
    ) {
      const body = WorkspaceRegistrationSchema.parse(
        await readJsonBody(request),
      );
      this.registeredWorkspaces.set(
        normalizePath(body.workspacePath),
        body.workspacePath,
      );
      this.updateState({
        status: "connected",
        extensionConnected: true,
        registeredWorkspaceCount: this.registeredWorkspaces.size,
      });
      this.broadcast({
        type: "WORKSPACE_REGISTERED",
        extensionId: body.extensionId,
        workspacePath: body.workspacePath,
        timestamp: new Date().toISOString(),
      });
      jsonResponse(
        response,
        200,
        await this.getProjectStatus(body.workspacePath),
      );
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/extension/run-event"
    ) {
      const body = EditorRunEventSchema.parse(await readJsonBody(request));
      this.handleEditorRunEvent(body);
      jsonResponse(response, 200, { ok: true });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/extension/run-output"
    ) {
      const body = EditorRunOutputEventSchema.parse(
        await readJsonBody(request),
      );
      this.handleEditorRunOutputEvent(body);
      jsonResponse(response, 200, { ok: true });
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/projects/by-path"
    ) {
      const input = ProjectStatusRequestSchema.parse({
        workspacePath: requestUrl.searchParams.get("workspacePath") ?? "",
      });
      jsonResponse(
        response,
        200,
        await this.getProjectStatus(input.workspacePath),
      );
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/commands/run-profile"
    ) {
      if (!this.launcherService) {
        throw new Error("Projecto launcher is not ready.");
      }

      const body = RunProfileRequestSchema.parse(await readJsonBody(request));
      const result = await this.launcherService.launchProfile(
        body.projectId,
        body.profileId,
        {
          approvedCommandIds: await this.getProfileCommandIds(
            body.projectId,
            body.profileId,
          ),
          dangerousOverride: true,
        },
      );
      jsonResponse(response, 200, result);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/commands/run-command"
    ) {
      if (!this.launcherService) {
        throw new Error("Projecto launcher is not ready.");
      }

      const body = RunCommandRequestSchema.parse(await readJsonBody(request));
      const result = await this.launcherService.runCommand(
        body.projectId,
        body.commandId,
        {
          approvedCommandIds: [body.commandId],
          dangerousOverride: true,
        },
      );
      jsonResponse(response, 200, result);
      return;
    }

    notFound(response);
  }

  private isAuthorized(request: IncomingMessage, requestUrl: URL): boolean {
    const authorization = request.headers.authorization;
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : undefined;
    const headerToken = request.headers["x-projecto-bridge-token"];
    const queryToken = requestUrl.searchParams.get("token");
    const candidate =
      bearerToken ||
      (Array.isArray(headerToken) ? headerToken[0] : headerToken) ||
      queryToken;

    return candidate === this.token;
  }

  private handleEventStream(response: ServerResponse): void {
    const id = randomUUID();
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write("\n");
    this.sseClients.set(id, { id, response });
    this.updateState({
      status: this.extension ? "connected" : "waiting",
      extensionConnected: Boolean(this.extension),
      registeredWorkspaceCount: this.registeredWorkspaces.size,
    });

    response.on("close", () => {
      this.sseClients.delete(id);
      this.updateState({
        status:
          this.sseClients.size > 0 || this.extension ? "connected" : "waiting",
        extensionConnected: this.sseClients.size > 0 || Boolean(this.extension),
        registeredWorkspaceCount: this.registeredWorkspaces.size,
      });
    });
  }

  private async getProfileCommandIds(
    projectId: string,
    profileId: string,
  ): Promise<string[]> {
    const project = await this.projectStore.getProject(projectId);
    const profile = project?.launchProfiles.find(
      (entry) => entry.id === profileId,
    );
    return profile?.commandIds ?? [];
  }

  private async getProjectStatus(workspacePath: string) {
    const normalizedWorkspace = normalizePath(workspacePath);
    let projects: Project[] = [];

    try {
      projects = await this.projectStore.getProjects();
    } catch {
      return {
        matched: false,
        project: null,
      };
    }

    const project = projects.find(
      (entry) => normalizePath(entry.path) === normalizedWorkspace,
    );

    return {
      matched: Boolean(project),
      project: project
        ? {
            id: project.id,
            name: project.name,
            path: project.path,
            launchProfiles: project.launchProfiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
              commandIds: profile.commandIds,
            })),
            commands: project.commands.map((command) => ({
              id: command.id,
              label: command.label,
              command: command.command,
              cwd: command.cwd,
            })),
          }
        : null,
    };
  }

  private handleEditorRunEvent(event: EditorRunEvent): void {
    const metadata = this.editorRunMetadata.get(event.jobId);
    const projectId = event.projectId ?? metadata?.projectId;

    if (!projectId) {
      throw new Error("Editor run event is missing a project id.");
    }

    const parsed = RunEventSchema.parse({
      runId: event.jobId,
      projectId,
      launchId: metadata?.launchId,
      profileId: metadata?.profileId,
      commandId: event.commandId ?? metadata?.commandId,
      kind: "status",
      status: mapEditorRunStatus(event.status),
      message: getEditorRunMessage(event),
      timestamp: event.timestamp ?? new Date().toISOString(),
      exitCode: event.exitCode,
      executionMode:
        metadata?.terminalLocation === "editor"
          ? "vscode-external"
          : "vscode-internal",
      managed: true,
    });

    this.events.emit("run-event", parsed);

    if (isFinalEditorRunStatus(event.status)) {
      this.editorRunMetadata.delete(event.jobId);
    }
  }

  private handleEditorRunOutputEvent(event: EditorRunOutputEvent): void {
    const metadata = this.editorRunMetadata.get(event.jobId);
    const projectId = event.projectId ?? metadata?.projectId;

    if (!projectId) {
      throw new Error("Editor output event is missing a project id.");
    }

    const parsed = RunEventSchema.parse({
      runId: event.jobId,
      projectId,
      launchId: metadata?.launchId,
      profileId: metadata?.profileId,
      commandId: event.commandId ?? metadata?.commandId,
      kind: event.kind,
      message: event.message,
      url: event.url,
      timestamp: event.timestamp ?? new Date().toISOString(),
      executionMode:
        metadata?.terminalLocation === "editor"
          ? "vscode-external"
          : "vscode-internal",
      managed: true,
    });

    this.events.emit("run-event", parsed);
  }

  private broadcast(event: ProjectoEvent): void {
    const parsed = ProjectoEventSchema.parse(event);
    const payload = `event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`;

    for (const client of this.sseClients.values()) {
      try {
        client.response.write(payload);
      } catch {
        this.sseClients.delete(client.id);
      }
    }
  }

  private updateState(patch: Partial<DesktopBridgeState>): void {
    const next = DesktopBridgeStateSchema.parse({
      ...this.state,
      ...patch,
      host: "127.0.0.1",
      protocolVersion: PROTOCOL_VERSION,
    });
    this.state = next;
    this.events.emit("state", next);
  }

  getDiscoveryHint(): string {
    const platform =
      process.platform === "win32"
        ? "Windows"
        : process.platform === "darwin"
          ? "macOS"
          : "Linux";
    return `Projecto bridge token is stored for ${platform} at ${this.authFilePath} on ${os.hostname()}.`;
  }

  private async stopBridge(): Promise<void> {
    for (const client of this.sseClients.values()) {
      try {
        client.response.end();
      } catch {
        // The extension may already have disconnected while the app is quitting.
      }
    }
    this.sseClients.clear();

    const server = this.server;
    this.server = null;

    if (server) {
      await new Promise<void>((resolve, reject) => {
        try {
          server.close((error?: Error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
          server.closeAllConnections?.();
          server.closeIdleConnections?.();
        } catch (error) {
          reject(error);
        }
      }).catch((error) => {
        const nodeError = error as NodeJS.ErrnoException;

        if (nodeError.code !== "ERR_SERVER_NOT_RUNNING") {
          throw error;
        }
      });
    }

    await this.fileSystemService.writeJsonAtomic(this.authFilePath, {
      protocolVersion: PROTOCOL_VERSION,
      host: "127.0.0.1",
      port: 0,
      token: this.token,
      updatedAt: new Date().toISOString(),
      stopped: true,
    });
    this.updateState({
      status: "stopped",
      port: undefined,
      extensionConnected: false,
      registeredWorkspaceCount: 0,
    });
  }
}
