import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { UpdateService } from "../updateService";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createNativeUpdaterMock() {
  const events = new EventEmitter();
  type EventListener = Parameters<EventEmitter["on"]>[1];
  const nativeUpdater = {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: EventListener) => {
      events.on(event, listener);
      return nativeUpdater;
    }),
    off: vi.fn((event: string, listener: EventListener) => {
      events.off(event, listener);
      return nativeUpdater;
    }),
  };

  return { events, nativeUpdater };
}

describe("UpdateService", () => {
  it("marks an available update from the website manifest", async () => {
    const { nativeUpdater } = createNativeUpdaterMock();
    const request = vi.fn(async () =>
      jsonResponse({
        updateAvailable: true,
        latestVersion: "1.0.1",
        feedUrl: "https://example.com/releases/v1.0.1",
        setupUrl: "https://example.com/Projecto-1.0.1.Setup.exe",
      }),
    );
    const service = new UpdateService({
      checkUrl: "https://example.com/api/update",
      currentVersion: "1.0.0",
      platform: "win32",
      arch: "x64",
      isPackaged: false,
      request: request as never,
      nativeUpdater: nativeUpdater as never,
    });

    const state = await service.checkForUpdates();

    expect(request).toHaveBeenCalledWith(
      "https://example.com/api/update?version=1.0.0&platform=win32&arch=x64",
      expect.objectContaining({ method: "GET" }),
    );
    expect(state.status).toBe("available");
    expect(state.updateAvailable).toBe(true);
    expect(state.latestVersion).toBe("1.0.1");
  });

  it("opens the setup URL as the safe development fallback", async () => {
    const { nativeUpdater } = createNativeUpdaterMock();
    const openExternal = vi.fn(async () => undefined);
    const service = new UpdateService({
      currentVersion: "1.0.0",
      platform: "win32",
      arch: "x64",
      isPackaged: false,
      request: vi.fn(async () =>
        jsonResponse({
          updateAvailable: true,
          latestVersion: "1.0.1",
          setupUrl: "https://example.com/Projecto-1.0.1.Setup.exe",
        }),
      ) as never,
      openExternal,
      nativeUpdater: nativeUpdater as never,
    });

    await service.checkForUpdates();
    const state = await service.installUpdate();

    expect(openExternal).toHaveBeenCalledWith(
      "https://example.com/Projecto-1.0.1.Setup.exe",
    );
    expect(nativeUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(state.status).toBe("ready");
  });

  it("uses the native updater for packaged Windows Squirrel builds", async () => {
    vi.useFakeTimers();
    const { events, nativeUpdater } = createNativeUpdaterMock();
    const service = new UpdateService({
      currentVersion: "1.0.0",
      platform: "win32",
      arch: "x64",
      isPackaged: true,
      request: vi.fn(async () =>
        jsonResponse({
          updateAvailable: true,
          latestVersion: "1.0.1",
          feedUrl: "https://example.com/releases/v1.0.1",
          setupUrl: "https://example.com/Projecto-1.0.1.Setup.exe",
        }),
      ) as never,
      nativeUpdater: nativeUpdater as never,
    });

    await service.checkForUpdates();
    const installing = await service.installUpdate();
    events.emit("update-downloaded");
    vi.advanceTimersByTime(750);

    expect(nativeUpdater.setFeedURL).toHaveBeenCalledWith({
      url: "https://example.com/releases/v1.0.1",
    });
    expect(nativeUpdater.checkForUpdates).toHaveBeenCalled();
    expect(nativeUpdater.quitAndInstall).toHaveBeenCalled();
    expect(installing.status).toBe("downloading");
    expect(service.getState().status).toBe("installing");
    vi.useRealTimers();
  });
});
