import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  FolderPlus,
  Folders,
  Home,
  Loader2,
  Play,
  Search,
  Settings,
  Square,
  TerminalSquare,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseUpgradeReason } from "../../../billing/upgradeGate";
import type {
  LaunchCommand,
  LaunchProfile,
  Project,
} from "../../../main/types/shared";
import { AppIcon } from "./AppIcon";
import { ProjectHealthBadge } from "../project/ProjectHealthBadge";
import { useCommandSafetySummaries } from "../../hooks/useCommandSafetySummaries";
import { useAppStatusStore } from "../../store/useAppStatusStore";
import { useProjectsStore } from "../../store/useProjectsStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useSubscriptionStore } from "../../store/useSubscriptionStore";
import { useToastStore } from "../../store/useToastStore";
import { useUiStore } from "../../store/useUiStore";
import {
  buildCommandConfirmationLines,
  buildProfileConfirmationLines,
  getRunnableProfileCommands,
} from "../../utils/launch";
import { handleMappedLaunchError } from "../../utils/launchErrorHandlers";
import { getFriendlyErrorMessage } from "../../utils/errors";
import { getProjectHealthStatus } from "../../utils/projectHealth";
import {
  formatTerminalStrategyLabel,
  getProjectLaunchButtonState,
} from "../../utils/terminalSessions";
import { ConfirmDialog } from "./ConfirmDialog";
import { Input } from "./Input";
type PendingPaletteConfirmation =
  | { type: "command"; project: Project; command: LaunchCommand }
  | { type: "profile"; project: Project; profile: LaunchProfile };
type PaletteItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: JSX.Element;
  badge?: JSX.Element;
  keywords: string;
  onSelect: () => void | Promise<void>;
};
export function CommandPalette(): JSX.Element {
  const navigate = useNavigate();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const projects = useProjectsStore((state) => state.projects);
  const settings = useSettingsStore((state) => state.settings);
  const recentLaunchFailures = useAppStatusStore(
    (state) => state.recentLaunchFailures,
  );
  const terminalSessions = useAppStatusStore((state) => state.terminalSessions);
  const pushToast = useToastStore((state) => state.pushToast);
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const commandSafetyByProjectId = useCommandSafetySummaries(projects);
  const [query, setQuery] = useState("");
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingPaletteConfirmation | null>(null);
  const runProfile = useCallback(
    async (
      project: Project,
      profile: LaunchProfile,
      confirmed = false,
    ): Promise<void> => {
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
          title: "Unable to launch profile",
          description:
            getFriendlyErrorMessage(error, "Projecto could not launch this profile."),
          tone: "error",
        });
      }
    },
    [openUpgradeModal, pushToast],
  );
  const runCommand = useCallback(
    async (
      project: Project,
      command: LaunchCommand,
      confirmed = false,
    ): Promise<void> => {
      try {
        await window.launchStack.launcher.runCommand(
          project.id,
          command.id,
          confirmed
            ? { approvedCommandIds: [command.id], dangerousOverride: true }
            : undefined,
        );
        pushToast({
          title: `Started ${command.label}`,
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
          title: "Unable to run command",
          description:
            getFriendlyErrorMessage(error, "Projecto could not run this command."),
          tone: "error",
        });
      }
    },
    [openUpgradeModal, pushToast],
  );
  const stopProject = useCallback(
    async (project: Project): Promise<void> => {
      try {
        await window.launchStack.launcher.stopProjectTerminal(project.id);
        pushToast({
          title: "Stopping project",
          description: "Projecto is stopping the background process.",
          tone: "info",
        });
      } catch (error) {
        pushToast({
          title: "Unable to stop project",
          description: getFriendlyErrorMessage(error, "Projecto could not stop this project launch."),
          tone: "error",
        });
      }
    },
    [pushToast],
  );
  const items = useMemo<PaletteItem[]>(() => {
    const navigationItems: PaletteItem[] = [
      {
        id: "nav-home",
        title: "Open Home",
        subtitle: "Go to the dashboard",
        icon: <Home className="h-4 w-4" />,
        keywords: "home dashboard",
        onSelect: () => navigate("/"),
      },
      {
        id: "nav-import",
        title: "Import Folder",
        subtitle: "Add a new synced project directory",
        icon: <FolderPlus className="h-4 w-4" />,
        keywords: "import add folder project",
        onSelect: () => navigate("/import"),
      },
      {
        id: "nav-projects",
        title: "Open Projects",
        subtitle: "Browse all registered projects",
        icon: <Folders className="h-4 w-4" />,
        keywords: "projects list browse",
        onSelect: () => navigate("/projects"),
      },
      {
        id: "nav-health",
        title: "Open Health",
        subtitle:
          "Check account, sync, terminal, and launch diagnostics",
        icon: <Activity className="h-4 w-4" />,
        keywords: "health diagnostics status sync terminal",
        onSelect: () => navigate("/health"),
      },
      {
        id: "nav-settings",
        title: "Open Settings",
        subtitle: "Update account, billing, editor, terminal, and preferences",
        icon: <Settings className="h-4 w-4" />,
        keywords: "settings preferences account billing pricing terminal",
        onSelect: () => navigate("/settings"),
      },
    ];
    const projectItems = projects.map((project) => {
      const health = getProjectHealthStatus({
        project,
        recentLaunchFailures,
        commandSafety: commandSafetyByProjectId[project.id] ?? [],
      });
      return {
        id: `project-${project.id}`,
        title: project.name,
        subtitle: `Open project details | ${project.path}`,
        icon: <AppIcon className="h-4 w-4" />,
        badge: <ProjectHealthBadge status={health} />,
        keywords: `${project.name} ${project.path} ${project.framework ?? ""} ${project.detectedType} ${health}`,
        onSelect: () => navigate(`/projects/${project.id}`),
      };
    });
    const profileItems = projects.flatMap((project) => {
      if (project.lockedBySubscription) {
        return [];
      }
      const session = terminalSessions[project.id];
      const launchState = getProjectLaunchButtonState(project, session);
      const terminalMapped =
        launchState === "running" ||
        launchState === "ready" ||
        launchState === "stopping";
      return project.launchProfiles.map((profile) => ({
        id: `profile-${project.id}-${profile.id}`,
        title: terminalMapped
          ? `Stop ${profile.name}`
          : `Run ${profile.name}`,
        subtitle: terminalMapped
          ? `${project.name} | ${formatTerminalStrategyLabel(session)} mapped`
          : `${project.name} | Launch profile`,
        icon:
          launchState === "ready" ? (
            <Square className="h-4 w-4" />
          ) : launchState === "running" || launchState === "stopping" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          ),
        keywords: `${project.name} ${profile.name} launch profile ${launchState}`,
        onSelect: () => {
          if (terminalMapped) {
            void stopProject(project);
            return;
          }
          if (settings.askBeforeRunningNewCommands || profile.askBeforeRun) {
            setPendingConfirmation({ type: "profile", project, profile });
            return;
          }
          void runProfile(project, profile);
        },
      }));
    });
    const commandItems = projects.flatMap((project) => {
      if (project.lockedBySubscription) {
        return [];
      }
      const session = terminalSessions[project.id];
      const launchState = getProjectLaunchButtonState(project, session);
      const terminalMapped =
        launchState === "running" ||
        launchState === "ready" ||
        launchState === "stopping";
      return project.commands.map((command) => ({
        id: `command-${project.id}-${command.id}`,
        title: terminalMapped ? `Stop ${command.label}` : command.label,
        subtitle: terminalMapped
          ? `${project.name} | ${formatTerminalStrategyLabel(session)} mapped`
          : `${project.name} | ${command.command}`,
        icon: terminalMapped ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <TerminalSquare className="h-4 w-4" />
        ),
        keywords: `${project.name} ${command.label} ${command.command} ${command.cwd} ${launchState}`,
        onSelect: () => {
          if (terminalMapped) {
            void stopProject(project);
            return;
          }
          if (settings.askBeforeRunningNewCommands) {
            setPendingConfirmation({ type: "command", project, command });
            return;
          }
          void runCommand(project, command);
        },
      }));
    });
    return [
      ...navigationItems,
      ...projectItems,
      ...profileItems,
      ...commandItems,
    ];
  }, [
    commandSafetyByProjectId,
    navigate,
    projects,
    recentLaunchFailures,
    runCommand,
    runProfile,
    settings.askBeforeRunningNewCommands,
    stopProject,
    terminalSessions,
  ]);
  const filteredItems = items.filter((item) => {
    const value = query.trim().toLowerCase();
    return value.length === 0
      ? true
      : `${item.title} ${item.subtitle} ${item.keywords}`
          .toLowerCase()
          .includes(value);
  });
  return (
    <>
      <Dialog.Root
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setQuery("");
          }
        }}
        open={open}
      >
        <AnimatePresence>
          {open ? (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div className="app-overlay fixed inset-0 z-40 " />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div className="fixed inset-0 z-50 flex justify-center overflow-y-auto px-4 pb-4 pt-[14vh] outline-none">
                  <motion.div
                    animate={{ scale: 1, y: 0 }}
                    className="app-popup-surface w-[min(760px,calc(100vw-2rem))] rounded-[28px] border border-line p-4"
                    exit={{ scale: 0.98, y: 12 }}
                    initial={{ scale: 0.96, y: 18 }}
                    transition={{ type: "spring", stiffness: 280, damping: 26 }}
                  >
                    <div className="flex items-center gap-3 border-b border-line px-2 pb-4">
                      <div className="app-icon-surface flex h-10 w-10 items-center justify-center rounded-2xl text-text">
                        <Search className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <Dialog.Title className="text-sm font-semibold text-text">
                          Command Palette
                        </Dialog.Title>
                        <Dialog.Description className="text-xs text-muted">
                          Search pages, projects, launch profiles, and commands.
                        </Dialog.Description>
                      </div>
                      <Dialog.Close className="app-close-control rounded-2xl p-2 transition">
                        <X className="h-4 w-4" />
                      </Dialog.Close>
                    </div>
                    <div className="px-2 pb-2 pt-4">
                      <Input
                        autoFocus
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Type a command, project, launch profile, or route..."
                        value={query}
                      />
                    </div>
                    <div className="max-h-[58vh] overflow-y-auto px-2 pb-2">
                      <div className="space-y-2">
                        {filteredItems.length > 0 ? (
                          filteredItems.slice(0, 20).map((item) => (
                            <motion.button
                              className="app-control-surface flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition"
                              key={item.id}
                              onClick={() => {
                                setOpen(false);
                                void item.onSelect();
                              }}
                              type="button"
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.99 }}
                            >
                              <div className="app-icon-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-text">
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-text">
                                  {item.title}
                                </div>
                                <div className="truncate text-xs text-muted">
                                  {item.subtitle}
                                </div>
                              </div>
                              {item.badge}
                            </motion.button>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                            No results match your search yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
      <ConfirmDialog
        confirmLabel={
          pendingConfirmation?.type === "profile"
            ? "Launch Profile"
            : "Run Command"
        }
        description={
          pendingConfirmation?.type === "profile"
            ? `Review the exact actions Projecto will run for ${pendingConfirmation.project.name}.`
            : pendingConfirmation?.type === "command"
              ? `Review the exact command Projecto will execute for ${pendingConfirmation.project.name}.`
              : ""
        }
        details={
          pendingConfirmation?.type === "profile"
            ? buildProfileConfirmationLines(
                pendingConfirmation.project,
                pendingConfirmation.profile,
              )
            : pendingConfirmation?.type === "command"
              ? buildCommandConfirmationLines(pendingConfirmation.command)
              : []
        }
        onConfirm={async () => {
          if (!pendingConfirmation) {
            return;
          }
          if (pendingConfirmation.type === "profile") {
            await runProfile(
              pendingConfirmation.project,
              pendingConfirmation.profile,
              true,
            );
          } else {
            await runCommand(
              pendingConfirmation.project,
              pendingConfirmation.command,
              true,
            );
          }
          setPendingConfirmation(null);
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingConfirmation(null);
          }
        }}
        open={pendingConfirmation !== null}
        title={
          pendingConfirmation?.type === "profile"
            ? `Launch ${pendingConfirmation.profile.name}`
            : pendingConfirmation?.type === "command"
              ? `Run ${pendingConfirmation.command.label}`
              : "Confirm action"
        }
      />
    </>
  );
}
