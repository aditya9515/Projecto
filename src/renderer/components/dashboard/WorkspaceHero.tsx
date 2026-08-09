import {
  ArrowUpRight,
  Command,
  FolderCode,
  FolderPlus,
  ScanSearch,
  TerminalSquare,
} from "lucide-react";
import { Button } from "../common/Button";
import { RollingTitle } from "../motion/RollingTitle";

export function WorkspaceHero({
  activeRunCount,
  online,
  projectCount,
  onAddProject,
  onOpenCommandPalette,
}: {
  activeRunCount: number;
  online: boolean;
  projectCount: number;
  onAddProject: () => void;
  onOpenCommandPalette: () => void;
}): JSX.Element {
  return (
    <section className="projecto-workspace-hero">
      <div className="projecto-hero-copy">
        <div className="projecto-micro-label">Project control / local runtime</div>
        <RollingTitle
          className="projecto-hero-title"
          text={"CONTROL\nYOUR\nWORKSPACE."}
        />
        <p className="projecto-hero-description">
          Detect project structure, map repeatable launch profiles, and keep
          every local runtime within reach.
        </p>
        <div className="projecto-hero-actions">
          <Button
            leadingIcon={<FolderPlus className="h-4 w-4" />}
            onClick={onAddProject}
            variant="primary"
          >
            Open project
          </Button>
          <Button
            className="projecto-hero-secondary"
            leadingIcon={<Command className="h-4 w-4" />}
            onClick={onOpenCommandPalette}
            variant="ghost"
          >
            Command palette
          </Button>
        </div>
      </div>

      <div
        aria-label="Projecto workflow: project folder, stack scan, launch profile, and active terminal"
        className="projecto-flow-panel"
        role="img"
      >
        <div className="projecto-flow-header">
          <span>Launch pipeline</span>
          <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
        </div>
        <div aria-hidden="true" className="projecto-flow-canvas">
          <FlowNode icon={<FolderCode />} index="01" label="Project folder" />
          <FlowNode icon={<ScanSearch />} index="02" label="Stack detection" />
          <FlowNode icon={<Command />} index="03" label="Launch profile" />
          <FlowNode
            active={activeRunCount > 0}
            icon={<TerminalSquare />}
            index="04"
            label={activeRunCount > 0 ? "Runtime active" : "Terminal ready"}
          />
        </div>
        <div className="projecto-flow-footer">
          <FlowMetric label="Projects" value={String(projectCount).padStart(2, "0")} />
          <FlowMetric label="Active runs" value={String(activeRunCount).padStart(2, "0")} />
          <FlowMetric label="Connection" value={online ? "Live" : "Offline"} />
        </div>
      </div>
    </section>
  );
}

function FlowNode({
  active = false,
  icon,
  index,
  label,
}: {
  active?: boolean;
  icon: JSX.Element;
  index: string;
  label: string;
}): JSX.Element {
  return (
    <div className={`projecto-flow-node${active ? " is-active" : ""}`}>
      <span className="projecto-flow-index">{index}</span>
      <span className="projecto-flow-icon">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function FlowMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
