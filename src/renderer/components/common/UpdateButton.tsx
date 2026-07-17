import { CircleArrowUp, DownloadCloud, LoaderCircle } from "lucide-react";
import { useUpdateStore } from "../../store/useUpdateStore";
import { useToastStore } from "../../store/useToastStore";
import { cn } from "../../utils/cn";

function getUpdateButtonLabel(status: string): string {
  if (status === "checking") {
    return "Checking for updates";
  }

  if (status === "downloading") {
    return "Downloading update";
  }

  if (status === "installing") {
    return "Installing update";
  }

  return "Update Projecto";
}

export function UpdateButton({
  collapsed,
}: {
  collapsed: boolean;
}): JSX.Element | null {
  const updateState = useUpdateStore((state) => state.updateState);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const installUpdate = useUpdateStore((state) => state.installUpdate);
  const pushToast = useToastStore((state) => state.pushToast);
  const isBusy =
    updateState.status === "checking" ||
    updateState.status === "downloading" ||
    updateState.status === "installing";
  const Icon = isBusy
    ? LoaderCircle
    : updateState.updateAvailable
      ? DownloadCloud
      : CircleArrowUp;

  async function handleClick(): Promise<void> {
    if (isBusy) {
      return;
    }

    try {
      if (updateState.updateAvailable || updateState.status === "ready") {
        await installUpdate();
        return;
      }

      const nextState = await checkForUpdates();
      pushToast({
        title: nextState.updateAvailable
          ? "Projecto update available"
          : "Projecto is up to date",
        description: nextState.message,
        tone: nextState.updateAvailable ? "success" : "info",
      });
    } catch (error) {
      pushToast({
        title: "Unable to update Projecto",
        description:
          error instanceof Error ? error.message : "Unknown update error.",
        tone: "error",
      });
    }
  }

  return (
    <button
      aria-label={getUpdateButtonLabel(updateState.status)}
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-bg px-3 text-sm font-semibold text-text transition hover:bg-shell disabled:cursor-wait",
        collapsed ? "w-10 px-0" : "min-w-10",
      )}
      disabled={isBusy}
      onClick={() => {
        void handleClick();
      }}
      title={
        updateState.latestVersion
          ? `Projecto ${updateState.latestVersion} update`
          : getUpdateButtonLabel(updateState.status)
      }
      type="button"
    >
      <Icon className={cn("h-4 w-4", isBusy ? "animate-spin" : undefined)} />
      {!collapsed ? (
        <span className="sr-only">{getUpdateButtonLabel(updateState.status)}</span>
      ) : null}
    </button>
  );
}
