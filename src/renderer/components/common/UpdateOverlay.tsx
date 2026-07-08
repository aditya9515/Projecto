import { CheckCircle2, DownloadCloud, LoaderCircle, XCircle } from "lucide-react";
import { Button } from "./Button";
import { useUpdateStore } from "../../store/useUpdateStore";

export function UpdateOverlay(): JSX.Element | null {
  const updateState = useUpdateStore((state) => state.updateState);
  const setUpdateState = useUpdateStore((state) => state.setUpdateState);
  const visible =
    updateState.status === "downloading" ||
    updateState.status === "installing" ||
    updateState.status === "ready" ||
    updateState.status === "error";

  if (!visible) {
    return null;
  }

  const isBusy =
    updateState.status === "downloading" || updateState.status === "installing";
  const Icon =
    updateState.status === "error"
      ? XCircle
      : updateState.status === "ready"
        ? CheckCircle2
        : updateState.status === "downloading"
          ? DownloadCloud
          : LoaderCircle;
  const title =
    updateState.status === "installing"
      ? "Installing Projecto"
      : updateState.status === "downloading"
        ? "Updating Projecto"
        : updateState.status === "ready"
          ? "Update Ready"
          : "Update Failed";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-bg p-4">
      <div className="app-popup-surface w-[min(560px,calc(100vw-2rem))] rounded-[28px] border border-line p-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-shell text-text">
          <Icon className={`h-6 w-6 ${isBusy ? "animate-spin" : ""}`} />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-text">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
          {updateState.message ??
            "Projecto is preparing the latest desktop version."}
        </p>
        {updateState.latestVersion ? (
          <div className="mt-5 rounded-2xl border border-line bg-bg px-4 py-3 text-sm font-semibold text-text">
            Version {updateState.latestVersion}
          </div>
        ) : null}
        <div className="mt-6 h-3 overflow-hidden rounded-full border border-line bg-shell">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{
              width: `${updateState.progressPercent ?? (isBusy ? 62 : 100)}%`,
            }}
          />
        </div>
        {updateState.error ? (
          <p className="mt-4 break-words rounded-2xl border border-line bg-bg px-4 py-3 text-left text-xs leading-5 text-muted">
            {updateState.error}
          </p>
        ) : null}
        {!isBusy ? (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => {
                setUpdateState({
                  ...updateState,
                  status: updateState.updateAvailable ? "available" : "idle",
                  error: undefined,
                });
              }}
              variant="secondary"
            >
              Close
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
