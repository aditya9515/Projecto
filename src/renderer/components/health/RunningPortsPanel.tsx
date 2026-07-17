import { ExternalLink, Network, RefreshCw, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProjectTerminalSession,
  RunningPort,
} from "../../../main/types/shared";
import { useAppStatusStore } from "../../store/useAppStatusStore";
import { useProjectsStore } from "../../store/useProjectsStore";
import { useToastStore } from "../../store/useToastStore";
import { getFriendlyErrorMessage } from "../../utils/errors";
import { Button } from "../common/Button";
import { PremiumCard } from "../common/PremiumCard";
import { StatusPill } from "../common/StatusPill";

type ProjectoPortEntry = {
  kind: "projecto";
  key: string;
  port: number;
  host: string;
  url?: string;
  source: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  runId?: string;
  status: ProjectTerminalSession["status"];
  processName?: string;
  pid?: number;
};

type OccupiedPortEntry = {
  kind: "occupied";
  key: string;
  port: number;
  host: string;
  state: string;
  processName?: string;
  pid?: number;
};

type RunningPortEntry = ProjectoPortEntry | OccupiedPortEntry;

const developerProcessNames = new Set([
  "node.exe",
  "python.exe",
  "pythonw.exe",
  "uvicorn.exe",
  "npm.exe",
  "pnpm.exe",
  "yarn.exe",
  "bun.exe",
  "deno.exe",
  "docker.exe",
  "java.exe",
  "dotnet.exe",
  "php.exe",
  "ruby.exe",
  "postgres.exe",
  "redis-server.exe",
  "mongod.exe",
]);

function isActiveSession(session: ProjectTerminalSession): boolean {
  return session.status === "running" || session.status === "ready";
}

function normalizeHost(host: string): string {
  if (host === "0.0.0.0" || host === "::" || host === "[::]") {
    return "all interfaces";
  }

  return host;
}

function isDeveloperPort(port: RunningPort): boolean {
  const processName = port.processName?.toLowerCase();

  return (
    (processName ? developerProcessNames.has(processName) : false) ||
    (port.port >= 3000 && port.port <= 3999) ||
    port.port === 4200 ||
    port.port === 5173 ||
    port.port === 5174 ||
    (port.port >= 5000 && port.port <= 5999) ||
    (port.port >= 8000 && port.port <= 8999) ||
    (port.port >= 9000 && port.port <= 9999) ||
    port.port === 11434 ||
    port.port === 27017 ||
    port.port === 5432 ||
    port.port === 6379 ||
    port.port === 3306
  );
}

function findSystemPort(
  ports: RunningPort[],
  host: string,
  port: number,
): RunningPort | undefined {
  return ports.find(
    (entry) =>
      entry.port === port &&
      (entry.localAddress === host ||
        entry.localAddress === "0.0.0.0" ||
        entry.localAddress === "::" ||
        host === "localhost" ||
        host === "127.0.0.1"),
  );
}

