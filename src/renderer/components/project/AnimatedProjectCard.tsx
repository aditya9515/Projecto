import { motion } from "framer-motion";
import {
  FolderOpen,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Rocket,
  Square,
  SquareArrowOutUpRight,
  Star,
  TerminalSquare,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Project } from "../../../main/types/shared";
import { formatRelativeDate, truncateMiddle } from "../../utils/format";
import { Button } from "../common/Button";
import { StackBadge } from "./StackBadge";
import { ProjectHealthBadge } from "./ProjectHealthBadge";
import { cn } from "../../utils/cn";
import type { ProjectHealthStatus } from "../../types/projectHealth";
import type { ProjectLaunchButtonState } from "../../utils/terminalSessions";
type AnimatedProjectCardProps = {
  project: Project;
  index?: number;
  onLaunch: (project: Project) => void;
  onStopProject: (project: Project) => void;
  onOpenFolder: (project: Project) => void;
  onOpenEditor: (project: Project) => void;
  onRevealTerminal?: (project: Project) => void;
  onToggleFavorite: (project: Project) => void;
  onConfigureLaunch?: (project: Project) => void;
  onRemoveProject?: (project: Project) => void;
  healthStatus?: ProjectHealthStatus;
  launchState?: ProjectLaunchButtonState;
};
export function AnimatedProjectCard({
  project,
  index = 0,
  onLaunch,
  onStopProject,
  onOpenFolder,
  onOpenEditor,
  onRevealTerminal,
  onToggleFavorite,
  onConfigureLaunch,
  onRemoveProject,
  healthStatus = project.missingFolder
    ? "missing-folder"
    : project.launchProfiles.length === 0
      ? "no-launch-profile"
      : "ready",
  launchState = project.missingFolder || project.launchProfiles.length === 0
    ? "disabled"
    : "launch",
}: AnimatedProjectCardProps): JSX.Element {
  const defaultLaunchDisabled =
    launchState === "locked" ||
    project.missingFolder ||
    project.launchProfiles.length === 0;
  const isTerminalMapped =
    launchState === "running" ||
    launchState === "ready" ||
    launchState === "stopping";
  const launchLabel =
    launchState === "running"
      ? "Running"
      : launchState === "locked"
        ? "Locked"
      : launchState === "ready"
        ? "Stop"
        : launchState === "stopping"
          ? "Stopping"
          : launchState === "failed"
            ? "Failed"
            : defaultLaunchDisabled
              ? "No profile yet"
              : "Launch";
  const LaunchIcon =
    launchState === "running" || launchState === "stopping"
      ? Loader2
      : launchState === "locked"
        ? Lock
      : launchState === "ready"
        ? Square
        : launchState === "failed"
          ? TriangleAlert
          : Rocket;
  return (
    <motion.article
      animate={{ y: 0 }}
      className="app-card-surface group rounded-[26px] border border-line p-5"
      initial={{ y: 18 }}
      layout
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.03, 0.18),
        ease: [0.2, 0.8, 0.2, 1],
      }}
      whileHover={{ y: -4 }}
    >
      {" "}
      <motion.div
        className="h-full"
        transition={{ duration: 0.16 }}
        whileHover={{ y: -1 }}
      >
        {" "}
        <div className="flex items-start justify-between gap-4">
          {" "}
          <div className="min-w-0 flex-1 space-y-3">
            {" "}
            <div className="flex items-start justify-between gap-4">
              {" "}
              <div>
                {" "}
                <div className="flex items-center gap-3">
                  {" "}
                  <Link
                    className="text-lg font-semibold tracking-tight text-text transition hover:text-text"
                    to={`/projects/${project.id}`}
                  >
                    {" "}
                    {project.name}{" "}
                  </Link>{" "}
                  {project.missingFolder ? (
                    <span className="rounded-full border border-line bg-shell px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text">
                      {" "}
                      Missing folder{" "}
                    </span>
                  ) : null}{" "}
                </div>{" "}
                <div className="mt-1 text-sm text-muted" title={project.path}>
                  {" "}
                  {truncateMiddle(project.path, 56)}{" "}
                </div>{" "}
              </div>{" "}
              <motion.button
                className={cn(
                  "rounded-xl border p-2 transition duration-150 ease-premium",
                  project.favorite ? "app-control-selected" : "app-control-surface",
                  project.lockedBySubscription
                    ? "cursor-not-allowed opacity-60"
                    : "",
                )}
                disabled={project.lockedBySubscription}
                onClick={() => onToggleFavorite(project)}
                type="button"
                whileTap={{ scale: 0.94 }}
              >
                {" "}
                <Star
                  className={`h-4 w-4 ${project.favorite ? "fill-current" : ""}`}
                />{" "}
              </motion.button>{" "}
            </div>{" "}
            <div className="flex flex-wrap items-center gap-2">
              {" "}
              <StackBadge
                detectedType={project.detectedType}
                framework={project.framework}
              />{" "}
              <ProjectHealthBadge status={healthStatus} />{" "}
              {project.packageManager ? (
                <span className="rounded-full border border-line bg-shell px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  {" "}
                  {project.packageManager}{" "}
                </span>
              ) : null}{" "}
              {project.launchCount > 0 ? (
                <span className="rounded-full border border-line bg-shell px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                  {" "}
                  {project.launchCount} launches{" "}
                </span>
              ) : null}{" "}
            </div>{" "}
            <div className="flex items-center gap-6 text-xs text-muted">
              {" "}
              <span>
                Last opened {formatRelativeDate(project.lastOpenedAt)}
              </span>{" "}
              <span>Updated {formatRelativeDate(project.updatedAt)}</span>{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        <motion.div
          animate={{ y: 0 }}
          className="mt-5 flex flex-wrap items-center gap-2"
          initial={false}
          transition={{ duration: 0.18 }}
        >
          {" "}
          <Button
            disabled={defaultLaunchDisabled}
            onClick={() => {
              if (isTerminalMapped) {
                onStopProject(project);
                return;
              }
              onLaunch(project);
            }}
            variant={launchState === "failed" ? "secondary" : "primary"}
          >
            {" "}
            <LaunchIcon
              className={`h-4 w-4 ${launchState === "running" || launchState === "stopping" ? "animate-spin" : ""}`}
            />{" "}
            {launchLabel}{" "}
          </Button>{" "}
          <Button onClick={() => onOpenFolder(project)} variant="secondary">
            {" "}
            <FolderOpen className="h-4 w-4" /> Folder{" "}
          </Button>{" "}
          {isTerminalMapped && onRevealTerminal ? (
            <Button onClick={() => onRevealTerminal(project)} variant="secondary">
              <TerminalSquare className="h-4 w-4" /> Mapped Terminal
            </Button>
          ) : null}{" "}
          <Button onClick={() => onOpenEditor(project)} variant="secondary">
            {" "}
            <SquareArrowOutUpRight className="h-4 w-4" /> Editor{" "}
          </Button>{" "}
          {onConfigureLaunch ? (
            <Button
              onClick={() => onConfigureLaunch(project)}
              variant="secondary"
            >
              {" "}
              {project.launchProfiles.length === 0 ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}{" "}
              {project.launchProfiles.length === 0
                ? "Setup"
                : "Edit"}{" "}
            </Button>
          ) : null}{" "}
          {onRemoveProject ? (
            <Button onClick={() => onRemoveProject(project)} variant="danger">
              {" "}
              <Trash2 className="h-4 w-4" /> Remove{" "}
            </Button>
          ) : null}{" "}
        </motion.div>{" "}
      </motion.div>{" "}
    </motion.article>
  );
}
