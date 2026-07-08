import * as Tabs from "@radix-ui/react-tabs";
import {
  ExternalLink,
  FolderOpen,
  Loader2,
  Lock,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Square,
  SquareArrowOutUpRight,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  canUseWorkspacePresets,
  parseUpgradeReason,
} from "../../billing/upgradeGate";
import type {
  CommandSafetySummary,
  LaunchCommand,
  LaunchProfile,
  Project,
  TerminalStrategy,
} from "../../main/types/shared";
import { Button } from "../components/common/Button";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { EmptyState } from "../components/common/EmptyState";
import { InlineWarning } from "../components/common/InlineWarning";
import { Input, Textarea } from "../components/common/Input";
import { PremiumCard } from "../components/common/PremiumCard";
import { CommandRiskBadge } from "../components/launch/CommandRiskBadge";
import { CommandEditor } from "../components/launch/CommandEditor";
import { LaunchProfileEditor } from "../components/launch/LaunchProfileEditor";
import { RunStatusBadge } from "../components/launch/RunStatusBadge";
import { ProjectHealthBadge } from "../components/project/ProjectHealthBadge";
import { StackBadge } from "../components/project/StackBadge";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useLogsStore } from "../store/useLogsStore";
import type { RunLog } from "../store/useLogsStore";
import { useProjectsStore } from "../store/useProjectsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { formatAbsoluteDate, formatRelativeDate } from "../utils/format";
import {
  buildCommandConfirmationLines,
  buildProfileConfirmationLines,
  getDefaultProfile,
  getProfileCommands,
  getRunnableProfileCommands,
} from "../utils/launch";
import { handleMappedLaunchError } from "../utils/launchErrorHandlers";
import { buildWorkspacePresets } from "../utils/presets";
import {
  getProjectHealthStatus,
  projectHealthCopy,
} from "../utils/projectHealth";
import {
  formatTerminalStrategyLabel,
  getProjectLaunchButtonState,
  isVscodeTerminalStrategy,
  type ProjectLaunchButtonState,
} from "../utils/terminalSessions";
type PendingConfirmation =
  | {
      type: "command";
      command: LaunchCommand;
      details: string[];
      title: string;
      description: string;
    }
  | {
      type: "profile";
      profile: LaunchProfile;
      details: string[];
      title: string;
      description: string;
    }
  | { type: "delete"; details: string[]; title: string; description: string };
