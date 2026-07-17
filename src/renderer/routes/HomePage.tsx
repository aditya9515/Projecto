import {
  Activity,
  AlertTriangle,
  BarChart3,
  Command,
  FolderPlus,
  Sparkles,
  Zap,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseUpgradeReason } from "../../billing/upgradeGate";
import type { LaunchProfile, Project } from "../../main/types/shared";
import { EmptyState } from "../components/common/EmptyState";
import { Input } from "../components/common/Input";
import { PlanBadge } from "../components/common/PlanBadge";
import { PremiumCard } from "../components/common/PremiumCard";
import { SkeletonCard } from "../components/common/SkeletonCard";
import { AccountIdentity } from "../components/common/AccountIdentity";
import { AnimatedProjectCard } from "../components/project/AnimatedProjectCard";
import { StatusPill } from "../components/common/StatusPill";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useInsightsStore } from "../store/useInsightsStore";
import { useLogsStore } from "../store/useLogsStore";
import { useProjectsStore } from "../store/useProjectsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { useUiStore } from "../store/useUiStore";
import {
  buildProfileConfirmationLines,
  getDefaultProfile,
  getRunnableProfileCommands,
} from "../utils/launch";
import { handleMappedLaunchError } from "../utils/launchErrorHandlers";
import { getFriendlyErrorMessage } from "../utils/errors";
import { formatAbsoluteDate } from "../utils/format";
import { Button } from "../components/common/Button";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import {
  getProjectHealthStatus,
  projectHealthCopy,
} from "../utils/projectHealth";
import { useCommandSafetySummaries } from "../hooks/useCommandSafetySummaries";
import { getProjectLaunchButtonState } from "../utils/terminalSessions";
type PendingLaunch = { project: Project; profile: LaunchProfile };
export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const projects = useProjectsStore((state) => state.projects);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const toggleFavorite = useProjectsStore((state) => state.toggleFavorite);
  const initialized = useProjectsStore((state) => state.initialized);
  const loading = useProjectsStore((state) => state.loading);
  const settings = useSettingsStore((state) => state.settings);
  const online = useAppStatusStore((state) => state.online);
  const lastSyncedAt = useAppStatusStore((state) => state.lastSyncedAt);
  const latestSyncError = useAppStatusStore((state) => state.latestSyncError);
  const recentLaunchFailures = useAppStatusStore(
    (state) => state.recentLaunchFailures,
  );
  const terminalSessions = useAppStatusStore((state) => state.terminalSessions);
  const activeRunCount = useLogsStore(
    (state) =>
      Object.values(state.runs).filter(
        (run) =>
          run.status === "started" ||
          run.status === "running" ||
          run.status === "spawned" ||
          run.status === "ready",
      ).length,
  );
  const subscription = useSubscriptionStore((state) => state.subscription);
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const startGoogleSignIn = useSubscriptionStore(
    (state) => state.startGoogleSignIn,
  );
  const pushToast = useToastStore((state) => state.pushToast);
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen,
  );
  const stats = useInsightsStore((state) => state.stats);
  const loadUsageStats = useInsightsStore((state) => state.loadUsageStats);
  const [search, setSearch] = useState("");
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(
    null,
  );
  const deferredSearch = useDeferredValue(search);
  const commandSafetyByProjectId = useCommandSafetySummaries(projects);
  useEffect(() => {
    if (subscription.email && !initialized) {
      void loadProjects();
    }
  }, [initialized, loadProjects, subscription.email]);
  useEffect(() => {
    if (subscription.email) {
      void loadUsageStats();
    }
  }, [loadUsageStats, subscription.email]);
  const query = deferredSearch.trim().toLowerCase();
  const filteredProjects = projects.filter((project) =>
    query.length === 0
      ? true
      : `${project.name} ${project.path} ${project.framework ?? ""}`
          .toLowerCase()
          .includes(query),
  );
  const favorites = filteredProjects.filter((project) => project.favorite);
  const recent = filteredProjects.slice(0, 6);
  const mostUsedProject = projects.find(
    (project) => project.id === stats.mostUsedProjectId,
  );
  const projectHealth = new Map(
    projects.map((project) => [
      project.id,
      getProjectHealthStatus({
        project,
        recentLaunchFailures,
        commandSafety: commandSafetyByProjectId[project.id] ?? [],
      }),
    ]),
  );
  const attentionItems = [
    ...(!subscription.email
      ? [
          {
            id: "sign-in",
            title: "Account not connected",
            description: "Sign in to load synced project directories.",
            action: "Sign in",
            onClick: () => void startGoogleSignIn(),
          },
        ]
      : []),
    ...(latestSyncError
      ? [
          {
            id: "sync",
            title: "Sync needs attention",
            description: latestSyncError,
            action: "Open Health",
            onClick: () => navigate("/health"),
          },
        ]
      : []),
    ...projects
      .filter((project) => projectHealth.get(project.id) !== "ready")
      .slice(0, 4)
      .map((project) => {
        const status = projectHealth.get(project.id) ?? "ready";
        return {
          id: `project-${project.id}`,
          title: project.name,
          description: projectHealthCopy[status].description,
          action: "Repair",
          onClick: () => navigate(`/projects/${project.id}`),
        };
      }),
  ];
  async function runLaunch(
    project: Project,
    profile: LaunchProfile,
    confirmed = false,
  ): Promise<void> {
    try {
      await window.launchStack.launcher.launchProfile(
        project.id,
        profile.id,
        confirmed
          ? {
              approvedCommandIds: getRunnableProfileCommands(
                project,
                profile,
              ).map((command) => command.id),
              dangerousOverride: true,
            }
          : undefined,
      );
      void loadUsageStats();
      pushToast({
        title: `Launched ${profile.name}`,
        description: project.name,
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
        title: "Unable to launch project",
        description: getFriendlyErrorMessage(error, "Projecto could not launch this project."),
        tone: "error",
      });
    }
  }
  function handleProjectLaunch(project: Project): void {
    if (project.lockedBySubscription) {
      openUpgradeModal("lockedProject");
      return;
    }
    const profile = getDefaultProfile(project);
    if (!profile) {
      navigate(`/projects/${project.id}`);
      return;
    }
    if (settings.askBeforeRunningNewCommands || profile.askBeforeRun) {
      setPendingLaunch({ project, profile });
      return;
    }
    void runLaunch(project, profile);
  }
  function handleConfigureLaunch(project: Project): void {
    if (project.lockedBySubscription) {
      openUpgradeModal("lockedProject");
      return;
    }

    const targetTab = project.commands.length === 0 ? "commands" : "launch";
    navigate(`/projects/${project.id}?tab=${targetTab}`);
  }
  function handleRevealTerminal(project: Project): void {
    void window.launchStack.launcher
      .revealProjectTerminal(project.id)
      .then(() => {
        pushToast({
          title: "Mapped terminal opened",
          description: `Opened the terminal mapped to ${project.name}.`,
          tone: "success",
        });
      })
      .catch((error) => {
        pushToast({
          title: "Unable to open mapped terminal",
          description: getFriendlyErrorMessage(
            error,
            "Projecto could not open the mapped terminal for this project.",
          ),
          tone: "error",
        });
      });
  }
  function handleStopProject(project: Project): void {
    void window.launchStack.launcher
      .stopProjectTerminal(project.id)
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
              ? getFriendlyErrorMessage(error)
              : "Projecto could not stop this project launch.",
          tone: "error",
        });
      });
  }
  return (
    <div className="space-y-8">
      {" "}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {" "}
        <Input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects by name, path, or stack..."
          value={search}
        />{" "}
        <div className="flex flex-wrap gap-2">
          {" "}
          <Button
            leadingIcon={<Command className="h-4 w-4" />}
            onClick={() => setCommandPaletteOpen(true)}
            variant="secondary"
          >
            {" "}
            Command Palette{" "}
          </Button>{" "}
          <Button
            leadingIcon={<Activity className="h-4 w-4" />}
            onClick={() => navigate("/health")}
            variant="secondary"
          >
            {" "}
            Health{" "}
          </Button>{" "}
          <Button
            leadingIcon={<Zap className="h-4 w-4" />}
            onClick={() => navigate("/settings")}
            variant="secondary"
          >
            {" "}
            Account{" "}
          </Button>{" "}
          <Button
            leadingIcon={<FolderPlus className="h-4 w-4" />}
            onClick={() => navigate("/import")}
            variant="primary"
          >
            {" "}
            Add Project{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {" "}
        <StatusStripItem
          label="Connection"
          value={online ? "Online" : "Offline"}
          tone={online ? "success" : "danger"}
        />{" "}
        <StatusStripItem
          label="Terminal"
          value="Windows Terminal"
          tone="neutral"
        />{" "}
        <StatusStripItem
          label="Active runs"
          value={String(activeRunCount)}
          tone={activeRunCount > 0 ? "warning" : "neutral"}
        />{" "}
        <StatusStripItem
          label="Last sync"
          value={formatAbsoluteDate(lastSyncedAt)}
          tone={latestSyncError ? "danger" : "neutral"}
        />{" "}
      </div>{" "}
      {attentionItems.length > 0 ? (
        <section className="space-y-4">
          {" "}
          <div className="flex items-center justify-between gap-3">
            {" "}
            <div>
              {" "}
              <h2 className="text-xl font-semibold tracking-tight text-text">
                Needs Attention
              </h2>{" "}
              <p className="mt-1 text-sm text-muted">
                Projecto found a few things that may affect launching or
                syncing.
              </p>{" "}
            </div>{" "}
            <StatusPill tone="warning">
              {attentionItems.length} item
              {attentionItems.length === 1 ? "" : "s"}
            </StatusPill>{" "}
          </div>{" "}
          <div className="grid gap-3 xl:grid-cols-3">
            {" "}
            {attentionItems.map((item) => (
              <PremiumCard className="p-4" key={item.id}>
                {" "}
                <div className="flex items-start gap-3">
                  {" "}
                  <div className="app-icon-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-text">
                    {" "}
                    <AlertTriangle className="h-4 w-4" />{" "}
                  </div>{" "}
                  <div className="min-w-0 flex-1">
                    {" "}
                    <div className="text-sm font-semibold text-text">
                      {item.title}
                    </div>{" "}
                    <div className="mt-1 text-xs leading-5 text-muted">
                      {item.description}
                    </div>{" "}
                    <Button
                      className="mt-3"
                      onClick={item.onClick}
                      variant="secondary"
                    >
                      {" "}
                      {item.action}{" "}
                    </Button>{" "}
                  </div>{" "}
                </div>{" "}
              </PremiumCard>
            ))}{" "}
          </div>{" "}
        </section>
      ) : null}{" "}
      <div className="grid gap-4 xl:grid-cols-4">
        {" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="flex items-start justify-between gap-3">
            {" "}
            <div>
              {" "}
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                Subscription
              </div>{" "}
              {subscription.plan === "pro" ? (
                <div className="mt-3 flex items-center gap-2">
                  <PlanBadge
                    plan={subscription.plan}
                    status={subscription.status}
                  />
                </div>
              ) : null}{" "}
            </div>{" "}
            <Button
              onClick={() => {
                if (subscription.email) {
                  navigate("/settings");
                  return;
                }
                void startGoogleSignIn().catch((error) => {
                  pushToast({
                    title: "Unable to open Projecto sign-in",
                    description: getFriendlyErrorMessage(error, "Projecto could not start sign-in."),
                    tone: "error",
                  });
                });
              }}
              variant="ghost"
            >
              {" "}
              {subscription.email ? "Account" : "Sign In"}{" "}
            </Button>{" "}
          </div>{" "}
          <div className="mt-4 space-y-2">
            {" "}
            <div className="text-xs uppercase tracking-[0.16em] text-muted">
              Connected account
            </div>{" "}
            {subscription.email ? (
              <AccountIdentity subscription={subscription} />
            ) : (
              <div className="text-sm font-medium text-text">
                Not signed in yet
              </div>
            )}{" "}
            <div className="text-sm text-muted">
              {" "}
              {subscription.email
                ? "Desktop session restores automatically when you reopen Projecto."
                : "Sign in with Projecto once and the desktop session will restore automatically when you reopen the app."}{" "}
            </div>{" "}
            {subscription.archivedProjectCount &&
            subscription.archivedProjectCount > 0 ? (
              <div className="text-xs text-muted">
                {" "}
                {subscription.archivedProjectCount} project{subscription.archivedProjectCount === 1 ? "" : "s"} locked. Upgrade to Plus to restore them automatically.{" "}
              </div>
            ) : null}{" "}
            <div className="text-xs text-muted">
              {" "}
              Last verified:{" "}
              {formatAbsoluteDate(subscription.lastVerifiedAt)}{" "}
            </div>{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Launches today
          </div>{" "}
          <div className="mt-3 text-3xl font-semibold tracking-tight text-text">
            {stats.launchesToday}
          </div>{" "}
          <div className="mt-2 text-sm text-muted">
            Recent runs and one-click launches completed from this device today.
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Most used project
          </div>{" "}
          <div className="mt-3 text-xl font-semibold tracking-tight text-text">
            {mostUsedProject?.name ?? "Nothing yet"}
          </div>{" "}
          <div className="mt-2 text-sm text-muted">
            {" "}
            {mostUsedProject
              ? `${mostUsedProject.launchCount} launches tracked locally.`
              : "Run a project to start building local usage insights."}{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Favorite stack
          </div>{" "}
          <div className="mt-3 text-xl font-semibold tracking-tight text-text">
            {stats.favoriteStack ?? "Unknown"}
          </div>{" "}
          <div className="mt-2 text-sm text-muted">
            Derived locally from the projects you launch the most.
          </div>{" "}
        </PremiumCard>{" "}
      </div>{" "}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        {" "}
        <div className="space-y-8">
          {" "}
          {!subscription.email ? (
            <EmptyState
              actionLabel="Sign in with Projecto"
              description="Open the Projecto sign-in flow once to connect this desktop app to your synced project directories."
              icon={<Sparkles className="h-6 w-6" />}
              onAction={() => {
                void startGoogleSignIn().catch((error) => {
                  pushToast({
                    title: "Unable to open Projecto sign-in",
                    description: getFriendlyErrorMessage(error, "Projecto could not start sign-in."),
                    tone: "error",
                  });
                });
              }}
              title="Connect Projecto Desktop"
            />
          ) : projects.length === 0 ? (
            <EmptyState
              actionLabel="Import Your First Project"
              description="Register a local folder, inspect the detected stack, and turn it into a one-click launch workflow."
              icon={<Sparkles className="h-6 w-6" />}
              onAction={() => navigate("/import")}
              title="Welcome to Projecto"
            />
          ) : (
            <>
              {" "}
              <section className="space-y-4">
                {" "}
                <div>
                  {" "}
                  <h2 className="text-xl font-semibold tracking-tight text-text">
                    Favorite Projects
                  </h2>{" "}
                  <p className="mt-1 text-sm text-muted">
                    Pin the workspaces you return to most.
                  </p>{" "}
                </div>{" "}
                {favorites.length > 0 ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {" "}
                    {favorites.map((project, index) => (
                      <AnimatedProjectCard
                        healthStatus={projectHealth.get(project.id)}
                        index={index}
                        key={project.id}
                        launchState={getProjectLaunchButtonState(
                          project,
                          terminalSessions[project.id],
                        )}
                        onLaunch={handleProjectLaunch}
                        onStopProject={handleStopProject}
                        onRevealTerminal={handleRevealTerminal}
                        onOpenEditor={(entry) =>
                          void window.launchStack.launcher.openEditor(entry.id)
                        }
                        onOpenFolder={(entry) =>
                          void window.launchStack.launcher.openFolder(
                            entry.path,
                          )
                        }
                        onToggleFavorite={(entry) =>
                          entry.lockedBySubscription
                            ? openUpgradeModal("lockedProject")
                            : void toggleFavorite(entry.id)
                        }
                        onConfigureLaunch={handleConfigureLaunch}
                        project={project}
                      />
                    ))}{" "}
                  </div>
                ) : (
                  <PremiumCard className="p-5">
                    {" "}
                    <div className="text-sm text-muted">
                      Star any project card to keep it one click away on the
                      dashboard.
                    </div>{" "}
                  </PremiumCard>
                )}{" "}
              </section>{" "}
              <section className="space-y-4">
                {" "}
                <div>
                  {" "}
                  <h2 className="text-xl font-semibold tracking-tight text-text">
                    Recent Projects
                  </h2>{" "}
                  <p className="mt-1 text-sm text-muted">
                    Your most recent workspaces in Projecto.
                  </p>{" "}
                </div>{" "}
                {loading && recent.length === 0 ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {" "}
                    <SkeletonCard /> <SkeletonCard />{" "}
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {" "}
                    {recent.map((project, index) => (
                      <AnimatedProjectCard
                        healthStatus={projectHealth.get(project.id)}
                        index={index}
                        key={project.id}
                        launchState={getProjectLaunchButtonState(
                          project,
                          terminalSessions[project.id],
                        )}
                        onLaunch={handleProjectLaunch}
                        onStopProject={handleStopProject}
                        onRevealTerminal={handleRevealTerminal}
                        onOpenEditor={(entry) =>
                          void window.launchStack.launcher.openEditor(entry.id)
                        }
                        onOpenFolder={(entry) =>
                          void window.launchStack.launcher.openFolder(
                            entry.path,
                          )
                        }
                        onToggleFavorite={(entry) =>
                          entry.lockedBySubscription
                            ? openUpgradeModal("lockedProject")
                            : void toggleFavorite(entry.id)
                        }
                        onConfigureLaunch={handleConfigureLaunch}
                        project={project}
                      />
                    ))}{" "}
                  </div>
                )}{" "}
              </section>{" "}
            </>
          )}{" "}
        </div>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="flex items-center gap-3">
            {" "}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-shell text-text">
              {" "}
              <BarChart3 className="h-4 w-4" />{" "}
            </div>{" "}
            <div>
              {" "}
              <h2 className="text-lg font-semibold tracking-tight text-text">
                Recent Activity
              </h2>{" "}
              <p className="text-sm text-muted">
                A local-only timeline of what you launched most recently.
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-5 space-y-3">
            {" "}
            {stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((item) => (
                <div
                  className="rounded-2xl border border-line bg-shell px-4 py-3"
                  key={item.id}
                >
                  {" "}
                  <div className="text-sm font-semibold text-text">
                    {item.title}
                  </div>{" "}
                  {item.description ? (
                    <div className="mt-1 text-sm text-muted">
                      {item.description}
                    </div>
                  ) : null}{" "}
                  <div className="mt-2 text-xs text-muted">
                    {new Date(item.occurredAt).toLocaleString()}
                  </div>{" "}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
                {" "}
                Your launches, command runs, and imports will appear here as you
                use the app.{" "}
              </div>
            )}{" "}
          </div>{" "}
        </PremiumCard>{" "}
      </div>{" "}
      <ConfirmDialog
        confirmLabel="Launch Project"
        description={
          pendingLaunch
            ? `Review the exact actions Projecto will run for ${pendingLaunch.project.name}.`
            : ""
        }
        details={
          pendingLaunch
            ? buildProfileConfirmationLines(
                pendingLaunch.project,
                pendingLaunch.profile,
              )
            : []
        }
        onConfirm={async () => {
          if (pendingLaunch) {
            await runLaunch(pendingLaunch.project, pendingLaunch.profile, true);
            setPendingLaunch(null);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingLaunch(null);
          }
        }}
        open={pendingLaunch !== null}
        title={
          pendingLaunch
            ? `Launch ${pendingLaunch.profile.name}`
            : "Launch project"
        }
      />{" "}
    </div>
  );
}
function StatusStripItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}): JSX.Element {
  return (
    <PremiumCard className="p-4">
      {" "}
      <div className="flex items-center justify-between gap-3">
        {" "}
        <div>
          {" "}
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
            {label}
          </div>{" "}
          <div className="mt-2 text-sm font-semibold text-text">
            {value}
          </div>{" "}
        </div>{" "}
        <StatusPill tone={tone}>{tone}</StatusPill>{" "}
      </div>{" "}
    </PremiumCard>
  );
}