export function RunningPortsPanel(): JSX.Element {
  const terminalSessions = useAppStatusStore((state) => state.terminalSessions);
  const projects = useProjectsStore((state) => state.projects);
  const pushToast = useToastStore((state) => state.pushToast);
  const [systemPorts, setSystemPorts] = useState<RunningPort[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPorts = useCallback(
    async (showError = true): Promise<void> => {
      setLoading(true);
      try {
        setSystemPorts(await window.launchStack.diagnostics.getRunningPorts());
      } catch (error) {
        if (showError) {
          pushToast({
            title: "Ports unavailable",
            description: getFriendlyErrorMessage(
              error,
              "Projecto could not inspect listening ports on this device.",
            ),
            tone: "error",
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    void loadPorts();
    const interval = window.setInterval(() => {
      void loadPorts(false);
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [loadPorts]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const entries = useMemo<RunningPortEntry[]>(() => {
    const activeSessions = Object.values(terminalSessions).filter(
      isActiveSession,
    );
    const projectoEntries = activeSessions.flatMap((session) => {
      const project = projectById.get(session.projectId);
      const seen = new Set<string>();

      return session.detectedPorts.flatMap<ProjectoPortEntry>((port) => {
        if (port.source === "configured") {
          return [];
        }

        const key = `${session.projectId}:${port.host}:${port.port}:${port.url ?? ""}`;
        if (seen.has(key)) {
          return [];
        }
        seen.add(key);

        const systemPort = findSystemPort(systemPorts, port.host, port.port);
        return [
          {
            kind: "projecto",
            key,
            port: port.port,
            host: normalizeHost(port.host),
            url: port.url,
            source: port.source,
            projectId: session.projectId,
            projectName: project?.name ?? session.projectName,
            projectPath: project?.path ?? session.projectPath,
            runId: port.runId ?? session.activeRunId,
            status: session.status,
            processName: systemPort?.processName,
            pid: systemPort?.pid,
          },
        ];
      });
    });
    const projectoPorts = new Set(projectoEntries.map((entry) => entry.port));
    const occupiedEntries = systemPorts
      .filter((port) => !projectoPorts.has(port.port) && isDeveloperPort(port))
      .map<OccupiedPortEntry>((port) => ({
        kind: "occupied",
        key: `occupied:${port.localAddress}:${port.port}:${port.pid ?? ""}`,
        port: port.port,
        host: normalizeHost(port.localAddress),
        state: port.state,
        processName: port.processName,
        pid: port.pid,
      }));

    return [...projectoEntries, ...occupiedEntries].sort(
      (left, right) => left.port - right.port || left.host.localeCompare(right.host),
    );
  }, [projectById, systemPorts, terminalSessions]);

  async function revealTerminal(projectId: string): Promise<void> {
    try {
      await window.launchStack.launcher.revealProjectTerminal(projectId);
      pushToast({
        title: "Mapped terminal",
        description: "Opening the terminal for this project.",
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Mapped terminal unavailable",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not open the mapped terminal for this project.",
        ),
        tone: "error",
      });
    }
  }

  return (
    <PremiumCard className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="app-icon-surface flex h-10 w-10 items-center justify-center rounded-2xl text-text">
              <Network className="h-4 w-4" />
            </div>
            <div>
              <div className="text-lg font-semibold text-text">
                Ports
              </div>
              <p className="mt-1 text-sm leading-6 text-muted">
                Projecto app ports and developer ports on this device.
              </p>
            </div>
          </div>
        </div>
        <Button onClick={() => void loadPorts()} variant="secondary">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div
              className="rounded-2xl border border-line bg-shell px-4 py-3"
              key={entry.key}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-mono text-sm font-semibold text-text">
                      {entry.host}:{entry.port}
                    </div>
                    <StatusPill tone={entry.kind === "projecto" ? "success" : "neutral"}>
                      {entry.kind === "projecto" ? "Projecto" : "Occupied"}
                    </StatusPill>
                    {entry.kind === "projecto" ? (
                      <StatusPill tone={entry.status === "ready" ? "success" : "warning"}>
                        {entry.status}
                      </StatusPill>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    {entry.kind === "projecto"
                      ? `${entry.projectName} - ${entry.source}${entry.url ? ` - ${entry.url}` : ""}`
                      : `${entry.processName ?? "Unknown process"}${entry.pid ? ` - PID ${entry.pid}` : ""} - ${entry.state}`}
                  </div>
                  {entry.kind === "projecto" ? (
                    <div className="mt-1 truncate text-xs text-muted" title={entry.projectPath}>
                      {entry.projectPath}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.kind === "projecto" && entry.url ? (
                    <Button
                      onClick={() => void window.launchStack.launcher.openUrl(entry.url!)}
                      variant="ghost"
                    >
                      <ExternalLink className="h-4 w-4" /> URL
                    </Button>
                  ) : null}
                  {entry.kind === "projecto" ? (
                    <Button
                      onClick={() => void revealTerminal(entry.projectId)}
                      variant="secondary"
                    >
                      <TerminalSquare className="h-4 w-4" /> Mapped Terminal
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
            No active developer ports found.
          </div>
        )}
      </div>
    </PremiumCard>
  );
}
