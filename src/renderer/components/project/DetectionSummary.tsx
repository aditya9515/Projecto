import type { DetectionResult } from "../../../main/types/shared";
import { StackBadge } from "./StackBadge";
type DetectionSummaryProps = { result: DetectionResult };
export function DetectionSummary({
  result,
}: DetectionSummaryProps): JSX.Element {
  return (
    <div className="space-y-5 rounded-[24px] border border-line bg-panel p-5">
      {" "}
      <div className="flex items-start justify-between gap-4">
        {" "}
        <div>
          {" "}
          <h2 className="text-lg font-semibold tracking-tight text-text">
            Detection Summary
          </h2>{" "}
          <p className="mt-1 text-sm text-muted">
            Review what Projecto found before saving the project.
          </p>{" "}
        </div>{" "}
        <StackBadge
          detectedType={result.detectedType}
          framework={result.framework}
        />{" "}
      </div>{" "}
      <div className="grid gap-4 lg:grid-cols-3">
        {" "}
        <div className="rounded-2xl border border-line bg-shell p-4">
          {" "}
          <div className="text-xs uppercase tracking-[0.16em] text-muted">
            Project Type
          </div>{" "}
          <div className="mt-2 text-base font-semibold text-text">
            {result.framework ?? result.detectedType}
          </div>{" "}
        </div>{" "}
        <div className="rounded-2xl border border-line bg-shell p-4">
          {" "}
          <div className="text-xs uppercase tracking-[0.16em] text-muted">
            Package Manager
          </div>{" "}
          <div className="mt-2 text-base font-semibold text-text">
            {result.packageManager ?? "Unknown"}
          </div>{" "}
        </div>{" "}
        <div className="rounded-2xl border border-line bg-shell p-4">
          {" "}
          <div className="text-xs uppercase tracking-[0.16em] text-muted">
            Suggested Browser URLs
          </div>{" "}
          <div className="mt-2 space-y-1 text-sm text-text">
            {" "}
            {result.suggestedBrowserUrls.length > 0 ? (
              result.suggestedBrowserUrls.map((url) => (
                <div key={url}>{url}</div>
              ))
            ) : (
              <div className="text-muted">None</div>
            )}{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      <div className="grid gap-4 lg:grid-cols-2">
        {" "}
        <div className="rounded-2xl border border-line bg-shell p-4">
          {" "}
          <div className="text-xs uppercase tracking-[0.16em] text-muted">
            Detected Files
          </div>{" "}
          <div className="mt-3 flex flex-wrap gap-2">
            {" "}
            {result.detectedFiles.length > 0 ? (
              result.detectedFiles.map((file) => (
                <span
                  className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-text"
                  key={file}
                >
                  {" "}
                  {file}{" "}
                </span>
              ))
            ) : (
              <div className="text-sm text-muted">
                No known project markers were found.
              </div>
            )}{" "}
          </div>{" "}
        </div>{" "}
        <div className="rounded-2xl border border-line bg-shell p-4">
          {" "}
          <div className="text-xs uppercase tracking-[0.16em] text-muted">
            Suggested Commands
          </div>{" "}
          <div className="mt-3 space-y-3">
            {" "}
            {result.suggestedCommands.length > 0 ? (
              result.suggestedCommands.map((command) => (
                <div
                  className="app-code-surface rounded-xl border border-line p-3"
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
                No command suggestions were detected for this folder.
              </div>
            )}{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
