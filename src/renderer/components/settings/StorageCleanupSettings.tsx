import {
  DatabaseZap,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CleanupStatus } from "../../../main/types/shared";
import { formatAbsoluteDate } from "../../utils/format";
import { getFriendlyErrorMessage } from "../../utils/errors";
import { useToastStore } from "../../store/useToastStore";
import { Button } from "../common/Button";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { PremiumCard } from "../common/PremiumCard";
import { StatusPill } from "../common/StatusPill";

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function StorageCleanupSettings(): JSX.Element {
  const pushToast = useToastStore((state) => state.pushToast);
  const [status, setStatus] = useState<CleanupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setStatus(await window.launchStack.maintenance.getStatus());
    } catch (error) {
      pushToast({
        title: "Unable to inspect storage",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not calculate the safe cleanup preview.",
        ),
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const confirmationDetails = useMemo(() => {
    if (!status) {
      return [];
    }

    return [
      ...status.preview.categories
        .filter(
          (category) =>
            category.fileCount > 0 || category.estimatedBytes > 0,
        )
        .map(
          (category) =>
            `${category.label}: ${category.fileCount} files · ${formatBytes(category.estimatedBytes)}`,
        ),
      "Protected: projects, settings, approvals, account sessions, and active runs.",
    ];
  }, [status]);

  async function handleCleanup(): Promise<void> {
    setCleaning(true);
    try {
      const report = await window.launchStack.maintenance.cleanup();
      setStatus(await window.launchStack.maintenance.getStatus());
      setConfirmOpen(false);
      pushToast({
        title: report.errors.length > 0 ? "Cleanup completed with warnings" : "Cleanup complete",
        description: `${report.removedFiles} files removed · ${formatBytes(report.reclaimedBytes)} reclaimed.`,
        tone: report.errors.length > 0 ? "info" : "success",
      });
    } catch (error) {
      pushToast({
        title: "Cleanup failed",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not complete the safe cleanup.",
        ),
        tone: "error",
      });
    } finally {
      setCleaning(false);
    }
  }

  const preview = status?.preview;
  const hasCleanup = Boolean(
    preview && (preview.totalFiles > 0 || preview.estimatedBytes > 0),
  );

  return (
    <>
      <PremiumCard className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="app-icon-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.3rem] text-text">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                Storage & cleanup
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-text">
                Safe desktop maintenance
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                Projecto cleans eligible caches and old app-owned artifacts once per version. Preview the same allowlist before running it manually.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loading || cleaning}
              onClick={() => void loadStatus()}
              variant="secondary"
            >
              <RefreshCw className="h-4 w-4" /> Refresh preview
            </Button>
            <Button
              disabled={loading || cleaning || !hasCleanup}
              onClick={() => setConfirmOpen(true)}
              variant="danger"
            >
              <Trash2 className="h-4 w-4" />
              {cleaning ? "Cleaning..." : "Clean safely"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(preview?.categories ?? []).map((category) => (
            <div
              className="rounded-2xl border border-line bg-shell px-4 py-4"
              key={category.category}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-text">
                  {category.label}
                </div>
                <StatusPill
                  tone={
                    category.fileCount > 0 || category.estimatedBytes > 0
                      ? "warning"
                      : "success"
                  }
                >
                  {formatBytes(category.estimatedBytes)}
                </StatusPill>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted">
                {category.description}
              </div>
              <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                {category.fileCount} eligible files
              </div>
            </div>
          ))}
          {!preview ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-sm text-muted sm:col-span-2 xl:col-span-4">
              {loading ? "Calculating cleanup preview..." : "Storage preview is unavailable."}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
          <div className="rounded-2xl border border-line bg-shell p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <ShieldCheck className="h-4 w-4" /> Always protected
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(preview?.protectedItems ?? []).map((item) => (
                <div className="text-xs leading-5 text-muted" key={item}>
                  · {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-shell p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <HardDrive className="h-4 w-4" /> Cleanup summary
            </div>
            <div className="mt-3 text-2xl font-semibold text-text">
              {formatBytes(preview?.estimatedBytes ?? 0)}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted">
              Estimated reclaimable storage across {preview?.totalFiles ?? 0} files. Run artifacts use a {preview?.retentionDays ?? 30}-day retention window.
            </div>
            {status?.lastReport ? (
              <div className="mt-3 border-t border-line pt-3 text-xs leading-5 text-muted">
                Last {status.lastReport.trigger} cleanup: {formatAbsoluteDate(status.lastReport.completedAt)} · {formatBytes(status.lastReport.reclaimedBytes)} reclaimed
              </div>
            ) : null}
          </div>
        </div>
      </PremiumCard>

      <ConfirmDialog
        confirmLabel={cleaning ? "Cleaning..." : "Clean eligible files"}
        description="This permanently removes only the allowlisted items in the preview. Protected Projecto data and project folders are not touched."
        destructive
        details={confirmationDetails}
        onConfirm={handleCleanup}
        onOpenChange={(open) => {
          if (!cleaning) {
            setConfirmOpen(open);
          }
        }}
        open={confirmOpen}
        title="Run safe cleanup?"
      />
    </>
  );
}
