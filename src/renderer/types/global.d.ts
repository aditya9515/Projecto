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
} from "../../main/types/shared";
declare global {
  interface Window {
    launchStack: {
      projects: {
        selectFolder: () => Promise<string | null>;
        scanFolder: (path: string) => Promise<DetectionResult>;
        scanWorkspace: (path: string) => Promise<BulkImportCandidate[]>;
        getProjects: () => Promise<Project[]>;
        getProject: (id: string) => Promise<Project | null>;
        createProject: (input: CreateProjectInput) => Promise<Project>;
        bulkImportProjects: (
          inputs: CreateProjectInput[],
        ) => Promise<Project[]>;
        updateProject: (
          id: string,
          patch: ProjectUpdateInput,
        ) => Promise<Project>;
        deleteProject: (id: string) => Promise<void>;
        toggleFavorite: (id: string) => Promise<Project>;
      };
      launcher: {
        openFolder: (path: string) => Promise<void>;
        openEditor: (projectId: string) => Promise<void>;
        launchProfile: (
          projectId: string,
          profileId: string,
          options?: {
            approvedCommandIds?: string[];
            dangerousOverride?: boolean;
          },
        ) => Promise<LaunchResult>;
        runCommand: (
          projectId: string,
          commandId: string,
          options?: {
            approvedCommandIds?: string[];
            dangerousOverride?: boolean;
          },
        ) => Promise<CommandRunResult>;
        openUrl: (url: string) => Promise<void>;
        stopRun: (runId: string) => Promise<boolean>;
        stopProjectTerminal: (projectId: string) => Promise<boolean>;
        revealProjectTerminal: (
          projectId: string,
        ) => Promise<ProjectTerminalSession | null>;
        getTerminalSessions: () => Promise<ProjectTerminalSession[]>;
        getBridgeState: () => Promise<DesktopBridgeState>;
        getCommandSafety: (
          projectId: string,
        ) => Promise<CommandSafetySummary[]>;
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
      insights: { getUsageStats: () => Promise<UsageStats> };
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
  }
}
export {};
