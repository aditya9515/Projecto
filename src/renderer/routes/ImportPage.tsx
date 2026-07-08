import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CheckSquare,
  FolderTree,
  ListFilter,
  Play,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  canCreateProject,
  canUseBulkImport,
  parseUpgradeReason,
} from "../../billing/upgradeGate";
import type {
  BulkImportCandidate,
  DetectionResult,
  LaunchCommand,
} from "../../main/types/shared";
import { Button } from "../components/common/Button";
import { EmptyState } from "../components/common/EmptyState";
import { InlineWarning } from "../components/common/InlineWarning";
import { Input } from "../components/common/Input";
import { PremiumCard } from "../components/common/PremiumCard";
import { DetectionSummary } from "../components/project/DetectionSummary";
import { FolderPicker } from "../components/project/FolderPicker";
import { useProjectsStore } from "../store/useProjectsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { handleMappedLaunchError } from "../utils/launchErrorHandlers";
type ImportStep = "type" | "folder" | "scan" | "configure" | "finish";
type ImportType = "single" | "bulk";
const steps: Array<{ id: ImportStep; label: string }> = [
  { id: "type", label: "Type" },
  { id: "folder", label: "Folder" },
  { id: "scan", label: "Scan" },
  { id: "configure", label: "Configure" },
  { id: "finish", label: "Finish" },
];
function getFolderName(folderPath: string): string {
  const parts = folderPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}
