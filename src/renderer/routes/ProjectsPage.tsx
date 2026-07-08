import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseUpgradeReason } from "../../billing/upgradeGate";
import type { LaunchProfile, Project } from "../../main/types/shared";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { EmptyState } from "../components/common/EmptyState";
import { Input } from "../components/common/Input";
import { SkeletonCard } from "../components/common/SkeletonCard";
import { AnimatedProjectCard } from "../components/project/AnimatedProjectCard";
import { useCommandSafetySummaries } from "../hooks/useCommandSafetySummaries";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useProjectsStore } from "../store/useProjectsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import {
  buildProfileConfirmationLines,
  getDefaultProfile,
  getRunnableProfileCommands,
} from "../utils/launch";
import { handleMappedLaunchError } from "../utils/launchErrorHandlers";
import { getProjectHealthStatus } from "../utils/projectHealth";
import { getProjectLaunchButtonState } from "../utils/terminalSessions";
type PendingLaunch = { project: Project; profile: LaunchProfile };
export function ProjectsPage(): JSX.Element {
  const navigate = useNavigate();
  const projects = useProjectsStore((state) => state.projects);
  const initialized = useProjectsStore((state) => state.initialized);
  const loading = useProjectsStore((state) => state.loading);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const toggleFavorite = useProjectsStore((state) => state.toggleFavorite);
  const deleteProject = useProjectsStore((state) => state.deleteProject);
  const settings = useSettingsStore((state) => state.settings);
  const bridgeState = useAppStatusStore((state) => state.bridgeState);
  const recentLaunchFailures = useAppStatusStore(
    (state) => state.recentLaunchFailures,
  );
  const terminalSessions = useAppStatusStore((state) => state.terminalSessions);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const startGoogleSignIn = useSubscriptionStore(
    (state) => state.startGoogleSignIn,
  );
  const pushToast = useToastStore((state) => state.pushToast);
  const [search, setSearch] = useState("");
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(
    null,
  );
  const [pendingRemove, setPendingRemove] = useState<Project | null>(null);
  const deferredSearch = useDeferredValue(search);
  const commandSafetyByProjectId = useCommandSafetySummaries(projects);
  useEffect(() => {
    if (subscription.email && !initialized) {
      void loadProjects();
    }
  }, [initialized, loadProjects, subscription.email]);
  const filteredProjects = projects.filter((project) =>
    `${project.name} ${project.path} ${project.framework ?? ""} ${project.detectedType}`
      .toLowerCase()
      .includes(deferredSearch.trim().toLowerCase()),
  );
  const projectHealth = new Map(
    projects.map((project) => [
      project.id,
      getProjectHealthStatus({
        project,
        settings,
        bridgeState,
        recentLaunchFailures,
        commandSafety: commandSafetyByProjectId[project.id] ?? [],
      }),
    ]),
  );
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
        description:
          error instanceof Error ? error.message : "Unknown launch error.",
        tone: "error",
      });
    }
  }
  function handleLaunch(project: Project): void {
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
              ? error.message
              : "Unknown project stop error.",
          tone: "error",
        });
      });
  }
  function handleConfigureLaunch(project: Project): void {
    if (project.lockedBySubscription) {
      openUpgradeModal("lockedProject");
      return;
    }

    const targetTab = project.commands.length === 0 ? "commands" : "launch";
    navigate(`/projects/${project.id}?tab=${targetTab}`);
  }
  async function handleRemoveProject(project: Project): Promise<void> {
    try {
      await deleteProject(project.id);
      pushToast({
        title: "Project removed",
        description: `${project.name} was removed from Projecto. The folder on disk was not deleted.`,
        tone: "success",
      });
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        openUpgradeModal(upgradeReason);
        return;
      }
      pushToast({
        title: "Unable to remove project",
        description:
          error instanceof Error ? error.message : "Unknown removal error.",
        tone: "error",
      });
    } finally {
      setPendingRemove(null);
    }
  }
  return (
    <div className="space-y-6">
      {" "}
      <Input
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search every registered project..."
        value={search}
      />{" "}
      {loading && filteredProjects.length === 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {" "}
          <SkeletonCard /> <SkeletonCard /> <SkeletonCard />{" "}
          <SkeletonCard />{" "}
        </div>
      ) : !subscription.email ? (
        <EmptyState
          actionLabel="Sign in with Projecto"
          description="Open Projecto sign-in in your browser to load your synced project directories on this device."
          onAction={() => {
            void startGoogleSignIn().catch((error) => {
              pushToast({
                title: "Unable to open Projecto sign-in",
                description:
                  error instanceof Error
                    ? error.message
                    : "Unknown sign-in error.",
                tone: "error",
              });
            });
          }}
          title="Desktop sign-in required"
        />
      ) : projects.length === 0 &&
        (subscription.archivedProjectCount ?? 0) > 0 ? (
        <EmptyState
          actionLabel="View Pricing"
          description={`${subscription.archivedProjectCount} project${subscription.archivedProjectCount === 1 ? "" : "s"} are hidden on Standard. Upgrade to Pro to restore them automatically.`}
          onAction={() => navigate("/pricing")}
          title="Projects hidden by Standard limit"
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          description="Try a different search term or import another local workspace."
          title="No projects match your search"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {" "}
          {filteredProjects.map((project, index) => (
            <AnimatedProjectCard
              healthStatus={projectHealth.get(project.id)}
              index={index}
              key={project.id}
              launchState={getProjectLaunchButtonState(
                project,
                terminalSessions[project.id],
              )}
              onLaunch={handleLaunch}
              onStopProject={handleStopProject}
              onOpenEditor={(entry) =>
                void window.launchStack.launcher.openEditor(entry.id)
              }
              onOpenFolder={(entry) =>
                void window.launchStack.launcher.openFolder(entry.path)
              }
              onToggleFavorite={(entry) =>
                entry.lockedBySubscription
                  ? openUpgradeModal("lockedProject")
                  : void toggleFavorite(entry.id)
              }
              onConfigureLaunch={handleConfigureLaunch}
              onRemoveProject={(entry) => setPendingRemove(entry)}
              project={project}
            />
          ))}{" "}
        </div>
      )}{" "}
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
      <ConfirmDialog
        confirmLabel="Remove Project"
        description={
          pendingRemove
            ? "This removes Projecto metadata only. Your project folder and files stay on disk."
            : ""
        }
        destructive
        details={
          pendingRemove
            ? [
                `Project: ${pendingRemove.name}`,
                `Folder: ${pendingRemove.path}`,
              ]
            : []
        }
        onConfirm={async () => {
          if (pendingRemove) {
            await handleRemoveProject(pendingRemove);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        open={pendingRemove !== null}
        title={
          pendingRemove ? `Remove ${pendingRemove.name}` : "Remove project"
        }
      />{" "}
    </div>
  );
}