const detailTabs = [
  { value: "launch", label: "Launch" },
  { value: "commands", label: "Commands" },
  { value: "environment", label: "Environment" },
  { value: "files", label: "Files" },
  { value: "notes", label: "Notes" },
  { value: "activity", label: "Activity" },
  { value: "settings", label: "Settings" },
];
function isDetailTab(value: string | null): value is (typeof detailTabs)[number]["value"] {
  return value !== null && detailTabs.some((tab) => tab.value === value);
}
function buildDefaultProfileForCommand(
  project: Project,
  command: LaunchCommand,
): LaunchProfile {
  return {
    id: crypto.randomUUID(),
    name: "Default Launch",
    openEditor: true,
    openFolder: false,
    openBrowser: project.suggestedBrowserUrls.length > 0,
    browserUrls: project.suggestedBrowserUrls,
    commandIds: [command.id],
    askBeforeRun: true,
  };
}
export function ProjectDetailPage(): JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = useProjectsStore((state) => state.currentProject);
  const loadProject = useProjectsStore((state) => state.loadProject);
  const updateProject = useProjectsStore((state) => state.updateProject);
  const deleteProject = useProjectsStore((state) => state.deleteProject);
  const toggleFavorite = useProjectsStore((state) => state.toggleFavorite);
  const settings = useSettingsStore((state) => state.settings);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const pushToast = useToastStore((state) => state.pushToast);
  const bridgeState = useAppStatusStore((state) => state.bridgeState);
  const recentLaunchFailures = useAppStatusStore(
    (state) => state.recentLaunchFailures,
  );
  const terminalSessions = useAppStatusStore((state) => state.terminalSessions);
  const runs = useLogsStore((state) => state.runs);
  const order = useLogsStore((state) => state.order);
  const [activeTab, setActiveTab] = useState("launch");
  const [notesDraft, setNotesDraft] = useState("");
  const [settingsDraft, setSettingsDraft] = useState({
    name: "",
    path: "",
  });
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<
    LaunchCommand | undefined
  >();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<
    LaunchProfile | undefined
  >();
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(
    null,
  );
  const [commandSafety, setCommandSafety] = useState<CommandSafetySummary[]>(
    [],
  );
  const requestedTab = searchParams.get("tab");
  useEffect(() => {
    if (isDetailTab(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);
  useEffect(() => {
    if (id && subscription.email) {
      void loadProject(id);
    }
  }, [id, loadProject, subscription.email]);
  useEffect(() => {
    if (project && project.id === id) {
      setNotesDraft(project.notes);
      setSettingsDraft({
        name: project.name,
        path: project.path,
      });
      void window.launchStack.launcher
        .getCommandSafety(project.id)
        .then(setCommandSafety)
        .catch(() => setCommandSafety([]));
    }
  }, [id, project]);
  if (!subscription.email) {
    return (
      <EmptyState
        actionLabel="Open Billing"
        description="Connect this desktop app to your Projecto account first, then Projecto can load your synced project details."
        onAction={() => navigate("/pricing")}
        title="Desktop sign-in required"
      />
    );
  }
  if (!project || project.id !== id) {
    return (
      <EmptyState
        description="This project may have been removed or never imported."
        title="Project not found"
      />
    );
  }
  const currentProject = project;
  const defaultProfile = getDefaultProfile(currentProject);
  const workspacePresets = buildWorkspacePresets(currentProject);
  const safetyByCommandId = new Map(
    commandSafety.map((summary) => [summary.commandId, summary]),
  );
  const projectRuns = order
    .map((runId) => runs[runId])
    .filter((run): run is RunLog =>
      Boolean(run && run.projectId === currentProject.id),
    );
  const activeProjectRuns = projectRuns.filter(
    (run) =>
      run.status === "started" ||
      run.status === "running" ||
      run.status === "spawned" ||
      run.status === "ready",
  );
  const lastProjectRun = projectRuns[0];
  const terminalSession = terminalSessions[currentProject.id];
  const launchButtonState = getProjectLaunchButtonState(
    currentProject,
    terminalSession,
  );
  const projectLocked = currentProject.lockedBySubscription === true;
  const primaryLaunchLabel =
    launchButtonState === "locked"
      ? "Locked"
      : launchButtonState === "running"
      ? "Running"
      : launchButtonState === "ready"
        ? "Stop"
        : launchButtonState === "stopping"
          ? "Stopping"
          : launchButtonState === "failed"
            ? "Failed"
            : "Launch";
  const PrimaryLaunchIcon =
    launchButtonState === "locked"
      ? Lock
      : launchButtonState === "running" || launchButtonState === "stopping"
      ? Loader2
      : launchButtonState === "ready"
        ? Square
        : launchButtonState === "failed"
          ? TriangleAlert
          : Play;
  const browserUrls = defaultProfile?.browserUrls.length
    ? defaultProfile.browserUrls
    : currentProject.suggestedBrowserUrls;
  const healthStatus = getProjectHealthStatus({
    project: currentProject,
    settings,
    bridgeState,
    recentLaunchFailures,
    commandSafety,
  });
  async function refreshCommandSafety(): Promise<void> {
    try {
      setCommandSafety(
        await window.launchStack.launcher.getCommandSafety(currentProject.id),
      );
    } catch {
      setCommandSafety([]);
    }
  }
  function handleTabChange(nextTab: string): void {
    setActiveTab(nextTab);
    setSearchParams(nextTab === "launch" ? {} : { tab: nextTab }, {
      replace: true,
    });
  }
  function openCommandEditor(): void {
    if (projectLocked) {
      openUpgradeModal("lockedProject");
      return;
    }
    setActiveTab("commands");
    setSearchParams({ tab: "commands" }, { replace: true });
    setEditingCommand(undefined);
    setCommandDialogOpen(true);
  }
  async function persistProjectUpdate(
    patch: Parameters<typeof updateProject>[1],
  ): Promise<boolean> {
    if (projectLocked) {
      openUpgradeModal("lockedProject");
      return false;
    }
    try {
      await updateProject(currentProject.id, patch);
      await refreshCommandSafety();
      return true;
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        openUpgradeModal(upgradeReason);
        return false;
      }
      pushToast({
        title: "Unable to save project",
        description:
          error instanceof Error
            ? error.message
            : "Unknown project update error.",
        tone: "error",
      });
      return false;
    }
  }
  async function handleLaunchProfile(
    profile: LaunchProfile,
    confirmed = false,
  ): Promise<void> {
    if (projectLocked) {
      openUpgradeModal("lockedProject");
      return;
    }
    try {
      await window.launchStack.launcher.launchProfile(
        currentProject.id,
        profile.id,
        confirmed
          ? {
              approvedCommandIds: getRunnableProfileCommands(
                currentProject,
                profile,
              ).map((command) => command.id),
              dangerousOverride: true,
            }
          : undefined,
      );
      await refreshCommandSafety();
      pushToast({
        title: `Launched ${profile.name}`,
        description: currentProject.name,
        tone: "success",
      });
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        openUpgradeModal(upgradeReason);
        return;
      }
      if (await handleMappedLaunchError(error, pushToast)) {
        return;
      }
      pushToast({
        title: "Unable to launch profile",
        description:
          error instanceof Error ? error.message : "Unknown launch error.",
        tone: "error",
      });
    }
  }
  async function handleRunCommand(
    command: LaunchCommand,
    confirmed = false,
  ): Promise<void> {
    if (projectLocked) {
      openUpgradeModal("lockedProject");
      return;
    }
    try {
      await window.launchStack.launcher.runCommand(
        currentProject.id,
        command.id,
        confirmed
          ? { approvedCommandIds: [command.id], dangerousOverride: true }
          : undefined,
      );
      await refreshCommandSafety();
      pushToast({
        title: `Started ${command.label}`,
        description: currentProject.name,
        tone: "success",
      });
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        openUpgradeModal(upgradeReason);
        return;
      }
      if (await handleMappedLaunchError(error, pushToast)) {
        return;
      }
      pushToast({
        title: "Unable to run command",
        description:
          error instanceof Error ? error.message : "Unknown command error.",
        tone: "error",
      });
    }
  }
  function handleStopProject(): void {
    void window.launchStack.launcher
      .stopProjectTerminal(currentProject.id)
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
  }
  return (
    <div className="space-y-6">
      {" "}
      <ProjectHeader
        currentProject={currentProject}
        defaultProfile={defaultProfile}
        healthStatus={healthStatus}
        launchState={launchButtonState}
        locked={projectLocked}
        onFavorite={() => {
          if (projectLocked) {
            openUpgradeModal("lockedProject");
            return;
          }
          void toggleFavorite(currentProject.id);
        }}
        onLaunch={(profile) => {
          if (projectLocked) {
            openUpgradeModal("lockedProject");
            return;
          }
          if (
            launchButtonState === "running" ||
            launchButtonState === "ready" ||
            launchButtonState === "stopping"
          ) {
            handleStopProject();
            return;
          }
          if (settings.askBeforeRunningNewCommands || profile.askBeforeRun) {
            setConfirmation({
              type: "profile",
              profile,
              details: buildProfileConfirmationLines(currentProject, profile),
              title: `Launch ${profile.name}`,
              description: `Review the actions Projecto will run for ${currentProject.name}.`,
            });
          } else {
            void handleLaunchProfile(profile);
          }
        }}
      />{" "}
      {projectLocked ? (
        <InlineWarning title="Locked on Standard">
          {" "}
          <div className="space-y-3">
            <p>
              Standard keeps the 5 most-used projects runnable. This project is
              still visible, can be opened, and can be removed, but launching or
              editing it requires Pro.
              {currentProject.subscriptionRank &&
              currentProject.subscriptionLimit
                ? ` It is ranked #${currentProject.subscriptionRank}; Standard unlocks the first ${currentProject.subscriptionLimit}.`
                : ""}
            </p>
            <Button
              onClick={() => openUpgradeModal("lockedProject")}
              variant="secondary"
            >
              <Lock className="h-4 w-4" /> Upgrade to Pro
            </Button>
          </div>{" "}
        </InlineWarning>
      ) : null}{" "}
      <Tabs.Root onValueChange={handleTabChange} value={activeTab}>
        {" "}
        <Tabs.List className="inline-flex flex-wrap rounded-2xl border border-line bg-panel p-1">
          {" "}
          {detailTabs.map((tab) => (
            <Tabs.Trigger
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition data-[state=active]:border-text data-[state=active]:bg-text data-[state=active]:text-bg"
              key={tab.value}
              value={tab.value}
            >
              {" "}
              {tab.label}{" "}
            </Tabs.Trigger>
          ))}{" "}
        </Tabs.List>{" "}
        <Tabs.Content className="mt-6 space-y-6" value="launch">
          {" "}
          <LaunchWarnings
            bridgeConnected={bridgeState.extensionConnected}
            healthStatus={healthStatus}
            terminalStrategy={settings.terminalStrategy}
          />{" "}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            {" "}
            <PremiumCard className="p-5">
              {" "}
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                {" "}
                <div>
                  {" "}
                  <div className="text-xs uppercase tracking-[0.16em] text-muted">
                    Primary launch
                  </div>{" "}
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-text">
                    {" "}
                    {defaultProfile?.name ?? "No launch profile yet"}{" "}
                  </h3>{" "}
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {" "}
                    {defaultProfile
                      ? `${getRunnableProfileCommands(currentProject, defaultProfile).length} runtime command${getRunnableProfileCommands(currentProject, defaultProfile).length === 1 ? "" : "s"} selected.`
                      : "Create a launch profile to turn this folder into a one-click workspace."}{" "}
                  </p>{" "}
                </div>{" "}
                <Button
                  disabled={!defaultProfile || projectLocked}
                  onClick={() => {
                    if (projectLocked) {
                      openUpgradeModal("lockedProject");
                      return;
                    }
                    if (
                      launchButtonState === "running" ||
                      launchButtonState === "ready" ||
                      launchButtonState === "stopping"
                    ) {
                      handleStopProject();
                      return;
                    }
                    if (defaultProfile) {
                      setConfirmation({
                        type: "profile",
                        profile: defaultProfile,
                        details: buildProfileConfirmationLines(
                          currentProject,
                          defaultProfile,
                        ),
                        title: `Launch ${defaultProfile.name}`,
                        description: `Review the actions Projecto will run for ${currentProject.name}.`,
                      });
                    }
                  }}
                  variant={
                    launchButtonState === "failed" ? "secondary" : "primary"
                  }
                >
                  {" "}
                  <PrimaryLaunchIcon
                    className={`h-4 w-4 ${launchButtonState === "running" || launchButtonState === "stopping" ? "animate-spin" : ""}`}
                  />{" "}
                  {primaryLaunchLabel}{" "}
                </Button>{" "}
              </div>{" "}
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {" "}
                <QuickAction
                  label="Open Editor"
                  onClick={() =>
                    void window.launchStack.launcher.openEditor(
                      currentProject.id,
                    )
                  }
                  value="VS Code"
                />{" "}
                <QuickAction
                  label="Open Folder"
                  onClick={() =>
                    void window.launchStack.launcher.openFolder(
                      currentProject.path,
                    )
                  }
                  value="Reveal directory"
                />{" "}
                <QuickAction
                  label="Last launch"
                  onClick={() => undefined}
                  value={formatAbsoluteDate(currentProject.lastOpenedAt)}
                />{" "}
              </div>{" "}
            </PremiumCard>{" "}
            <PremiumCard className="p-5">
              {" "}
              <div className="text-xs uppercase tracking-[0.16em] text-muted">
                Runtime state
              </div>{" "}
              <div className="mt-4 space-y-3">
                {" "}
                <RuntimeItem
                  label="Active runs"
                  value={String(activeProjectRuns.length)}
                />{" "}
                <RuntimeItem
                  label="Last run"
                  value={
                    lastProjectRun
                      ? `${lastProjectRun.status} - ${formatRelativeDate(lastProjectRun.updatedAt)}`
                      : "No run yet"
                  }
                />{" "}
                <RuntimeItem
                  label="Terminal"
                  value={formatTerminalStrategyLabel(
                    terminalSession ?? {
                      terminalStrategy: settings.terminalStrategy,
                    },
                  )}
                />{" "}
                <RuntimeItem
                  label="Ports"
                  value={
                    terminalSession?.detectedPorts?.length
                      ? terminalSession.detectedPorts
                          .map((port) => port.port)
                          .join(", ")
                      : "None yet"
                  }
                />{" "}
                <RuntimeItem
                  label="Extension"
                  value={
                    bridgeState.extensionConnected ? "Connected" : "Waiting"
                  }
                />{" "}
              </div>{" "}
            </PremiumCard>{" "}
          </div>{" "}
          <PremiumCard className="p-5">
            {" "}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {" "}
              <div>
                {" "}
                <h3 className="text-lg font-semibold tracking-tight text-text">
                  Launch profiles
                </h3>{" "}
                <p className="mt-1 text-sm leading-6 text-muted">
                  Profiles combine saved commands, editor actions, folder
                  reveal, and URLs.
                </p>{" "}
              </div>{" "}
              <div className="flex flex-wrap gap-2">
                {" "}
                <Button
                  disabled={projectLocked}
                  onClick={openCommandEditor}
                  variant="secondary"
                >
                  {" "}
                  <Plus className="h-4 w-4" /> Add Launch Command{" "}
                </Button>{" "}
                <Button
                  disabled={projectLocked}
                  onClick={() => {
                    setEditingProfile(undefined);
                    setProfileDialogOpen(true);
                  }}
                  variant="primary"
                >
                  {" "}
                  <Plus className="h-4 w-4" /> New Profile{" "}
                </Button>{" "}
              </div>{" "}
            </div>{" "}
            <div className="mt-5 space-y-3">
              {" "}
              {currentProject.launchProfiles.length === 0 ? (
                <EmptyState
                  actionLabel="Add Launch Command"
                  description="Add a command to run this project. Projecto will create a default launch profile from it."
                  onAction={openCommandEditor}
                  title="No launch profiles yet"
                />
              ) : (
                currentProject.launchProfiles.map((profile) => (
                  <ProfileRow
                    commands={getProfileCommands(currentProject, profile)}
                    key={profile.id}
                    onDelete={() => {
                      void persistProjectUpdate({
                        launchProfiles: currentProject.launchProfiles.filter(
                          (entry) => entry.id !== profile.id,
                        ),
                      });
                    }}
                    onEdit={() => {
                      if (projectLocked) {
                        openUpgradeModal("lockedProject");
                        return;
                      }
                      setEditingProfile(profile);
                      setProfileDialogOpen(true);
                    }}
                    onLaunch={() => {
                      if (projectLocked) {
                        openUpgradeModal("lockedProject");
                        return;
                      }
                      if (
                        launchButtonState === "running" ||
                        launchButtonState === "ready" ||
                        launchButtonState === "stopping"
                      ) {
                        handleStopProject();
                        return;
                      }
                      if (
                        settings.askBeforeRunningNewCommands ||
                        profile.askBeforeRun
                      ) {
                        setConfirmation({
                          type: "profile",
                          profile,
                          details: buildProfileConfirmationLines(
                            currentProject,
                            profile,
                          ),
                          title: `Launch ${profile.name}`,
                          description: `Review the actions Projecto will run for ${currentProject.name}.`,
                        });
                      } else {
                        void handleLaunchProfile(profile);
                      }
                    }}
                    locked={projectLocked}
                    launchState={launchButtonState}
                    profile={profile}
                  />
                ))
              )}{" "}
            </div>{" "}
          </PremiumCard>{" "}
          {browserUrls.length > 0 ? (
            <PremiumCard className="p-5">
              {" "}
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Local URLs
              </h3>{" "}
              <div className="mt-4 flex flex-wrap gap-2">
                {" "}
                {browserUrls.map((url) => (
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
            </PremiumCard>
          ) : null}{" "}
          <PremiumCard className="p-5">
            {" "}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {" "}
              <div>
                {" "}
                <div className="flex items-center gap-2">
                  {" "}
                  <Sparkles className="h-4 w-4 text-text" />{" "}
                  <h3 className="text-lg font-semibold tracking-tight text-text">
                    Workspace presets
                  </h3>{" "}
                </div>{" "}
                <p className="mt-1 text-sm leading-6 text-muted">
                  Generate polished launch profiles in one click from commands
                  Projecto already knows about.
                </p>{" "}
              </div>{" "}
              {!canUseWorkspacePresets(subscription) ? (
                <Button
                  onClick={() => openUpgradeModal("workspacePresets")}
                  variant="secondary"
                >
                  {" "}
                  Unlock in Pro{" "}
                </Button>
              ) : null}{" "}
            </div>{" "}
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {" "}
              {workspacePresets.map((preset) => (
                <button
                  className="app-control-surface rounded-[24px] border p-4 text-left transition"
                  key={preset.id}
                  onClick={() => {
                    if (projectLocked) {
                      openUpgradeModal("lockedProject");
                      return;
                    }
                    if (!canUseWorkspacePresets(subscription)) {
                      openUpgradeModal("workspacePresets");
                      return;
                    }
                    void persistProjectUpdate({
                      launchProfiles: [
                        ...currentProject.launchProfiles,
                        preset.build(currentProject),
                      ],
                    });
                  }}
                  disabled={projectLocked}
                  type="button"
                >
                  {" "}
                  <div className="text-sm font-semibold text-text">
                    {preset.name}
                  </div>{" "}
                  <div className="mt-2 text-xs leading-5 text-muted">
                    {preset.description}
                  </div>{" "}
                </button>
              ))}{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </Tabs.Content>{" "}
        <Tabs.Content className="mt-6 space-y-4" value="commands">
          {" "}
          <div className="flex justify-end">
            {" "}
            <Button
              disabled={projectLocked}
              onClick={openCommandEditor}
              variant="primary"
            >
              {" "}
              <Plus className="h-4 w-4" /> Add Command{" "}
            </Button>{" "}
          </div>{" "}
          {currentProject.commands.length === 0 ? (
            <EmptyState
              description="Add commands to reuse them across launch profiles and manual runs."
              title="No commands configured"
            />
          ) : (
            currentProject.commands.map((command) => {
              const safety = safetyByCommandId.get(command.id);
              return (
                <PremiumCard className="p-5" key={command.id}>
                  {" "}
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {" "}
                    <div className="space-y-2">
                      {" "}
                      <div className="flex flex-wrap items-center gap-2">
                        {" "}
                        <h3 className="text-lg font-semibold tracking-tight text-text">
                          {command.label}
                        </h3>{" "}
                        <span className="rounded-full border border-line bg-shell px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted">
                          {" "}
                          {command.runOnLaunch ? "Runtime" : "Manual"}{" "}
                        </span>{" "}
                        {safety ? (
                          <CommandRiskBadge
                            approved={safety.approved}
                            risk={safety.risk}
                          />
                        ) : null}{" "}
                      </div>{" "}
                      <div className="font-mono text-xs text-text">
                        {command.command}
                      </div>{" "}
                      <div className="text-xs text-muted">
                        cwd: {command.cwd}
                      </div>{" "}
                    </div>{" "}
                    <div className="flex flex-wrap gap-2">
                      {" "}
                      <Button
                        disabled={projectLocked}
                        onClick={() => {
                          if (projectLocked) {
                            openUpgradeModal("lockedProject");
                            return;
                          }
                          if (
                            settings.askBeforeRunningNewCommands ||
                            !safety?.approved ||
                            safety.risk === "dangerous"
                          ) {
                            setConfirmation({
                              type: "command",
                              command,
                              details: buildCommandConfirmationLines(command),
                              title: `Run ${command.label}`,
                              description: `Review the exact command Projecto will execute for ${currentProject.name}.`,
                            });
                          } else {
                            void handleRunCommand(command);
                          }
                        }}
                        variant="primary"
                      >
                        {" "}
                        <Play className="h-4 w-4" /> Run{" "}
                      </Button>{" "}
                      <Button
                        disabled={projectLocked}
                        onClick={() => {
                          if (projectLocked) {
                            openUpgradeModal("lockedProject");
                            return;
                          }
                          setEditingCommand(command);
                          setCommandDialogOpen(true);
                        }}
                        variant="secondary"
                      >
                        {" "}
                        <Pencil className="h-4 w-4" /> Edit{" "}
                      </Button>{" "}
                      <Button
                        disabled={projectLocked}
                        onClick={() => {
                          void persistProjectUpdate({
                            commands: currentProject.commands.filter(
                              (entry) => entry.id !== command.id,
                            ),
                          });
                        }}
                        variant="ghost"
                      >
                        {" "}
                        <Trash2 className="h-4 w-4" /> Delete{" "}
                      </Button>{" "}
                    </div>{" "}
                  </div>{" "}
                </PremiumCard>
              );
            })
          )}{" "}
        </Tabs.Content>{" "}
        <Tabs.Content className="mt-6 space-y-6" value="environment">
          {" "}
          <div className="grid gap-4 lg:grid-cols-4">
            {" "}
            <OverviewStat
              label="Project type"
              value={currentProject.framework ?? currentProject.detectedType}
            />{" "}
            <OverviewStat
              label="Package manager"
              value={currentProject.packageManager ?? "Unknown"}
            />{" "}
            <OverviewStat
              label="Detected files"
              value={String(currentProject.detectedFiles.length)}
            />{" "}
            <OverviewStat
              label="Launch count"
              value={String(currentProject.launchCount)}
            />{" "}
          </div>{" "}
          <PremiumCard className="p-5">
            {" "}
            <h3 className="text-lg font-semibold tracking-tight text-text">
              Suggested commands
            </h3>{" "}
            <div className="mt-4 space-y-3">
              {" "}
              {currentProject.suggestedCommands.length > 0 ? (
                currentProject.suggestedCommands.map((command) => (
                  <div
                    className="app-code-surface rounded-2xl border border-line p-4"
                    key={`${command.label}-${command.command}`}
                  >
                    {" "}
                    <div className="text-sm font-semibold text-text">
                      {command.label}
                    </div>{" "}
                    <div className="mt-1 font-mono text-xs text-text">
                      {command.command}
                    </div>{" "}
                    <div className="mt-1 text-xs text-muted">
                      cwd: {command.cwd}
                    </div>{" "}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted">
                  No suggestions available for this project.
                </div>
              )}{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </Tabs.Content>{" "}
        <Tabs.Content className="mt-6 space-y-6" value="files">
          {" "}
          <PremiumCard className="p-5">
            {" "}
            <h3 className="text-lg font-semibold tracking-tight text-text">
              Project directory
            </h3>{" "}
            <div className="mt-3 rounded-2xl border border-line bg-shell px-4 py-3 font-mono text-xs text-text">
              {" "}
              {currentProject.path}{" "}
            </div>{" "}
            <div className="mt-4 flex flex-wrap gap-2">
              {" "}
              <Button
                onClick={() =>
                  void window.launchStack.launcher.openFolder(
                    currentProject.path,
                  )
                }
                variant="secondary"
              >
                {" "}
                <FolderOpen className="h-4 w-4" /> Reveal Folder{" "}
              </Button>{" "}
              <Button onClick={() => setActiveTab("settings")} variant="ghost">
                {" "}
                Rebind Folder{" "}
              </Button>{" "}
            </div>{" "}
          </PremiumCard>{" "}
          <PremiumCard className="p-5">
            {" "}
            <h3 className="text-lg font-semibold tracking-tight text-text">
              Detected files
            </h3>{" "}
            <div className="mt-4 flex flex-wrap gap-2">
              {" "}
              {currentProject.detectedFiles.length > 0 ? (
                currentProject.detectedFiles.map((file) => (
                  <span
                    className="rounded-full border border-line bg-shell px-3 py-1 text-xs text-text"
                    key={file}
                  >
                    {" "}
                    {file}{" "}
                  </span>
                ))
              ) : (
                <div className="text-sm text-muted">
                  No known detector files were recorded for this project.
                </div>
              )}{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </Tabs.Content>{" "}
        <Tabs.Content className="mt-6" value="notes">
          {" "}
          <PremiumCard className="p-5">
            {" "}
            <div className="space-y-4">
              {" "}
              <div>
                {" "}
                <h3 className="text-lg font-semibold tracking-tight text-text">
                  Project notes
                </h3>{" "}
                <p className="mt-1 text-sm text-muted">
                  Store lightweight markdown or plain text notes directly with
                  the project.
                </p>{" "}
              </div>{" "}
              <Textarea
                disabled={projectLocked}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder="Architecture notes, setup reminders, local environment context..."
                value={notesDraft}
              />{" "}
              <div className="flex justify-end">
                {" "}
                <Button
                  disabled={projectLocked}
                  onClick={() =>
                    void persistProjectUpdate({ notes: notesDraft })
                  }
                  variant="primary"
                >
                  {" "}
                  Save Notes{" "}
                </Button>{" "}
              </div>{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </Tabs.Content>{" "}
        <Tabs.Content className="mt-6 space-y-4" value="activity">
          {" "}
          {projectRuns.length === 0 ? (
            <EmptyState
              description="Runs launched from this project will appear here with status and timing."
              title="No project activity yet"
            />
          ) : (
            projectRuns.map((run) => (
              <PremiumCard className="p-4" key={run.runId}>
                {" "}
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {" "}
                  <div>
                    {" "}
                    <div className="flex flex-wrap items-center gap-2">
                      {" "}
                      <RunStatusBadge status={run.status} />{" "}
                      <span className="text-sm font-semibold text-text">
                        {run.title}
                      </span>{" "}
                    </div>{" "}
                    <div className="mt-1 text-xs text-muted">
                      {" "}
                      Updated {formatRelativeDate(run.updatedAt)} -{" "}
                      {run.events.length} event
                      {run.events.length === 1 ? "" : "s"}{" "}
                    </div>{" "}
                  </div>{" "}
                  <Button
                    onClick={() =>
                      useLogsStore.setState({
                        isOpen: true,
                        activeRunId: run.runId,
                      })
                    }
                    variant="secondary"
                  >
                    {" "}
                    Open Logs{" "}
                  </Button>{" "}
                </div>{" "}
              </PremiumCard>
            ))
          )}{" "}
        </Tabs.Content>{" "}
        <Tabs.Content className="mt-6 space-y-6" value="settings">
          {" "}
          <PremiumCard className="p-5">
            {" "}
            <div className="space-y-4">
              {" "}
              <div>
                {" "}
                <h3 className="text-lg font-semibold tracking-tight text-text">
                  Project preferences
                </h3>{" "}
                <p className="mt-1 text-sm text-muted">
                  Customize the display name and synced directory path without
                  changing the actual folder.
                </p>{" "}
              </div>{" "}
              <div className="grid gap-4 lg:grid-cols-2">
                {" "}
                <div className="space-y-2">
                  {" "}
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="project-detail-name"
                  >
                    {" "}
                    Custom project name{" "}
                  </label>{" "}
                  <Input
                    disabled={projectLocked}
                    id="project-detail-name"
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    value={settingsDraft.name}
                  />{" "}
                </div>{" "}
                <div className="space-y-2">
                  {" "}
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="project-detail-path"
                  >
                    {" "}
                    Project directory{" "}
                  </label>{" "}
                  <Input
                    disabled={projectLocked}
                    id="project-detail-path"
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        path: event.target.value,
                      }))
                    }
                    value={settingsDraft.path}
                  />{" "}
                  <div className="text-xs text-muted">
                    Projecto syncs this directory path through your account.
                  </div>{" "}
                </div>{" "}
              </div>{" "}
              <div className="flex justify-between gap-3">
                {" "}
                <Button
                  onClick={() =>
                    setConfirmation({
                      type: "delete",
                      details: [
                        "This removes the project from Projecto only. The folder on disk is not deleted.",
                      ],
                      title: `Remove ${currentProject.name}`,
                      description:
                        "This only removes Projecto metadata. Your project files remain untouched on disk.",
                    })
                  }
                  variant="ghost"
                >
                  {" "}
                  <Trash2 className="h-4 w-4" /> Remove Project{" "}
                </Button>{" "}
                <Button
                  disabled={projectLocked}
                  onClick={() => {
                    void persistProjectUpdate({
                      name: settingsDraft.name,
                      path: settingsDraft.path.trim(),
                    });
                  }}
                  variant="primary"
                >
                  {" "}
                  Save Project Settings{" "}
                </Button>{" "}
              </div>{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </Tabs.Content>{" "}
      </Tabs.Root>{" "}
      <LaunchProfileEditor
        commands={currentProject.commands}
        initialValue={editingProfile}
        onOpenChange={setProfileDialogOpen}
        onSave={async (nextProfile) => {
          if (projectLocked) {
            openUpgradeModal("lockedProject");
            return;
          }
          const saved = await persistProjectUpdate({
            launchProfiles: editingProfile
              ? currentProject.launchProfiles.map((profile) =>
                  profile.id === editingProfile.id ? nextProfile : profile,
                )
              : [...currentProject.launchProfiles, nextProfile],
          });
          if (saved) {
            setProfileDialogOpen(false);
            setEditingProfile(undefined);
          }
        }}
        open={profileDialogOpen && !projectLocked}
      />{" "}
      <CommandEditor
        defaultCwd={currentProject.path}
        initialValue={editingCommand}
        onOpenChange={setCommandDialogOpen}
        onSave={async (nextCommand) => {
          if (projectLocked) {
            openUpgradeModal("lockedProject");
            return;
          }
          const commands = editingCommand
            ? currentProject.commands.map((command) =>
                command.id === editingCommand.id ? nextCommand : command,
              )
            : [...currentProject.commands, nextCommand];
          const launchProfiles =
            !editingCommand &&
            nextCommand.runOnLaunch &&
            currentProject.launchProfiles.length === 0
              ? [
                  buildDefaultProfileForCommand(currentProject, nextCommand),
                ]
              : currentProject.launchProfiles;
          const saved = await persistProjectUpdate({
            commands,
            launchProfiles,
          });
          if (saved) {
            setCommandDialogOpen(false);
            setEditingCommand(undefined);
          }
        }}
        open={commandDialogOpen && !projectLocked}
      />{" "}
      <ConfirmDialog
        confirmLabel={
          confirmation?.type === "delete"
            ? "Remove Project"
            : confirmation?.type === "command"
              ? "Run Command"
              : "Launch Profile"
        }
        description={confirmation?.description ?? ""}
        details={confirmation?.details ?? []}
        destructive={confirmation?.type === "delete"}
        onConfirm={async () => {
          if (!confirmation) {
            return;
          }
          if (confirmation.type === "command") {
            if (projectLocked) {
              openUpgradeModal("lockedProject");
              setConfirmation(null);
              return;
            }
            await handleRunCommand(confirmation.command, true);
          } else if (confirmation.type === "profile") {
            if (projectLocked) {
              openUpgradeModal("lockedProject");
              setConfirmation(null);
              return;
            }
            await handleLaunchProfile(confirmation.profile, true);
          } else {
            await deleteProject(currentProject.id);
            navigate("/projects");
          }
          setConfirmation(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
        open={confirmation !== null}
        title={confirmation?.title ?? "Confirm action"}
      />{" "}
    </div>
  );
}
function ProjectHeader({
  currentProject,
  defaultProfile,
  healthStatus,
  launchState,
  locked,
  onFavorite,
  onLaunch,
}: {
  currentProject: Project;
  defaultProfile?: LaunchProfile;
  healthStatus: Parameters<typeof ProjectHealthBadge>[0]["status"];
  launchState: ProjectLaunchButtonState;
  locked: boolean;
  onFavorite: () => void;
  onLaunch: (profile: LaunchProfile) => void;
}): JSX.Element {
  const launchLabel =
    locked || launchState === "locked"
      ? "Locked"
      : launchState === "running"
      ? "Running"
      : launchState === "ready"
        ? "Stop"
        : launchState === "stopping"
          ? "Stopping"
          : launchState === "failed"
            ? "Failed"
            : defaultProfile
              ? "Launch"
              : "No profile";
  const LaunchIcon =
    locked || launchState === "locked"
      ? Lock
      : launchState === "running" || launchState === "stopping"
      ? Loader2
      : launchState === "ready"
        ? Square
        : launchState === "failed"
          ? TriangleAlert
          : Play;
  return (
    <section className="app-card-surface rounded-[28px] border border-line p-6">
      {" "}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        {" "}
        <div className="space-y-4">
          {" "}
          <div className="flex flex-wrap items-center gap-3">
            {" "}
            <h2 className="text-3xl font-semibold tracking-tight text-text">
              {currentProject.name}
            </h2>{" "}
            <StackBadge
              detectedType={currentProject.detectedType}
              framework={currentProject.framework}
            />{" "}
            <ProjectHealthBadge status={healthStatus} />{" "}
          </div>{" "}
          <div className="text-sm text-muted">{currentProject.path}</div>{" "}
          <div className="flex flex-wrap gap-2 text-sm text-muted">
            {" "}
            <span>
              Last launched: {formatAbsoluteDate(currentProject.lastOpenedAt)}
            </span>{" "}
            <span>
              Updated: {formatRelativeDate(currentProject.updatedAt)}
            </span>{" "}
          </div>{" "}
        </div>{" "}
        <div className="flex flex-wrap gap-2">
          {" "}
          <Button
            disabled={!defaultProfile || locked}
            onClick={() => defaultProfile && onLaunch(defaultProfile)}
            variant={launchState === "failed" ? "secondary" : "primary"}
          >
            {" "}
            <LaunchIcon
              className={`h-4 w-4 ${launchState === "running" || launchState === "stopping" ? "animate-spin" : ""}`}
            />{" "}
            {launchLabel}{" "}
          </Button>{" "}
          <Button
            onClick={() =>
              void window.launchStack.launcher.openFolder(currentProject.path)
            }
            variant="secondary"
          >
            {" "}
            <FolderOpen className="h-4 w-4" /> Open Folder{" "}
          </Button>{" "}
          <Button
            onClick={() =>
              void window.launchStack.launcher.openEditor(currentProject.id)
            }
            variant="secondary"
          >
            {" "}
            <SquareArrowOutUpRight className="h-4 w-4" /> Open Editor{" "}
          </Button>{" "}
          <Button disabled={locked} onClick={onFavorite} variant="ghost">
            {" "}
            <Star
              className={`h-4 w-4 ${currentProject.favorite ? "fill-current text-text" : ""}`}
            />{" "}
            {currentProject.favorite ? "Favorited" : "Favorite"}{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
    </section>
  );
}
function LaunchWarnings({
  healthStatus,
  terminalStrategy,
  bridgeConnected,
}: {
  healthStatus: Parameters<typeof ProjectHealthBadge>[0]["status"];
  terminalStrategy: TerminalStrategy;
  bridgeConnected: boolean;
}): JSX.Element | null {
  const warnings = [
    healthStatus !== "ready" && healthStatus !== "locked"
      ? projectHealthCopy[healthStatus].description
      : null,
    isVscodeTerminalStrategy(terminalStrategy) && !bridgeConnected
      ? "VS Code Terminal requires the Projecto editor extension. Connect it or switch to OS Terminal."
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      {" "}
      {warnings.map((warning) => (
        <InlineWarning key={warning} title="Launch attention">
          {" "}
          {warning}{" "}
        </InlineWarning>
      ))}{" "}
    </div>
  );
}
function QuickAction({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className="app-control-surface rounded-2xl border px-4 py-3 text-left transition"
      onClick={onClick}
      type="button"
    >
      {" "}
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>{" "}
      <div className="mt-2 truncate text-sm font-semibold text-text">
        {value}
      </div>{" "}
    </button>
  );
}
function RuntimeItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-shell px-4 py-3">
      {" "}
      <div className="text-sm text-muted">{label}</div>{" "}
      <div className="text-sm font-semibold text-text">{value}</div>{" "}
    </div>
  );
}
function ProfileRow({
  profile,
  commands,
  onLaunch,
  onEdit,
  onDelete,
  launchState,
  locked,
}: {
  profile: LaunchProfile;
  commands: LaunchCommand[];
  onLaunch: () => void;
  onEdit: () => void;
  onDelete: () => void;
  launchState: ProjectLaunchButtonState;
  locked: boolean;
}): JSX.Element {
  const launchLabel =
    locked || launchState === "locked"
      ? "Locked"
      : launchState === "running"
      ? "Running"
      : launchState === "ready"
        ? "Stop"
        : launchState === "stopping"
          ? "Stopping"
          : launchState === "failed"
            ? "Failed"
            : "Launch";
  const LaunchIcon =
    locked || launchState === "locked"
      ? Lock
      : launchState === "running" || launchState === "stopping"
      ? Loader2
      : launchState === "ready"
        ? Square
        : launchState === "failed"
          ? TriangleAlert
          : Play;
  return (
    <div className="rounded-[24px] border border-line bg-shell p-4">
      {" "}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {" "}
        <div>
          {" "}
          <h4 className="text-base font-semibold tracking-tight text-text">
            {profile.name}
          </h4>{" "}
          <div className="mt-1 text-sm text-muted">
            {" "}
            {commands.length} linked command{commands.length === 1 ? "" : "s"} -{" "}
            {profile.askBeforeRun
              ? "confirmation required"
              : "confirmation follows global setting"}{" "}
          </div>{" "}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            {" "}
            <span className="rounded-full border border-line bg-panel px-3 py-1">
              {profile.openEditor ? "Opens editor" : "Editor off"}
            </span>{" "}
            <span className="rounded-full border border-line bg-panel px-3 py-1">
              {profile.openFolder ? "Opens folder" : "Folder off"}
            </span>{" "}
            <span className="rounded-full border border-line bg-panel px-3 py-1">
              {profile.openBrowser
                ? `${profile.browserUrls.length} URLs`
                : "Browser off"}
            </span>{" "}
          </div>{" "}
        </div>{" "}
        <div className="flex flex-wrap gap-2">
          {" "}
          <Button
            disabled={locked}
            onClick={onLaunch}
            variant={launchState === "failed" ? "secondary" : "primary"}
          >
            {" "}
            <LaunchIcon
              className={`h-4 w-4 ${launchState === "running" || launchState === "stopping" ? "animate-spin" : ""}`}
            />{" "}
            {launchLabel}{" "}
          </Button>{" "}
          <Button disabled={locked} onClick={onEdit} variant="secondary">
            {" "}
            <Pencil className="h-4 w-4" /> Edit{" "}
          </Button>{" "}
          <Button disabled={locked} onClick={onDelete} variant="ghost">
            {" "}
            <Trash2 className="h-4 w-4" /> Delete{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
function OverviewStat({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <PremiumCard className="p-5">
      {" "}
      <div className="text-xs uppercase tracking-[0.16em] text-muted">
        {label}
      </div>{" "}
      <div className="mt-2 text-lg font-semibold tracking-tight text-text">
        {value}
      </div>{" "}
    </PremiumCard>
  );
}
