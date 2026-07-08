import { create } from "zustand";
import type {
  ProjectLaunchPort,
  RunEvent,
  RunStatus,
} from "../../main/types/shared";
type RunLog = {
  runId: string;
  status: RunStatus;
  title: string;
  projectId: string;
  profileId?: string;
  commandId?: string;
  executionMode?: RunEvent["executionMode"];
  managed?: boolean;
  detectedUrls: string[];
  detectedPorts: ProjectLaunchPort[];
  startedAt: string;
  completedAt?: string;
  exitCode?: number | null;
  events: RunEvent[];
  updatedAt: string;
};
type RunLogFilter = "all" | "active" | "completed" | "failed" | "stopped";
type LogsState = {
  runs: Record<string, RunLog>;
  order: string[];
  isOpen: boolean;
  activeRunId: string | null;
  filter: RunLogFilter;
  pushEvent: (event: RunEvent) => void;
  clearAll: () => void;
  clearRun: (runId: string) => void;
  toggleOpen: () => void;
  setActiveRun: (runId: string) => void;
  setFilter: (filter: RunLogFilter) => void;
};
function getRunTitle(event: RunEvent): string {
  if (event.kind === "status" && event.message.trim().length > 0) {
    return event.message.replace(/^Queued\s+/i, "");
  }
  return event.commandId ?? "Command run";
}
function buildPortFromUrl(event: RunEvent): ProjectLaunchPort | null {
  if (!event.url) {
    return null;
  }

  try {
    const parsed = new URL(event.url);
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : parsed.protocol === "http:"
          ? 80
          : undefined;

    if (!port || !Number.isInteger(port) || port < 1 || port > 65_535) {
      return null;
    }

    return {
      projectId: event.projectId,
      runId: event.runId,
      host: parsed.hostname.toLowerCase(),
      port,
      url: event.url,
      source: "generic",
      detectedAt: event.timestamp,
    };
  } catch {
    return null;
  }
}
function buildPortFromRemap(event: RunEvent): ProjectLaunchPort | null {
  if (!event.toPort) {
    return null;
  }

  const port = Number(event.toPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return null;
  }

  return {
    projectId: event.projectId,
    runId: event.runId,
    host: "localhost",
    port,
    url: `http://localhost:${port}/`,
    source: "port-remap",
    detectedAt: event.timestamp,
  };
}
function mergePorts(
  current: ProjectLaunchPort[],
  next: Array<ProjectLaunchPort | null>,
): ProjectLaunchPort[] {
  const ports = new Map<string, ProjectLaunchPort>();

  for (const port of [...current, ...next]) {
    if (!port) {
      continue;
    }

    ports.set(
      [
        port.projectId,
        port.runId ?? "",
        port.host.toLowerCase(),
        port.port,
        port.url ?? "",
        port.source,
      ].join(":"),
      port,
    );
  }

  return [...ports.values()];
}
export const useLogsStore = create<LogsState>((set) => ({
  runs: {},
  order: [],
  isOpen: false,
  activeRunId: null,
  filter: "all",
  pushEvent: (event) => {
    set((state) => {
      const current = state.runs[event.runId];
      const completed =
        event.status === "completed" ||
        event.status === "failed" ||
        event.status === "stopped";
      const detectedUrls =
        event.kind === "url-detected" && event.url
          ? [...new Set([...(current?.detectedUrls ?? []), event.url])]
          : (current?.detectedUrls ?? []);
      const detectedPorts =
        event.kind === "url-detected"
          ? mergePorts(current?.detectedPorts ?? [], [buildPortFromUrl(event)])
          : event.kind === "port-remapped" && event.toPort
            ? mergePorts(current?.detectedPorts ?? [], [
                buildPortFromRemap(event),
              ])
            : (current?.detectedPorts ?? []);
      const nextEntry: RunLog = current
        ? {
            ...current,
            projectId: event.projectId,
            profileId: event.profileId ?? current.profileId,
            commandId: event.commandId ?? current.commandId,
            executionMode: event.executionMode ?? current.executionMode,
            managed: event.managed ?? current.managed,
            status: event.status ?? current.status,
            detectedUrls,
            detectedPorts,
            completedAt: completed ? event.timestamp : current.completedAt,
            exitCode: event.exitCode ?? current.exitCode,
            events: [...current.events, event],
            updatedAt: event.timestamp,
          }
        : {
            runId: event.runId,
            projectId: event.projectId,
            profileId: event.profileId,
            commandId: event.commandId,
            executionMode: event.executionMode,
            managed: event.managed,
            detectedUrls,
            detectedPorts,
            status: event.status ?? "started",
            title: getRunTitle(event),
            startedAt: event.timestamp,
            completedAt: completed ? event.timestamp : undefined,
            exitCode: event.exitCode,
            events: [event],
            updatedAt: event.timestamp,
          };
      return {
        runs: { ...state.runs, [event.runId]: nextEntry },
        order: [
          event.runId,
          ...state.order.filter((runId) => runId !== event.runId),
        ].slice(0, 18),
        isOpen: state.isOpen,
        activeRunId: state.activeRunId ?? event.runId,
      };
    });
  },
  clearAll: () => {
    set({ runs: {}, order: [], activeRunId: null });
  },
  clearRun: (runId) => {
    set((state) => {
      const nextRuns = { ...state.runs };
      delete nextRuns[runId];
      const nextOrder = state.order.filter((entry) => entry !== runId);
      return {
        runs: nextRuns,
        order: nextOrder,
        activeRunId:
          state.activeRunId === runId
            ? (nextOrder[0] ?? null)
            : state.activeRunId,
      };
    });
  },
  toggleOpen: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },
  setActiveRun: (runId) => {
    set({ activeRunId: runId });
  },
  setFilter: (filter) => {
    set({ filter });
  },
}));
export type { RunLog, RunLogFilter };
