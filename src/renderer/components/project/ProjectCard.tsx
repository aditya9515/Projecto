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
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Project } from "../../../main/types/shared";
import { formatRelativeDate, truncateMiddle } from "../../utils/format";
import { Button } from "../common/Button";
import { StackBadge } from "./StackBadge";
import { cn } from "../../utils/cn";
import type { ProjectLaunchButtonState } from "../../utils/terminalSessions";
type ProjectCardProps = {
  project: Project;
  onLaunch: (project: Project) => void;
  onStopProject: (project: Project) => void;
  onOpenFolder: (project: Project) => void;
  onOpenEditor: (project: Project) => void;
  onRevealTerminal?: (project: Project) => void;
  onToggleFavorite: (project: Project) => void;
  onConfigureLaunch?: (project: Project) => void;
  launchState?: ProjectLaunchButtonState;
};
export function ProjectCard({
  project,
  onLaunch,
  onStopProject,
  onOpenFolder,
  onOpenEditor,
  onRevealTerminal,
  onToggleFavorite,
  onConfigureLaunch,
  launchState = project.missingFolder || project.launchProfiles.length === 0
    ? "disabled"
    : "launch",
}: ProjectCardProps): JSX.Element {
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
    <div className="app-card-surface group rounded-[24px] border border-line p-5 transition duration-200 ease-premium hover:border-line">
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
                {truncateMiddle(project.path, 58)}{" "}
              </div>{" "}
            </div>{" "}
            <button
              className={cn(
                "rounded-xl border p-2 transition duration-150 ease-premium",
                project.favorite
                  ? "app-control-selected"
                  : "app-control-surface",
                project.lockedBySubscription
                  ? "cursor-not-allowed opacity-60"
                  : "",
              )}
              disabled={project.lockedBySubscription}
              onClick={() => onToggleFavorite(project)}
              type="button"
            >
              {" "}
              <Star
                className={`h-4 w-4 ${project.favorite ? "fill-current" : ""}`}
              />{" "}
            </button>{" "}
          </div>{" "}
          <div className="flex flex-wrap items-center gap-2">
            {" "}
            <StackBadge
              detectedType={project.detectedType}
              framework={project.framework}
            />{" "}
            {project.packageManager ? (
              <span className="rounded-full border border-line bg-shell px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                {" "}
                {project.packageManager}{" "}
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
      <div className="mt-5 flex flex-wrap items-center gap-2 transition duration-150 ease-premium">
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
          <Button onClick={() => onConfigureLaunch(project)} variant="secondary">
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
      </div>{" "}
    </div>
  );
}
