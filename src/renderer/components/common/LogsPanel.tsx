import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronsDownUp,
  Clipboard,
  Download,
  ExternalLink,
  FolderOpen,
  Play,
  Square,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLogsStore } from "../../store/useLogsStore";
import type { RunLog, RunLogFilter } from "../../store/useLogsStore";
import { useProjectsStore } from "../../store/useProjectsStore";
import { useToastStore } from "../../store/useToastStore";
import { RunStatusBadge } from "../launch/RunStatusBadge";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { cn } from "../../utils/cn";
import { handleMappedLaunchError } from "../../utils/launchErrorHandlers";
import {
  formatTerminalControlLabel,
  formatTerminalStrategyLabel,
} from "../../utils/terminalSessions";
const filters: Array<{ label: string; value: RunLogFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Stopped", value: "stopped" },
];
type OutputFilter =
  | "all"
  | "stdout"
  | "stderr"
  | "system"
  | "url-detected"
  | "port-remapped"
  | "already-running";
const outputFilters: Array<{ label: string; value: OutputFilter }> = [
  { label: "All output", value: "all" },
  { label: "stdout", value: "stdout" },
  { label: "stderr", value: "stderr" },
  { label: "system", value: "system" },
  { label: "URLs", value: "url-detected" },
  { label: "Ports", value: "port-remapped" },
  { label: "Already running", value: "already-running" },
];
function isActiveRun(run: RunLog): boolean {
  return (
    run.status === "started" ||
    run.status === "running" ||
    run.status === "spawned" ||
    run.status === "ready"
  );
}
function getStopButtonLabel(): string {
  return "Stop Project";
}
function getModeLabel(run: RunLog): string {
  return formatTerminalStrategyLabel({ terminalStrategy: run.executionMode });
}
function getControlLabel(run: RunLog): string {
  return formatTerminalControlLabel(run.executionMode, run.managed);
}
function getExitCodeLabel(run: RunLog): string {
  if (run.exitCode !== undefined) {
    return String(run.exitCode ?? "unknown");
  }
  return isActiveRun(run) ? "Running" : "Process";
}
function getRunEventTextClass(event: RunLog["events"][number]): string {
  if (event.kind === "url-detected") {
    return "text-text";
  }
  if (event.kind === "port-remapped") {
    return "text-accent";
  }
  if (event.kind === "already-running") {
    return "text-text";
  }
  if (event.kind === "stderr") {
    return "text-text";
  }
  if (event.kind === "stdout") {
    return "text-text";
  }
  if (event.status === "failed") {
    return "text-text";
  }
  if (event.status === "completed") {
    return "text-text";
  }
  return "text-text";
}
function runMatchesFilter(run: RunLog, filter: RunLogFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "active") {
    return isActiveRun(run);
  }
  return run.status === filter;
}
function formatDuration(run: RunLog): string {
  const end = run.completedAt ? Date.parse(run.completedAt) : Date.now();
  const start = Date.parse(run.startedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "Unknown duration";
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
function buildRunLogText(run: RunLog): string {
  return run.events
    .map((event) => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const kind = event.kind.toUpperCase();
      return `[${time}] ${kind}${event.status ? `:${event.status}` : ""} ${event.message}`;
    })
    .join("\n");
}
export function LogsPanel(): JSX.Element {
  const navigate = useNavigate();
  const [outputFilter, setOutputFilter] = useState<OutputFilter>("all");
  const runs = useLogsStore((state) => state.runs);
  const order = useLogsStore((state) => state.order);
  const isOpen = useLogsStore((state) => state.isOpen);
  const activeRunId = useLogsStore((state) => state.activeRunId);
  const filter = useLogsStore((state) => state.filter);
  const clearAll = useLogsStore((state) => state.clearAll);
  const clearRun = useLogsStore((state) => state.clearRun);
  const toggleOpen = useLogsStore((state) => state.toggleOpen);
  const setActiveRun = useLogsStore((state) => state.setActiveRun);
  const setFilter = useLogsStore((state) => state.setFilter);
  const projects = useProjectsStore((state) => state.projects);
  const pushToast = useToastStore((state) => state.pushToast);
  const activeRun = activeRunId ? runs[activeRunId] : undefined;
  const canStopActiveRun = activeRun ? isActiveRun(activeRun) : false;
  const visibleOrder = order.filter((runId) => {
    const run = runs[runId];
    return run ? runMatchesFilter(run, filter) : false;
  });
  const activeRunProject = activeRun
    ? projects.find((project) => project.id === activeRun.projectId)
    : undefined;
  const activeRunCommand =
    activeRunProject && activeRun?.commandId
      ? activeRunProject.commands.find(
          (command) => command.id === activeRun.commandId,
        )
      : undefined;
  const activeRunEvents = activeRun
    ? activeRun.events.filter((event) =>
        outputFilter === "all" ? true : event.kind === outputFilter,
      )
    : [];
  const alreadyRunningEvent = activeRun?.events.find(
    (event) => event.kind === "already-running",
  );
  const portRemapEvents =
    activeRun?.events.filter((event) => event.kind === "port-remapped") ?? [];
  const latestRun = order.map((runId) => runs[runId]).find(Boolean);
  const latestUrl = latestRun?.detectedUrls[0];
  const latestPort = latestRun?.detectedPorts[0];
  function handleActiveRunStop(): void {
    if (!activeRun) {
      return;
    }
    if (activeRunProject) {
      void window.launchStack.launcher
        .stopProjectTerminal(activeRunProject.id)
        .then(() => {
          pushToast({
            title: "Stopping project",
            description: "Projecto is stopping the background process.",
            tone: "info",
          });
        })
        .catch((error) => {
          pushToast({
            title: "Unable to stop project",
            description:
              error instanceof Error
                ? error.message
                : "Unknown project stop error.",
            tone: "error",
          });
        });
      return;
    }
    void window.launchStack.launcher.stopRun(activeRun.runId);
  }
  return (
    <motion.div
      className="relative z-30 h-14 shrink-0 overflow-visible border-t border-line bg-bg"
      initial={false}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {" "}
      <div className="app-shell-surface flex h-14 items-center justify-between px-5">
        {" "}
        <div className="flex items-center gap-3">
          {" "}
          <div className="app-icon-surface flex h-9 w-9 items-center justify-center rounded-xl text-text">
            {" "}
            <TerminalSquare className="h-4 w-4" />{" "}
          </div>{" "}
          <div>
            {" "}
            <div className="text-sm font-semibold text-text">
              Active Runs
            </div>{" "}
            <div className="text-xs text-muted">
              {" "}
              {order.length === 0
                ? "No command activity yet"
                : latestUrl
                  ? `Latest URL: ${latestUrl}`
                  : latestPort
                    ? `Latest port: ${latestPort.host}:${latestPort.port}`
                  : `${order.length} recent run${order.length === 1 ? "" : "s"}`}{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        <div className="flex items-center gap-2">
          {" "}
          <Button onClick={clearAll} variant="ghost">
            {" "}
            <Trash2 className="h-4 w-4" /> Clear{" "}
          </Button>{" "}
          <Button onClick={toggleOpen} variant="ghost">
            {" "}
            <ChevronsDownUp className="h-4 w-4" />{" "}
            {isOpen ? "Collapse" : "Expand"}{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
      {isOpen ? (
        <motion.div
          animate={{ y: 0 }}
          className="app-shell-surface absolute bottom-14 left-0 right-0 grid h-[384px] grid-cols-[320px_minmax(0,1fr)] gap-0 overflow-hidden border-t border-line"
          initial={{ y: 12 }}
          transition={{ duration: 0.2 }}
        >
          {" "}
          <div className="min-h-0 border-r border-line p-3">
            {" "}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {" "}
              {filters.map((entry) => (
                <button
                  className={cn(
                    "rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition",
                    filter === entry.value
                      ? "app-control-selected"
                      : "app-control-surface",
                  )}
                  key={entry.value}
                  onClick={() => setFilter(entry.value)}
                  type="button"
                >
                  {" "}
                  {entry.label}{" "}
                </button>
              ))}{" "}
            </div>{" "}
            <div className="max-h-[322px] space-y-2 overflow-y-auto pr-1">
              {" "}
              {visibleOrder.length === 0 ? (
                <EmptyState
                  description="Triggered commands and launch profiles will stream their logs here."
                  title="Logs will appear here"
                />
              ) : (
                visibleOrder.map((runId) => {
                  const run = runs[runId];
                  const project = projects.find(
                    (entry) => entry.id === run?.projectId,
                  );
                  if (!run) {
                    return null;
                  }
                  return (
                    <motion.button
                      className={cn(
                        "w-full rounded-2xl border px-3.5 py-3 text-left transition duration-150 ease-premium",
                        activeRunId === runId
                          ? "app-choice-selected"
                          : "app-control-surface",
                      )}
                      key={runId}
                      onClick={() => setActiveRun(runId)}
                      type="button"
                      whileHover={{ y: -1 }}
                    >
                      {" "}
                      <div className="flex items-start justify-between gap-2">
                        {" "}
                        <div className="min-w-0">
                          {" "}
                          <div className="truncate text-sm font-semibold text-text">
                            {run.title}
                          </div>{" "}
                          <div className="mt-1 truncate text-xs text-muted">
                            {project?.name ?? "Unknown project"} -{" "}
                            {formatDuration(run)}
                          </div>{" "}
                        </div>{" "}
                        <RunStatusBadge status={run.status} />{" "}
                      </div>{" "}
                    </motion.button>
                  );
                })
              )}{" "}
            </div>{" "}
          </div>{" "}
          <div className="flex h-full min-h-0 flex-col">
            {" "}
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              {" "}
              <div>
                {" "}
                <div className="text-sm font-semibold text-text">
                  {activeRun?.title ?? "Select a run"}
                </div>{" "}
                {activeRun ? (
                  <div className="mt-1 text-xs text-muted">
                    {" "}
                    {activeRunProject?.name ?? activeRun.projectId} -{" "}
                    {formatDuration(activeRun)}{" "}
                  </div>
                ) : null}{" "}
              </div>{" "}
              {activeRun ? (
                <div className="flex items-center gap-2">
                  {" "}
                  {canStopActiveRun ? (
                    <Button onClick={handleActiveRunStop} variant="secondary">
                      {" "}
                      <Square className="h-4 w-4" />{" "}
                      {getStopButtonLabel()}{" "}
                    </Button>
                  ) : null}{" "}
                  {activeRunProject ? (
                    <Button
                      onClick={() =>
                        navigate(`/projects/${activeRunProject.id}`)
                      }
                      variant="secondary"
                    >
                      {" "}
                      <FolderOpen className="h-4 w-4" /> Project{" "}
                    </Button>
                  ) : null}{" "}
                  {activeRunProject &&
                  (activeRun.profileId || activeRun.commandId) ? (
                    <Button
                      onClick={() => {
                        if (!activeRunProject) {
                          return;
                        }
                        void (async () => {
                          try {
                            if (activeRun.profileId) {
                              await window.launchStack.launcher.launchProfile(
                                activeRunProject.id,
                                activeRun.profileId,
                              );
                            } else if (activeRun.commandId) {
                              await window.launchStack.launcher.runCommand(
                                activeRunProject.id,
                                activeRun.commandId,
                              );
                            }
                          } catch (error) {
                            if (
                              await handleMappedLaunchError(error, pushToast)
                            ) {
                              return;
                            }
                            pushToast({
                              title: "Unable to rerun",
                              description:
                                error instanceof Error
                                  ? error.message
                                  : "Unknown launch error.",
                              tone: "error",
                            });
                          }
                        })();
                      }}
                      variant="secondary"
                    >
                      {" "}
                      <Play className="h-4 w-4" /> Rerun{" "}
                    </Button>
                  ) : null}{" "}
                  <Button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(buildRunLogText(activeRun))
                        .then(() => {
                          pushToast({
                            title: "Logs copied",
                            description:
                              "Run output was copied to the clipboard.",
                            tone: "success",
                          });
                        });
                    }}
                    variant="ghost"
                  >
                    {" "}
                    <Clipboard className="h-4 w-4" /> Copy{" "}
                  </Button>{" "}
                  <Button
                    onClick={() => {
                      void window.launchStack.launcher
                        .exportRunLogs({
                          runId: activeRun.runId,
                          title: activeRun.title,
                          content: buildRunLogText(activeRun),
                        })
                        .then(() => {
                          pushToast({
                            title: "Logs exported",
                            description:
                              "Selected run output was written to disk.",
                            tone: "success",
                          });
                        })
                        .catch((error) => {
                          pushToast({
                            title: "Unable to export logs",
                            description:
                              error instanceof Error
                                ? error.message
                                : "Unknown log export error.",
                            tone: "error",
                          });
                        });
                    }}
                    variant="ghost"
                  >
                    {" "}
                    <Download className="h-4 w-4" /> Export{" "}
                  </Button>{" "}
                  <Button
                    onClick={() => clearRun(activeRun.runId)}
                    variant="ghost"
                  >
                    {" "}
                    <X className="h-4 w-4" /> Dismiss{" "}
                  </Button>{" "}
                </div>
              ) : null}{" "}
            </div>{" "}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {" "}
              {activeRun ? (
                <div className="space-y-3">
                  {" "}
                  <div className="grid gap-3 md:grid-cols-4">
                    {" "}
                    <MetaItem
                      label="Command"
                      value={
                        activeRunCommand?.command ??
                        activeRun.commandId ??
                        "Profile launch"
                      }
                    />{" "}
                    <MetaItem
                      label="CWD"
                      value={
                        activeRunCommand?.cwd ??
                        activeRunProject?.path ??
                        "Not available"
                      }
                    />{" "}
                    <MetaItem label="Mode" value={getModeLabel(activeRun)} />{" "}
                    <MetaItem
                      label="Control"
                      value={getControlLabel(activeRun)}
                    />{" "}
                    <MetaItem
                      label="Exit code"
                      value={getExitCodeLabel(activeRun)}
                    />{" "}
                  </div>{" "}
                  {alreadyRunningEvent ? (
                    <div className="rounded-2xl border border-warning bg-warning px-4 py-3 text-sm text-text">
                      {" "}
                      {alreadyRunningEvent.message}{" "}
                    </div>
                  ) : null}{" "}
                  {portRemapEvents.length > 0 ? (
                    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
                      {" "}
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        Port remap
                      </div>{" "}
                      <div className="mt-2 space-y-1 text-sm text-text">
                        {" "}
                        {portRemapEvents.map((event) => (
                          <div
                            key={`${event.timestamp}-${event.fromPort}-${event.toPort}`}
                          >
                            {" "}
                            Port {event.fromPort} moved to {event.toPort}{" "}
                            {event.processId
                              ? ` because process ${event.processId} was already using it.`
                              : "."}{" "}
                          </div>
                        ))}{" "}
                      </div>{" "}
                    </div>
                  ) : null}{" "}
                  {activeRun.detectedUrls.length > 0 ? (
                    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
                      {" "}
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        Detected URL
                      </div>{" "}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {" "}
                        {activeRun.detectedUrls.map((url) => (
                          <Button
                            key={url}
                            onClick={() =>
                              void window.launchStack.launcher.openUrl(url)
                            }
                            variant="secondary"
                          >
                            {" "}
                            <ExternalLink className="h-4 w-4" /> {url}{" "}
                          </Button>
                        ))}{" "}
                      </div>{" "}
                    </div>
                  ) : null}{" "}
                  {activeRun.detectedPorts.length > 0 ? (
                    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
                      {" "}
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        Detected ports
                      </div>{" "}
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-text">
                        {" "}
                        {activeRun.detectedPorts.map((port) => (
                          <span
                            className="rounded-xl border border-line bg-shell px-3 py-1.5"
                            key={`${port.host}-${port.port}-${port.url ?? port.source}`}
                          >
                            {" "}
                            {port.host}:{port.port}{" "}
                          </span>
                        ))}{" "}
                      </div>{" "}
                    </div>
                  ) : null}{" "}
                  <div className="flex flex-wrap gap-1.5">
                    {" "}
                    {outputFilters.map((entry) => (
                      <button
                        className={cn(
                          "rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition",
                          outputFilter === entry.value
                            ? "app-control-selected"
                            : "app-control-surface",
                        )}
                        key={entry.value}
                        onClick={() => setOutputFilter(entry.value)}
                        type="button"
                      >
                        {" "}
                        {entry.label}{" "}
                      </button>
                    ))}{" "}
                  </div>{" "}
                  <div className="app-code-surface rounded-2xl border border-line p-4 font-mono text-xs">
                    {" "}
                    <div className="space-y-3">
                      {" "}
                      <AnimatePresence initial={false}>
                        {" "}
                        {activeRunEvents.map((event, index) => (
                          <motion.div
                            animate={{ y: 0 }}
                            className="grid grid-cols-[72px_72px_minmax(0,1fr)] gap-4"
                            initial={{ y: 6 }}
                            key={`${event.timestamp}-${index}`}
                            transition={{ duration: 0.16 }}
                          >
                            {" "}
                            <div className="app-code-muted">
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </div>{" "}
                            <div className="app-code-muted uppercase">
                              {event.kind}
                            </div>{" "}
                            <div
                              className={cn(
                                "whitespace-pre-wrap break-words",
                                getRunEventTextClass(event),
                              )}
                            >
                              {" "}
                              {event.url ??
                                (event.message.trim().length === 0
                                  ? " "
                                  : event.message)}{" "}
                            </div>{" "}
                          </motion.div>
                        ))}{" "}
                      </AnimatePresence>{" "}
                      {activeRunEvents.length === 0 ? (
                        <div className="text-muted">
                          No events match the current output filter.
                        </div>
                      ) : null}{" "}
                    </div>{" "}
                  </div>{" "}
                </div>
              ) : (
                <EmptyState
                  description="Pick a run from the left to inspect stdout, stderr, and status events."
                  title="No run selected"
                />
              )}{" "}
            </div>{" "}
          </div>{" "}
        </motion.div>
      ) : null}{" "}
    </motion.div>
  );
}
function MetaItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-line bg-shell px-3 py-2">
      {" "}
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>{" "}
      <div className="mt-1 truncate font-mono text-xs text-text">
        {value}
      </div>{" "}
    </div>
  );
}
