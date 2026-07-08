import { EventEmitter } from "node:events";

import { app, autoUpdater } from "electron";
import { z } from "zod";

import {
  DesktopUpdateStateSchema,
  type DesktopUpdateCheckOptions,
  type DesktopUpdateState,
} from "../types/shared";

const DEFAULT_UPDATE_CHECK_URL =
  "https://projecto.adityakosuru.online/api/desktop/update/check";

const UpdateManifestSchema = z
  .object({
    updateAvailable: z.boolean(),
    latestVersion: z.string().min(1),
    releaseNotes: z.string().optional(),
    releaseDate: z.string().optional(),
    feedUrl: z.string().url().optional(),
    setupUrl: z.string().url().optional(),
    setupFileName: z.string().min(1).optional(),
    setupSha256: z.string().min(1).optional(),
    setupSize: z.string().min(1).optional(),
    mandatory: z.boolean().optional(),
  })
  .passthrough();

type NativeAutoUpdater = Pick<
  typeof autoUpdater,
  "setFeedURL" | "checkForUpdates" | "quitAndInstall" | "on" | "off"
>;

type UpdateServiceOptions = {
  checkUrl?: string;
  currentVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  isPackaged?: boolean;
  request?: typeof fetch;
  openExternal?: (url: string) => Promise<void>;
  nativeUpdater?: NativeAutoUpdater;
};

type UpdateServiceEventMap = {
  "state-changed": (state: DesktopUpdateState) => void;
};

function getConfiguredCheckUrl(): string {
  const candidate =
    process.env.PROJECTO_UPDATE_CHECK_URL?.trim() || DEFAULT_UPDATE_CHECK_URL;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const isLocalHttp =
      parsed.protocol === "http:" &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1");

    if (parsed.protocol !== "https:" && !isLocalHttp) {
      return DEFAULT_UPDATE_CHECK_URL;
    }

    return parsed.toString();
  } catch {
    return DEFAULT_UPDATE_CHECK_URL;
  }
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown update error.";
}