function commandKey(label: string, command: string): string {
  return `${label}::${command}`;
}
function normalizeDirectoryKey(folderPath: string): string {
  const trimmed = folderPath.trim();
  const withoutTrailingSlash = trimmed.replace(/[\\/]+$/, "") || trimmed;
  const normalized = withoutTrailingSlash.replace(/\\/g, "/");
  const isWindowsPath = /\\/.test(trimmed) || /^[a-z]:/i.test(normalized);
  return isWindowsPath ? normalized.toLowerCase() : normalized;
}
function filterImportableBulkCandidates(
  candidates: BulkImportCandidate[],
  existingProjectPaths: string[],
): {
  candidates: BulkImportCandidate[];
  duplicateCount: number;
  existingCount: number;
} {
  const existingKeys = new Set(
    existingProjectPaths.map((entry) => normalizeDirectoryKey(entry)),
  );
  const seenKeys = new Set<string>();
  const importable: BulkImportCandidate[] = [];
  let duplicateCount = 0;
  let existingCount = 0;

  for (const candidate of candidates) {
    const key = normalizeDirectoryKey(candidate.path);
    if (existingKeys.has(key)) {
      existingCount += 1;
      continue;
    }
    if (seenKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }

    seenKeys.add(key);
    importable.push(candidate);
  }

  return { candidates: importable, duplicateCount, existingCount };
}
function isDirectorySelected(selectedPaths: string[], folderPath: string) {
  const key = normalizeDirectoryKey(folderPath);
  return selectedPaths.some((entry) => normalizeDirectoryKey(entry) === key);
}
function addSelectedDirectory(
  selectedPaths: string[],
  folderPath: string,
): string[] {
  if (isDirectorySelected(selectedPaths, folderPath)) {
    return selectedPaths;
  }
  return [...selectedPaths, folderPath];
}
function removeSelectedDirectory(
  selectedPaths: string[],
  folderPath: string,
): string[] {
  const key = normalizeDirectoryKey(folderPath);
  return selectedPaths.filter((entry) => normalizeDirectoryKey(entry) !== key);
}
function shouldRunOnLaunch(label: string, command: string): boolean {
  const normalized = `${label} ${command}`.toLowerCase();
  if (/\b(install|setup|build|test|lint|format|migrate)\b/.test(normalized)) {
    return false;
  }
  return /\b(dev|start|run|serve|server|app|api|worker|uvicorn|flask run|cargo run|docker compose up|vite|next dev|python3?\s+(?:-m\s+)?[\w./\\-]+(?:\.py)?|uv\s+run\s+python3?|bun dev|pnpm dev|yarn dev|npm run dev)\b/.test(
    normalized,
  );
}
function buildCommands(
  folderPath: string,
  detection: DetectionResult,
  selectedKeys: Set<string>,
): LaunchCommand[] {
  return detection.suggestedCommands.map((command, index) => ({
    id: `cmd-${index}-${crypto.randomUUID()}`,
    label: command.label,
    command: command.command,
    cwd: command.cwd || folderPath,
    runOnLaunch: selectedKeys.has(commandKey(command.label, command.command)),
  }));
}
export function ImportPage(): JSX.Element {
  const navigate = useNavigate();
  const projects = useProjectsStore((state) => state.projects);
  const scanFolder = useProjectsStore((state) => state.scanFolder);
  const scanWorkspace = useProjectsStore((state) => state.scanWorkspace);
  const createProject = useProjectsStore((state) => state.createProject);
  const bulkImportProjects = useProjectsStore(
    (state) => state.bulkImportProjects,
  );
  const settings = useSettingsStore((state) => state.settings);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const pushToast = useToastStore((state) => state.pushToast);
  const [step, setStep] = useState<ImportStep>("type");
  const [importType, setImportType] = useState<ImportType>("single");
  const [selectedPath, setSelectedPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedCommandKeys, setSelectedCommandKeys] = useState<Set<string>>(
    new Set(),
  );
  const [bulkCandidates, setBulkCandidates] = useState<BulkImportCandidate[]>(
    [],
  );
  const [selectedBulkPaths, setSelectedBulkPaths] = useState<string[]>([]);
  const [stackFilter, setStackFilter] = useState("all");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const bulkImportUnlocked = canUseBulkImport(subscription);
  const singleImportUnlocked = canCreateProject(subscription, projects.length);
  const duplicateProject = projects.find(
    (project) =>
      normalizeDirectoryKey(project.path) === normalizeDirectoryKey(selectedPath),
  );
  const selectedCommands = useMemo(() => {
    if (!detection) {
      return [];
    }
    return detection.suggestedCommands.filter((command) =>
      selectedCommandKeys.has(commandKey(command.label, command.command)),
    );
  }, [detection, selectedCommandKeys]);
  const visibleBulkCandidates = bulkCandidates.filter((candidate) =>
    stackFilter === "all"
      ? true
      : candidate.detection.detectedType === stackFilter ||
        candidate.detection.framework === stackFilter,
  );
  useEffect(() => {
    if (!detection) {
      setSelectedCommandKeys(new Set());
      return;
    }
    setSelectedCommandKeys(
      new Set(
        detection.suggestedCommands
          .filter((command) =>
            shouldRunOnLaunch(command.label, command.command),
          )
          .map((command) => commandKey(command.label, command.command)),
      ),
    );
  }, [detection]);
  async function handleSelectSingleFolder(): Promise<void> {
    if (!singleImportUnlocked) {
      openUpgradeModal("projects");
      return;
    }
    const folder = await window.launchStack.projects.selectFolder();
    if (!folder) {
      return;
    }
    setSelectedPath(folder);
    setProjectName(getFolderName(folder));
    setDetection(null);
    setScanning(true);
    try {
      const result = await scanFolder(folder);
      setDetection(result);
      setStep("scan");
    } catch (error) {
      pushToast({
        title: "Unable to scan folder",
        description:
          error instanceof Error ? error.message : "Unknown scan error.",
        tone: "error",
      });
    } finally {
      setScanning(false);
    }
  }
  async function handleBulkImportScan(): Promise<void> {
    if (!bulkImportUnlocked) {
      openUpgradeModal("bulkImport");
      return;
    }
    const folder = await window.launchStack.projects.selectFolder();
    if (!folder) {
      return;
    }
    setSelectedPath(folder);
    setScanning(true);
    try {
      const candidates = await scanWorkspace(folder);
      const {
        candidates: importableCandidates,
        duplicateCount,
        existingCount,
      } = filterImportableBulkCandidates(
        candidates,
        projects.map((project) => project.path),
      );
      setBulkCandidates(importableCandidates);
      setSelectedBulkPaths(
        importableCandidates.map((candidate) => candidate.path),
      );
      setStep("scan");
      if (duplicateCount > 0 || existingCount > 0) {
        pushToast({
          title: "Duplicate folders skipped",
          description: [
            existingCount > 0
              ? `${existingCount} already imported folder${existingCount === 1 ? "" : "s"}`
              : "",
            duplicateCount > 0
              ? `${duplicateCount} repeated scan result${duplicateCount === 1 ? "" : "s"}`
              : "",
          ]
            .filter(Boolean)
            .join(" and ")
            .concat(" were left out of this import."),
          tone: "info",
        });
      }
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
        title: "Unable to scan workspace",
        description:
          error instanceof Error ? error.message : "Unknown bulk import error.",
        tone: "error",
      });
    } finally {
      setScanning(false);
    }
  }
  async function handleSave(
    action: "import" | "open" | "launch",
  ): Promise<void> {
    if (!selectedPath || !detection) {
      return;
    }
    if (!singleImportUnlocked) {
      openUpgradeModal("projects");
      return;
    }
    setSaving(true);
    try {
      const selectedKeys = new Set(selectedCommandKeys);
      const commands = buildCommands(selectedPath, detection, selectedKeys);
      const launchCommandIds = commands
        .filter((command) => command.runOnLaunch)
        .map((command) => command.id);
      const project = await createProject({
        name: projectName.trim(),
        path: selectedPath,
        ...detection,
        commands,
        launchProfiles: [
          {
            id: `profile-${crypto.randomUUID()}`,
            name: "Default Launch",
            openEditor: true,
            openFolder: false,
            openBrowser: detection.suggestedBrowserUrls.length > 0,
            browserUrls: detection.suggestedBrowserUrls,
            commandIds: launchCommandIds,
            askBeforeRun: settings.askBeforeRunningNewCommands,
          },
        ],
      });
      pushToast({
        title: "Project imported",
        description: `${project.name} is ready in Projecto.`,
        tone: "success",
      });
      if (action === "open") {
        await window.launchStack.launcher.openEditor(project.id);
        navigate(`/projects/${project.id}`);
        return;
      }
      if (action === "launch") {
        navigate(`/projects/${project.id}`);
        const launchProfile = project.launchProfiles[0];
        if (launchProfile) {
          await window.launchStack.launcher.launchProfile(
            project.id,
            launchProfile.id,
            { approvedCommandIds: launchCommandIds, dangerousOverride: true },
          );
        }
        return;
      }
      navigate("/");
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        openUpgradeModal(upgradeReason);
        return;
      }
      pushToast({
        title: "Unable to save project",
        description:
          error instanceof Error ? error.message : "Unknown save error.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }
  async function handleBulkSave(): Promise<void> {
    const targets = filterImportableBulkCandidates(
      bulkCandidates.filter((candidate) =>
        isDirectorySelected(selectedBulkPaths, candidate.path),
      ),
      projects.map((project) => project.path),
    );
    if (targets.candidates.length === 0) {
      pushToast({
        title: "Nothing new to import",
        description:
          "Every selected folder is already in Projecto or appears more than once.",
        tone: "info",
      });
      return;
    }
    setSaving(true);
    try {
      const importedProjects = await bulkImportProjects(
        targets.candidates.map((candidate) => ({
          name: candidate.name,
          path: candidate.path,
          ...candidate.detection,
        })),
      );
      if (importedProjects.length === 0) {
        pushToast({
          title: "Nothing new to import",
          description:
            "Projecto skipped folders that were already registered before the import finished.",
          tone: "info",
        });
        return;
      }
      pushToast({
        title: "Workspace imported",
        description: `${importedProjects.length} project${importedProjects.length === 1 ? "" : "s"} were added to Projecto.`,
        tone: "success",
      });
      navigate("/projects");
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        openUpgradeModal(upgradeReason);
        return;
      }
      pushToast({
        title: "Bulk import failed",
        description:
          error instanceof Error ? error.message : "Unknown import error.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {" "}
      <PremiumCard className="p-5">
        {" "}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {" "}
          <div>
            {" "}
            <div className="text-xs uppercase tracking-[0.16em] text-muted">
              Import wizard
            </div>{" "}
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text">
              Turn a local folder into a Projecto workspace.
            </h2>{" "}
            <p className="mt-1 text-sm leading-6 text-muted">
              Projecto scans locally, previews commands, and syncs only project
              metadata through your account.
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap gap-2">
            {" "}
            {steps.map((entry) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${step === entry.id ? "app-control-selected" : "app-control-surface"}`}
                key={entry.id}
                onClick={() => setStep(entry.id)}
                type="button"
              >
                {" "}
                {entry.label}{" "}
              </button>
            ))}{" "}
          </div>{" "}
        </div>{" "}
      </PremiumCard>{" "}
      {step === "type" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {" "}
          <ImportTypeCard
            active={importType === "single"}
            description="Import one project folder, review its detected stack, and create a default launch profile."
            icon={<Rocket className="h-5 w-5" />}
            label="Single project"
            locked={!singleImportUnlocked}
            lockLabel="Standard limit"
            onClick={() => {
              if (!singleImportUnlocked) {
                openUpgradeModal("projects");
                return;
              }
              setImportType("single");
              setStep("folder");
            }}
          />{" "}
          <ImportTypeCard
            active={importType === "bulk"}
            description="Scan a parent workspace and import many detected project folders. Available on Pro."
            icon={<Boxes className="h-5 w-5" />}
            label="Workspace bulk import"
            locked={!bulkImportUnlocked}
            lockLabel="Pro"
            onClick={() => {
              if (!bulkImportUnlocked) {
                openUpgradeModal("bulkImport");
                return;
              }
              setImportType("bulk");
              setStep("folder");
            }}
          />{" "}
        </div>
      ) : null}{" "}
      {step === "folder" ? (
        importType === "single" ? (
          <FolderPicker
            onSelect={handleSelectSingleFolder}
            selectedPath={selectedPath}
          />
        ) : (
          <PremiumCard className="p-5">
            {" "}
            <div className="flex items-start gap-4">
              {" "}
              <div className="app-icon-surface flex h-12 w-12 items-center justify-center rounded-2xl text-text">
                {" "}
                <FolderTree className="h-5 w-5" />{" "}
              </div>{" "}
              <div className="min-w-0 flex-1">
                {" "}
                <h3 className="text-lg font-semibold tracking-tight text-text">
                  Choose a workspace folder
                </h3>{" "}
                <p className="mt-1 text-sm leading-6 text-muted">
                  Projecto will scan the first level of folders and detect
                  likely projects.
                </p>{" "}
                <div className="mt-4 app-code-surface rounded-2xl border border-line px-4 py-3 font-mono text-sm">
                  {" "}
                  {selectedPath || "No workspace selected"}{" "}
                </div>{" "}
                <Button
                  className="mt-4"
                  disabled={scanning}
                  onClick={() => void handleBulkImportScan()}
                  variant="primary"
                >
                  {" "}
                  <Boxes className="h-4 w-4" />{" "}
                  {scanning ? "Scanning workspace..." : "Browse and Scan"}{" "}
                </Button>{" "}
              </div>{" "}
            </div>{" "}
          </PremiumCard>
        )
      ) : null}{" "}
      {step === "scan" ? (
        importType === "single" ? (
          <div className="space-y-5">
            {" "}
            {duplicateProject ? (
              <InlineWarning title="Duplicate directory">
                {" "}
                This folder is already registered as {duplicateProject.name}.
                Saving again may be blocked by the backend.{" "}
              </InlineWarning>
            ) : null}{" "}
            {detection ? (
              <DetectionSummary result={detection} />
            ) : (
              <EmptyState
                description="Choose a folder to scan before reviewing results."
                title="No scan result yet"
              />
            )}{" "}
            <div className="flex justify-end gap-2">
              {" "}
              <Button onClick={() => setStep("folder")} variant="secondary">
                {" "}
                Back{" "}
              </Button>{" "}
              <Button
                disabled={!detection}
                onClick={() => setStep("configure")}
                variant="primary"
              >
                {" "}
                Configure Launch{" "}
              </Button>{" "}
            </div>{" "}
          </div>
        ) : (
          <BulkCandidateTable
            candidates={visibleBulkCandidates}
            onImport={() => void handleBulkSave()}
            saving={saving}
            selectedPaths={selectedBulkPaths}
            setSelectedPaths={setSelectedBulkPaths}
            stackFilter={stackFilter}
            setStackFilter={setStackFilter}
          />
        )
      ) : null}{" "}
      {step === "configure" && detection ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {" "}
          <PremiumCard className="p-5">
            {" "}
            <div className="space-y-4">
              {" "}
              <div>
                {" "}
                <h3 className="text-lg font-semibold tracking-tight text-text">
                  Configure launch profile
                </h3>{" "}
                <p className="mt-1 text-sm leading-6 text-muted">
                  Choose which detected commands should run when you press
                  Launch.
                </p>{" "}
              </div>{" "}
              <div className="space-y-2">
                {" "}
                <label
                  className="text-sm font-medium text-text"
                  htmlFor="project-name"
                >
                  {" "}
                  Project name{" "}
                </label>{" "}
                <Input
                  id="project-name"
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="My Workspace"
                  value={projectName}
                />{" "}
              </div>{" "}
              <div className="space-y-3">
                {" "}
                {detection.suggestedCommands.length === 0 ? (
                  <InlineWarning title="No runtime command detected">
                    {" "}
                    Projecto can still import this folder. Add commands later
                    from the project detail page.{" "}
                  </InlineWarning>
                ) : (
                  detection.suggestedCommands.map((command) => {
                    const key = commandKey(command.label, command.command);
                    const checked = selectedCommandKeys.has(key);
                    return (
                      <label
                        className="flex items-start gap-3 rounded-2xl border border-line bg-shell px-4 py-3"
                        key={key}
                      >
                        {" "}
                        <input
                          checked={checked}
                          className="mt-1 h-4 w-4 rounded border-line bg-panel text-text focus:ring-accent"
                          onChange={(event) => {
                            setSelectedCommandKeys((current) => {
                              const next = new Set(current);
                              if (event.target.checked) {
                                next.add(key);
                              } else {
                                next.delete(key);
                              }
                              return next;
                            });
                          }}
                          type="checkbox"
                        />{" "}
                        <div className="min-w-0">
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
                        </div>{" "}
                      </label>
                    );
                  })
                )}{" "}
              </div>{" "}
            </div>{" "}
          </PremiumCard>{" "}
          <PremiumCard className="p-5">
            {" "}
            <div className="flex items-start gap-3">
              {" "}
              <div className="app-icon-surface flex h-11 w-11 items-center justify-center rounded-2xl text-text">
                {" "}
                <ShieldCheck className="h-4 w-4" />{" "}
              </div>{" "}
              <div>
                {" "}
                <h3 className="text-lg font-semibold tracking-tight text-text">
                  Before import
                </h3>{" "}
                <p className="mt-1 text-sm leading-6 text-muted">
                  {" "}
                  Projecto will ask before running commands according to your
                  Safety setting. You can edit every command later.{" "}
                </p>{" "}
              </div>{" "}
            </div>{" "}
            <div className="mt-5 space-y-3 text-sm">
              {" "}
              <SummaryLine
                label="Selected commands"
                value={String(selectedCommands.length)}
              />{" "}
              <SummaryLine label="Editor" value="VS Code" />{" "}
              <SummaryLine
                label="Browser URLs"
                value={String(detection.suggestedBrowserUrls.length)}
              />{" "}
              <SummaryLine
                label="Ask before run"
                value={
                  settings.askBeforeRunningNewCommands ? "Enabled" : "Disabled"
                }
              />{" "}
            </div>{" "}
            <div className="mt-5 flex flex-col gap-2">
              {" "}
              <Button
                disabled={projectName.trim().length === 0 || saving}
                onClick={() => void handleSave("import")}
                variant="primary"
              >
                {" "}
                {saving ? "Importing..." : "Import Only"}{" "}
              </Button>{" "}
              <Button
                disabled={projectName.trim().length === 0 || saving}
                onClick={() => void handleSave("open")}
                variant="secondary"
              >
                {" "}
                Import and Open{" "}
              </Button>{" "}
              <Button
                disabled={projectName.trim().length === 0 || saving}
                onClick={() => void handleSave("launch")}
                variant="secondary"
              >
                {" "}
                <Play className="h-4 w-4" /> Import and Launch{" "}
              </Button>{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </div>
      ) : null}{" "}
      {step === "finish" ? (
        <EmptyState
          actionLabel="View Projects"
          description="Imported projects will appear on Home, Projects, and the Command Palette."
          icon={<CheckSquare className="h-6 w-6" />}
          onAction={() => navigate("/projects")}
          title="Ready when you are"
        />
      ) : null}{" "}
    </div>
  );
}
function ImportTypeCard({
  label,
  description,
  icon,
  active,
  locked = false,
  lockLabel = "Pro",
  onClick,
}: {
  label: string;
  description: string;
  icon: JSX.Element;
  active: boolean;
  locked?: boolean;
  lockLabel?: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className={`rounded-[28px] border p-6 text-left transition ${active ? "app-choice-selected" : "app-control-surface"}`}
      onClick={onClick}
      type="button"
    >
      {" "}
      <div className="flex items-start gap-4">
        {" "}
        <div className="app-icon-surface flex h-12 w-12 items-center justify-center rounded-2xl text-text">
          {icon}
        </div>{" "}
        <div>
          {" "}
          <div className="flex items-center gap-2 text-lg font-semibold tracking-tight text-text">
            {" "}
            {label}{" "}
            {locked ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                {lockLabel}
              </span>
            ) : null}{" "}
          </div>{" "}
          <div className="mt-2 text-sm leading-6 text-muted">
            {description}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </button>
  );
}
function BulkCandidateTable({
  candidates,
  selectedPaths,
  setSelectedPaths,
  saving,
  stackFilter,
  setStackFilter,
  onImport,
}: {
  candidates: BulkImportCandidate[];
  selectedPaths: string[];
  setSelectedPaths: (paths: string[]) => void;
  saving: boolean;
  stackFilter: string;
  setStackFilter: (filter: string) => void;
  onImport: () => void;
}): JSX.Element {
  const stackOptions = [
    "all",
    ...Array.from(
      new Set(candidates.map((candidate) => candidate.detection.detectedType)),
    ),
  ];
  const selectedCount = selectedPaths.length;
  return (
    <PremiumCard className="p-5">
      {" "}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {" "}
        <div>
          {" "}
          <h3 className="text-lg font-semibold tracking-tight text-text">
            Workspace candidates
          </h3>{" "}
          <p className="mt-1 text-sm leading-6 text-muted">
            Select the detected folders you want Projecto to sync.
          </p>{" "}
        </div>{" "}
        <div className="flex flex-wrap gap-2">
          {" "}
          <Button
            onClick={() =>
              setSelectedPaths(candidates.map((candidate) => candidate.path))
            }
            variant="secondary"
          >
            {" "}
            Select All{" "}
          </Button>{" "}
          <Button onClick={() => setSelectedPaths([])} variant="ghost">
            {" "}
            Clear{" "}
          </Button>{" "}
          <Button
            disabled={selectedPaths.length === 0 || saving}
            onClick={onImport}
            variant="primary"
          >
            {" "}
            <CheckSquare className="h-4 w-4" />{" "}
            {saving ? "Importing..." : `Import ${selectedCount}`}{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
      <div className="mt-5 flex items-center gap-2">
        {" "}
        <ListFilter className="h-4 w-4 text-muted" />{" "}
        <select
          className="h-10 rounded-xl border border-line bg-panel px-3 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          onChange={(event) => setStackFilter(event.target.value)}
          value={stackFilter}
        >
          {" "}
          {stackOptions.map((option) => (
            <option key={option} value={option}>
              {" "}
              {option === "all" ? "All stacks" : option}{" "}
            </option>
          ))}{" "}
        </select>{" "}
      </div>{" "}
      <div className="mt-5 space-y-3">
        {" "}
        {candidates.length === 0 ? (
          <EmptyState
            description="No projects matched the current filter."
            title="No candidates"
          />
        ) : (
          candidates.map((candidate) => {
            const checked = isDirectorySelected(selectedPaths, candidate.path);
            return (
              <label
                className="flex items-start gap-3 rounded-2xl border border-line bg-shell px-4 py-3"
                key={candidate.path}
              >
                {" "}
                <input
                  checked={checked}
                  className="mt-1 h-4 w-4 rounded border-line bg-panel text-text focus:ring-accent"
                  onChange={(event) => {
                    setSelectedPaths(
                      event.target.checked
                        ? addSelectedDirectory(selectedPaths, candidate.path)
                        : removeSelectedDirectory(
                            selectedPaths,
                            candidate.path,
                          ),
                    );
                  }}
                  type="checkbox"
                />{" "}
                <div className="min-w-0">
                  {" "}
                  <div className="text-sm font-semibold text-text">
                    {candidate.name}
                  </div>{" "}
                  <div className="mt-1 text-xs text-muted">
                    {candidate.path}
                  </div>{" "}
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-muted">
                    {" "}
                    {candidate.detection.framework ??
                      candidate.detection.detectedType}{" "}
                  </div>{" "}
                </div>{" "}
              </label>
            );
          })
        )}{" "}
      </div>{" "}
    </PremiumCard>
  );
}
function SummaryLine({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-shell px-4 py-3">
      {" "}
      <span className="text-muted">{label}</span>{" "}
      <span className="font-semibold text-text">{value}</span>{" "}
    </div>
  );
}
