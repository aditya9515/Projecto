import { contextBridge, ipcRenderer } from "electron";

import type {
  AppSettings,
  AppSettingsUpdate,
  BillingEvent,
  BulkImportCandidate,
  CommandRunResult,
  CreateProjectInput,
  DetectionResult,
  DesktopBridgeState,
  DesktopUpdateCheckOptions,
  DesktopUpdateState,
  DiagnosticCheckResult,
  DiagnosticsReport,
  CommandSafetySummary,
  ExportRunLogsInput,
  LaunchResult,
  Project,
  ProjectTerminalSession,
  ProjectUpdateInput,
  RunningPort,
  RunEvent,
  SubscriptionState,
  UsageStats,
} from "../main/types/shared";

type LaunchStackApi = {
  projects: {
    selectFolder: () => Promise<string | null>;
    scanFolder: (path: string) => Promise<DetectionResult>;
    scanWorkspace: (path: string) => Promise<BulkImportCandidate[]>;
    getProjects: () => Promise<Project[]>;
    getProject: (id: string) => Promise<Project | null>;
    createProject: (input: CreateProjectInput) => Promise<Project>;
    bulkImportProjects: (inputs: CreateProjectInput[]) => Promise<Project[]>;
    updateProject: (id: string, patch: ProjectUpdateInput) => Promise<Project>;
    deleteProject: (id: string) => Promise<void>;
    toggleFavorite: (id: string) => Promise<Project>;
  };
  launcher: {
    openFolder: (path: string) => Promise<void>;
    openEditor: (projectId: string) => Promise<void>;
    launchProfile: (
      projectId: string,
      profileId: string,
      options?: { approvedCommandIds?: string[]; dangerousOverride?: boolean },
    ) => Promise<LaunchResult>;
    runCommand: (
      projectId: string,
      commandId: string,
      options?: { approvedCommandIds?: string[]; dangerousOverride?: boolean },
    ) => Promise<CommandRunResult>;
    openUrl: (url: string) => Promise<void>;
    stopRun: (runId: string) => Promise<boolean>;
    stopProjectTerminal: (projectId: string) => Promise<boolean>;
    revealProjectTerminal: (
      projectId: string,
    ) => Promise<ProjectTerminalSession | null>;
    getTerminalSessions: () => Promise<ProjectTerminalSession[]>;
    getBridgeState: () => Promise<DesktopBridgeState>;
    getCommandSafety: (projectId: string) => Promise<CommandSafetySummary[]>;
    exportRunLogs: (input: ExportRunLogsInput) => Promise<void>;
    onRunEvent: (listener: (event: RunEvent) => void) => () => void;
    onTerminalSession: (
      listener: (session: ProjectTerminalSession) => void,
    ) => () => void;
    onBridgeState: (
      listener: (state: DesktopBridgeState) => void,
    ) => () => void;
  };
  settings: {
    getSettings: () => Promise<AppSettings>;
    updateSettings: (patch: AppSettingsUpdate) => Promise<AppSettings>;
  };
  billing: {
    getSubscriptionState: () => Promise<SubscriptionState>;
    openUpgradePage: () => Promise<void>;
    startGoogleSignIn: () => Promise<void>;
    refreshSubscription: () => Promise<SubscriptionState>;
    onBillingEvent: (listener: (event: BillingEvent) => void) => () => void;
  };
  insights: {
    getUsageStats: () => Promise<UsageStats>;
  };
  diagnostics: {
    getReport: () => Promise<DiagnosticsReport>;
    getRunningPorts: () => Promise<RunningPort[]>;
    exportReport: () => Promise<void>;
    copyReport: () => Promise<void>;
    openAppDataFolder: () => Promise<void>;
    testEditor: () => Promise<DiagnosticCheckResult>;
    testTerminal: () => Promise<DiagnosticCheckResult>;
    resetCommandApprovals: () => Promise<void>;
  };
  updates: {
    getState: () => Promise<DesktopUpdateState>;
    check: (
      options?: DesktopUpdateCheckOptions,
    ) => Promise<DesktopUpdateState>;
    install: () => Promise<DesktopUpdateState>;
    onState: (listener: (state: DesktopUpdateState) => void) => () => void;
  };
};

