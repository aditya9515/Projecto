import { z } from "zod";

export declare const PROTOCOL_VERSION: "0.1.0";

export type DesktopPlatform = "windows" | "macos" | "linux";
export type BridgeConnectionStatus = "connected" | "disconnected";
export type ProjectoCommandType =
  | "OPEN_PROJECT"
  | "RUN_PROFILE"
  | "RUN_COMMAND"
  | "REGISTER_WORKSPACE"
  | "GET_PROJECT_STATUS"
  | "OPEN_EDITOR_TERMINAL"
  | "OPEN_PROJECTO_APP";
export type ProjectoEventType =
  | "BRIDGE_READY"
  | "EXTENSION_REGISTERED"
  | "WORKSPACE_REGISTERED"
  | "PROJECT_STATUS"
  | "RUN_REQUESTED"
  | "RUN_COMMAND_IN_EDITOR"
  | "STOP_RUN_IN_EDITOR"
  | "REVEAL_EDITOR_TERMINAL"
  | "RUN_STATUS"
  | "ERROR";

export type BridgeAuthState = {
  protocolVersion: typeof PROTOCOL_VERSION;
  host: "127.0.0.1";
  port: number;
  token: string;
  updatedAt: string;
};

export type ExtensionRegistration = {
  protocolVersion: string;
  extensionId: string;
  extensionVersion: string;
  editorName: string;
  editorVersion?: string;
  machineName?: string;
  workspacePaths?: string[];
};

export type WorkspaceRegistration = {
  protocolVersion: string;
  extensionId: string;
  editorName: string;
  workspacePath: string;
};

export type ProjectStatusRequest = {
  workspacePath: string;
};

export type LaunchProfileSummary = {
  id: string;
  name: string;
  commandIds?: string[];
};

export type LaunchCommandSummary = {
  id: string;
  label: string;
  command: string;
  cwd: string;
};

export type ProjectStatusResponse = {
  matched: boolean;
  project: {
    id: string;
    name: string;
    path: string;
    launchProfiles?: LaunchProfileSummary[];
    commands?: LaunchCommandSummary[];
  } | null;
};

export type RunProfileRequest = {
  projectId: string;
  profileId: string;
  source?: "desktop" | "extension";
};

export type RunCommandRequest = {
  projectId: string;
  commandId: string;
  source?: "desktop" | "extension";
};

export type EditorTerminalLocation = "panel" | "editor";

export type EditorTerminalCommand = {
  jobId: string;
  projectId: string;
  projectName: string;
  workspacePath: string;
  commandId: string;
  label: string;
  command: string;
  cwd: string;
  terminalLocation?: EditorTerminalLocation;
};

export type EditorRunStatus =
  | "accepted"
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "terminal_closed";

export type EditorRunEvent = {
  jobId: string;
  projectId?: string;
  commandId?: string;
  status: EditorRunStatus;
  message?: string;
  exitCode?: number | null;
  timestamp?: string;
};

export type EditorRunOutputKind = "stdout" | "stderr" | "url-detected";

export type EditorRunOutputEvent = {
  jobId: string;
  projectId?: string;
  commandId?: string;
  kind: EditorRunOutputKind;
  message: string;
  url?: string;
  timestamp?: string;
};

export type ProjectoCommand =
  | { type: "OPEN_PROJECT"; projectId: string }
  | { type: "RUN_PROFILE"; projectId: string; profileId: string }
  | { type: "RUN_COMMAND"; projectId: string; commandId: string }
  | { type: "REGISTER_WORKSPACE"; workspacePath: string; editor: string }
  | { type: "GET_PROJECT_STATUS"; workspacePath: string }
  | { type: "OPEN_EDITOR_TERMINAL"; projectId: string }
  | { type: "OPEN_PROJECTO_APP" };

export type ProjectoEvent =
  | {
      type: "BRIDGE_READY";
      protocolVersion: string;
      port: number;
      timestamp: string;
    }
  | {
      type: "EXTENSION_REGISTERED";
      extensionId: string;
      editorName: string;
      timestamp: string;
    }
  | {
      type: "WORKSPACE_REGISTERED";
      extensionId: string;
      workspacePath: string;
      timestamp: string;
    }
  | {
      type: "PROJECT_STATUS";
      workspacePath: string;
      status: ProjectStatusResponse;
      timestamp: string;
    }
  | {
      type: "RUN_REQUESTED";
      projectId: string;
      profileId?: string;
      commandId?: string;
      timestamp: string;
    }
  | {
      type: "RUN_COMMAND_IN_EDITOR";
      payload: EditorTerminalCommand;
      timestamp: string;
    }
  | {
      type: "STOP_RUN_IN_EDITOR";
      payload: { jobId: string };
      timestamp: string;
    }
  | {
      type: "REVEAL_EDITOR_TERMINAL";
      payload: { projectId: string; workspacePath: string; jobId?: string };
      timestamp: string;
    }
  | {
      type: "RUN_STATUS";
      runId: string;
      status: "queued" | "running" | "completed" | "failed" | "stopped";
      message?: string;
      timestamp: string;
    }
  | {
      type: "ERROR";
      message: string;
      code?: string;
      timestamp: string;
    };

export declare const DesktopPlatformSchema: z.ZodType<DesktopPlatform>;
export declare const BridgeConnectionStatusSchema: z.ZodType<BridgeConnectionStatus>;
export declare const ProjectoCommandTypeSchema: z.ZodType<ProjectoCommandType>;
export declare const ProjectoEventTypeSchema: z.ZodType<ProjectoEventType>;
export declare const BridgeAuthStateSchema: z.ZodType<BridgeAuthState>;
export declare const ExtensionRegistrationSchema: z.ZodType<ExtensionRegistration>;
export declare const WorkspaceRegistrationSchema: z.ZodType<WorkspaceRegistration>;
export declare const ProjectStatusRequestSchema: z.ZodType<ProjectStatusRequest>;
export declare const LaunchProfileSummarySchema: z.ZodType<LaunchProfileSummary>;
export declare const LaunchCommandSummarySchema: z.ZodType<LaunchCommandSummary>;
export declare const ProjectStatusResponseSchema: z.ZodType<ProjectStatusResponse>;
export declare const RunProfileRequestSchema: z.ZodType<RunProfileRequest>;
export declare const RunCommandRequestSchema: z.ZodType<RunCommandRequest>;
export declare const EditorTerminalLocationSchema: z.ZodType<EditorTerminalLocation>;
export declare const EditorTerminalCommandSchema: z.ZodType<EditorTerminalCommand>;
export declare const EditorRunStatusSchema: z.ZodType<EditorRunStatus>;
export declare const EditorRunEventSchema: z.ZodType<EditorRunEvent>;
export declare const EditorRunOutputKindSchema: z.ZodType<EditorRunOutputKind>;
export declare const EditorRunOutputEventSchema: z.ZodType<EditorRunOutputEvent>;
export declare const ProjectoCommandSchema: z.ZodType<ProjectoCommand>;
export declare const ProjectoEventSchema: z.ZodType<ProjectoEvent>;
export declare const BridgeHealthResponseSchema: z.ZodType<{
  ok: true;
  protocolVersion: string;
  extensionConnected: boolean;
  registeredWorkspaceCount: number;
  uptimeSeconds: number;
}>;