function isWindowsSquirrelPlatform(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

export class UpdateService {
  private readonly events = new EventEmitter();
  private readonly checkUrl: string;
  private readonly currentVersion: string;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly isPackaged: boolean;
  private readonly request: typeof fetch;
  private readonly nativeUpdater: NativeAutoUpdater;
  private readonly openExternal?: (url: string) => Promise<void>;
  private nativeInstallRequested = false;
  private disposed = false;
  private state: DesktopUpdateState;

  constructor(options: UpdateServiceOptions = {}) {
    this.checkUrl = options.checkUrl ?? getConfiguredCheckUrl();
    this.currentVersion = options.currentVersion ?? app.getVersion();
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.isPackaged = options.isPackaged ?? app.isPackaged;
    this.request = options.request ?? fetch;
    this.nativeUpdater = options.nativeUpdater ?? autoUpdater;
    this.openExternal = options.openExternal;
    this.state = DesktopUpdateStateSchema.parse({
      status: "idle",
      currentVersion: this.currentVersion,
      updateAvailable: false,
    });

    this.bindNativeUpdater();
  }

  onStateChange(listener: UpdateServiceEventMap["state-changed"]): () => void {
    this.events.on("state-changed", listener);
    return () => {
      this.events.off("state-changed", listener);
    };
  }

  getState(): DesktopUpdateState {
    return this.state;
  }

  async checkForUpdates(
    options?: DesktopUpdateCheckOptions,
  ): Promise<DesktopUpdateState> {
    this.patchState({
      status: "checking",
      error: undefined,
      message: "Checking for Projecto updates...",
      progressPercent: undefined,
    });

    try {
      const response = await this.request(this.buildCheckUrl(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Projecto-Client": "desktop",
        },
      });

      if (!response.ok) {
        throw new Error(response.statusText || "Update check failed.");
      }

      const manifest = UpdateManifestSchema.parse(await response.json());
      const checkedAt = new Date().toISOString();

      if (!manifest.updateAvailable) {
        this.patchState({
          ...manifest,
          status: "unavailable",
          checkedAt,
          updateAvailable: false,
          message: "Projecto is up to date.",
          progressPercent: undefined,
          error: undefined,
        });
        return this.state;
      }

      this.patchState({
        ...manifest,
        status: "available",
        checkedAt,
        updateAvailable: true,
        message: `Projecto ${manifest.latestVersion} is ready to install.`,
        progressPercent: undefined,
        error: undefined,
      });
      return this.state;
    } catch (error) {
      const message = normalizeError(error);
      this.patchState({
        status: options?.silent ? "idle" : "error",
        updateAvailable: false,
        message: options?.silent
          ? "Projecto could not check for updates silently."
          : "Projecto could not check for updates.",
        error: message,
        progressPercent: undefined,
      });
      throw error;
    }
  }

  async installUpdate(): Promise<DesktopUpdateState> {
    if (!this.state.updateAvailable) {
      await this.checkForUpdates();
    }

    if (!this.state.updateAvailable) {
      this.patchState({
        status: "unavailable",
        message: "Projecto is already up to date.",
      });
      return this.state;
    }

    if (this.canUseNativeUpdater()) {
      this.nativeInstallRequested = true;
      this.patchState({
        status: "downloading",
        message: `Downloading Projecto ${this.state.latestVersion ?? ""}...`,
        progressPercent: undefined,
        error: undefined,
      });

      try {
        this.nativeUpdater.setFeedURL({ url: this.state.feedUrl! });
        this.nativeUpdater.checkForUpdates();
      } catch (error) {
        this.handleInstallFailure(error);
      }

      return this.state;
    }

    if (!this.state.setupUrl) {
      const error = new Error(
        "The update manifest does not include a setup download URL.",
      );
      this.handleInstallFailure(error);
      throw error;
    }

    this.patchState({
      status: "downloading",
      message:
        "Opening the Projecto installer download. Run the installer after it finishes downloading.",
      progressPercent: 100,
      error: undefined,
    });

    await this.openExternal?.(this.state.setupUrl);

    this.patchState({
      status: "ready",
      message:
        "Installer download opened. Close Projecto and run the installer to finish this update.",
      progressPercent: 100,
    });

    return this.state;
  }

  dispose(): void {
    this.disposed = true;
    this.nativeInstallRequested = false;
    this.nativeUpdater.off("checking-for-update", this.handleCheckingForUpdate);
    this.nativeUpdater.off("update-available", this.handleUpdateAvailable);
    this.nativeUpdater.off(
      "update-not-available",
      this.handleUpdateNotAvailable,
    );
    this.nativeUpdater.off("update-downloaded", this.handleUpdateDownloaded);
    this.nativeUpdater.off("error", this.handleNativeError);
    this.events.removeAllListeners();
  }

  private bindNativeUpdater(): void {
    this.nativeUpdater.on("checking-for-update", this.handleCheckingForUpdate);
    this.nativeUpdater.on("update-available", this.handleUpdateAvailable);
    this.nativeUpdater.on(
      "update-not-available",
      this.handleUpdateNotAvailable,
    );
    this.nativeUpdater.on("update-downloaded", this.handleUpdateDownloaded);
    this.nativeUpdater.on("error", this.handleNativeError);
  }

  private readonly handleCheckingForUpdate = (): void => {
    if (!this.nativeInstallRequested) {
      return;
    }

    this.patchState({
      status: "downloading",
      message: "Preparing the Projecto update download...",
      error: undefined,
    });
  };

  private readonly handleUpdateAvailable = (): void => {
    if (!this.nativeInstallRequested) {
      return;
    }

    this.patchState({
      status: "downloading",
      message: `Downloading Projecto ${this.state.latestVersion ?? ""}...`,
      error: undefined,
    });
  };

  private readonly handleUpdateNotAvailable = (): void => {
    this.nativeInstallRequested = false;
    this.patchState({
      status: "unavailable",
      updateAvailable: false,
      message: "Projecto is already up to date.",
      progressPercent: undefined,
    });
  };

  private readonly handleUpdateDownloaded = (): void => {
    this.patchState({
      status: "installing",
      message: "Installing Projecto update. The app will restart shortly.",
      progressPercent: 100,
      error: undefined,
    });

    if (this.nativeInstallRequested) {
      setTimeout(() => {
        this.nativeUpdater.quitAndInstall();
      }, 750);
    }
  };

  private readonly handleNativeError = (error: Error): void => {
    this.handleInstallFailure(error);
  };

  private handleInstallFailure(error: unknown): void {
    this.nativeInstallRequested = false;
    this.patchState({
      status: "error",
      message: "Projecto could not install the update.",
      error: normalizeError(error),
      progressPercent: undefined,
    });
  }

  private canUseNativeUpdater(): boolean {
    return (
      this.isPackaged &&
      isWindowsSquirrelPlatform(this.platform) &&
      Boolean(this.state.feedUrl)
    );
  }

  private buildCheckUrl(): string {
    const url = new URL(this.checkUrl);
    url.searchParams.set("version", this.currentVersion);
    url.searchParams.set("platform", this.platform);
    url.searchParams.set("arch", this.arch);
    return url.toString();
  }

  private patchState(patch: Partial<DesktopUpdateState>): void {
    if (this.disposed) {
      return;
    }

    this.state = DesktopUpdateStateSchema.parse({
      ...this.state,
      ...patch,
      currentVersion: this.currentVersion,
    });
    this.events.emit("state-changed", this.state);
  }
}
