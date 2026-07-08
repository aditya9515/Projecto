import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { shellOpenExternal, spawnMock, execFileMock } = vi.hoisted(() => ({
  shellOpenExternal: vi.fn(),
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
}));

vi.mock("electron", () => ({
  shell: {
    openExternal: shellOpenExternal,
  },
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  execFile: execFileMock,
}));

import { ExternalUrlService } from "../externalUrlService";

type SpawnBehavior = {
  error?: Error;
  exitCode?: number;
};

function createChildProcess(
  behavior?: SpawnBehavior,
): EventEmitter & { unref: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as EventEmitter & {
    unref: ReturnType<typeof vi.fn>;
  };
  child.unref = vi.fn();

  queueMicrotask(() => {
    if (behavior?.error) {
      child.emit("error", behavior.error);
      return;
    }

    child.emit("spawn");
    child.emit("exit", behavior?.exitCode ?? 0, null);
  });

  return child;
}

describe("ExternalUrlService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellOpenExternal.mockResolvedValue(undefined);
    execFileMock.mockImplementation((file, args, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      const joinedArgs = Array.isArray(args) ? args.join(" ") : "";

      if (joinedArgs.includes("UrlAssociations\\https\\UserChoice")) {
        cb?.(
          null,
          "HKEY_CURRENT_USER\\...\\https\\UserChoice\n    ProgId    REG_SZ    ChromeHTML\n",
          "",
        );
        return;
      }

      if (joinedArgs.includes("ChromeHTML\\shell\\open\\command")) {
        cb?.(
          null,
          'HKEY_CLASSES_ROOT\\ChromeHTML\\shell\\open\\command\n    (Default)    REG_SZ    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --single-argument %1\n',
          "",
        );
        return;
      }

      cb?.(
        new Error(`Unexpected execFile call: ${file} ${joinedArgs}`),
        "",
        "",
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a dedicated Chrome window first on Windows when the default browser is known", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    spawnMock.mockImplementation(() => createChildProcess());

    const service = new ExternalUrlService();

    await service.openUrl("https://projecto.adityakosuru.online/pricing");

    expect(spawnMock).toHaveBeenCalledWith(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ["--new-window", "https://projecto.adityakosuru.online/pricing"],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }),
    );
    expect(shellOpenExternal).not.toHaveBeenCalled();
  });

  it("falls back to Electron shell when Windows launch helpers fail", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    spawnMock.mockImplementation(() =>
      createChildProcess({ error: new Error("launcher failed") }),
    );

    const service = new ExternalUrlService();

    await service.openUrl("https://projecto.adityakosuru.online/desktop-login");

    expect(shellOpenExternal).toHaveBeenCalledWith(
      "https://projecto.adityakosuru.online/desktop-login",
      { activate: true },
    );
  });
});