const api: LaunchStackApi = {
  projects: {
    selectFolder: () => ipcRenderer.invoke("projects:selectFolder"),
    scanFolder: (path) => ipcRenderer.invoke("projects:scanFolder", path),
    scanWorkspace: (path) => ipcRenderer.invoke("projects:scanWorkspace", path),
    getProjects: () => ipcRenderer.invoke("projects:getProjects"),
    getProject: (id) => ipcRenderer.invoke("projects:getProject", id),
    createProject: (input) =>
      ipcRenderer.invoke("projects:createProject", input),
    bulkImportProjects: (inputs) =>
      ipcRenderer.invoke("projects:bulkImportProjects", inputs),
    updateProject: (id, patch) =>
      ipcRenderer.invoke("projects:updateProject", id, patch),
    deleteProject: (id) => ipcRenderer.invoke("projects:deleteProject", id),
    toggleFavorite: (id) => ipcRenderer.invoke("projects:toggleFavorite", id),
  },
  launcher: {
    openFolder: (path) => ipcRenderer.invoke("launcher:openFolder", path),
    openEditor: (projectId) =>
      ipcRenderer.invoke("launcher:openEditor", projectId),
    launchProfile: (projectId, profileId, options) =>
      ipcRenderer.invoke(
        "launcher:launchProfile",
        projectId,
        profileId,
        options,
      ),
    runCommand: (projectId, commandId, options) =>
      ipcRenderer.invoke("launcher:runCommand", projectId, commandId, options),
    openUrl: (url) => ipcRenderer.invoke("launcher:openUrl", url),
    stopRun: (runId) => ipcRenderer.invoke("launcher:stopRun", runId),
    stopProjectTerminal: (projectId) =>
      ipcRenderer.invoke("launcher:stopProjectTerminal", projectId),
    revealProjectTerminal: (projectId) =>
      ipcRenderer.invoke("launcher:revealProjectTerminal", projectId),
    getTerminalSessions: () =>
      ipcRenderer.invoke("launcher:getTerminalSessions"),
    getBridgeState: () => ipcRenderer.invoke("launcher:getBridgeState"),
    getCommandSafety: (projectId) =>
      ipcRenderer.invoke("launcher:getCommandSafety", projectId),
    exportRunLogs: (input) =>
      ipcRenderer.invoke("launcher:exportRunLogs", input),
    onRunEvent: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: RunEvent,
      ) => {
        listener(payload);
      };

      ipcRenderer.on("launcher:run-event", wrapped);

      return () => {
        ipcRenderer.removeListener("launcher:run-event", wrapped);
      };
    },
    onTerminalSession: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: ProjectTerminalSession,
      ) => {
        listener(payload);
      };

      ipcRenderer.on("launcher:terminal-session", wrapped);

      return () => {
        ipcRenderer.removeListener("launcher:terminal-session", wrapped);
      };
    },
    onBridgeState: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: DesktopBridgeState,
      ) => {
        listener(payload);
      };

      ipcRenderer.on("launcher:bridge-state", wrapped);

      return () => {
        ipcRenderer.removeListener("launcher:bridge-state", wrapped);
      };
    },
  },
  settings: {
    getSettings: () => ipcRenderer.invoke("settings:getSettings"),
    updateSettings: (patch) =>
      ipcRenderer.invoke("settings:updateSettings", patch),
  },
  billing: {
    getSubscriptionState: () =>
      ipcRenderer.invoke("billing:getSubscriptionState"),
    openUpgradePage: () => ipcRenderer.invoke("billing:openUpgradePage"),
    startGoogleSignIn: () => ipcRenderer.invoke("billing:startGoogleSignIn"),
    refreshSubscription: () =>
      ipcRenderer.invoke("billing:refreshSubscription"),
    onBillingEvent: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: BillingEvent,
      ) => {
        listener(payload);
      };

      ipcRenderer.on("billing:event", wrapped);

      return () => {
        ipcRenderer.removeListener("billing:event", wrapped);
      };
    },
  },
  insights: {
    getUsageStats: () => ipcRenderer.invoke("insights:getUsageStats"),
  },
  diagnostics: {
    getReport: () => ipcRenderer.invoke("diagnostics:getReport"),
    getRunningPorts: () =>
      ipcRenderer.invoke("diagnostics:getRunningPorts"),
    exportReport: () => ipcRenderer.invoke("diagnostics:exportReport"),
    copyReport: () => ipcRenderer.invoke("diagnostics:copyReport"),
    openAppDataFolder: () =>
      ipcRenderer.invoke("diagnostics:openAppDataFolder"),
    testEditor: () => ipcRenderer.invoke("diagnostics:testEditor"),
    testTerminal: () => ipcRenderer.invoke("diagnostics:testTerminal"),
    resetCommandApprovals: () =>
      ipcRenderer.invoke("diagnostics:resetCommandApprovals"),
  },
  updates: {
    getState: () => ipcRenderer.invoke("updates:getState"),
    check: (options) => ipcRenderer.invoke("updates:check", options),
    install: () => ipcRenderer.invoke("updates:install"),
    onState: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: DesktopUpdateState,
      ) => {
        listener(payload);
      };

      ipcRenderer.on("updates:state", wrapped);

      return () => {
        ipcRenderer.removeListener("updates:state", wrapped);
      };
    },
  },
};

contextBridge.exposeInMainWorld("launchStack", api);
