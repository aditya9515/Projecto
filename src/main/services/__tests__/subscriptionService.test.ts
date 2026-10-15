import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SUBSCRIPTION_VERIFY_INTERVAL_MS,
  SubscriptionService,
} from "../subscriptionService";

describe("SubscriptionService", () => {
  const persistence = {
    getRecord: vi.fn(),
    saveRecord: vi.fn(),
  };

  const openExternal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    persistence.getRecord.mockResolvedValue({
      state: {
        plan: "free",
        status: "none",
      },
    });
    persistence.saveRecord.mockResolvedValue(undefined);
    openExternal.mockResolvedValue(undefined);
  });

  it("opens the Projecto desktop login page for Google sign-in", async () => {
    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });

    await service.startGoogleSignIn();

    expect(openExternal).toHaveBeenCalledWith(
      expect.stringContaining("https://projecto.adityakosuru.online/desktop-login?source=desktop&desktopState="),
    );
  });

  it("restores the saved desktop session automatically during initialization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plan: "pro",
        status: "active",
        email: "adi@example.com",
        expiresAt: "2026-05-10T00:00:00.000Z",
        lastVerifiedAt: "2026-04-25T11:00:00.000Z",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    persistence.getRecord.mockResolvedValue({
      state: {
        plan: "pro",
        status: "active",
      },
      sessionToken: "desktop-session-token",
      deviceId: "device-1",
      deviceName: "Adi-PC",
      devicePlatform: "windows",
    });

    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });

    await service.initialize();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://projecto.adityakosuru.online/api/desktop/subscription/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          desktopSessionToken: "desktop-session-token",
          deviceId: "device-1",
        }),
      }),
    );
    expect(persistence.saveRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          email: "adi@example.com",
          plan: "pro",
          status: "active",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("clears the saved desktop session when backend verification says it is invalid", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        error: "Desktop session is invalid or expired.",
        code: "desktop_session_invalid",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    persistence.getRecord.mockResolvedValue({
      state: {
        plan: "pro",
        status: "active",
        email: "adi@example.com",
      },
      sessionToken: "desktop-session-token",
      deviceId: "device-1",
      deviceName: "Adi-PC",
      devicePlatform: "windows",
    });

    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });

    await service.initialize();

    expect(persistence.saveRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionToken: undefined,
        state: expect.objectContaining({
          plan: "free",
          status: "none",
        }),
      }),
    );
    expect(openExternal).toHaveBeenCalledWith(
      expect.stringContaining("https://projecto.adityakosuru.online/desktop-login?source=desktop&desktopState="),
    );

    vi.unstubAllGlobals();
  });

  it("keeps the desktop app booting when startup subscription verification gets a transient backend error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        error: "Not Found",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    persistence.getRecord.mockResolvedValue({
      state: {
        plan: "pro",
        status: "active",
        email: "adi@example.com",
      },
      sessionToken: "desktop-session-token",
      deviceId: "device-1",
      deviceName: "Adi-PC",
      devicePlatform: "windows",
    });

    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });
    const events: unknown[] = [];
    service.onEvent((event) => {
      events.push(event);
    });

    await expect(service.initialize()).resolves.toBeUndefined();

    expect(persistence.saveRecord).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({
        type: "subscription-refresh-failed",
        message: "Not Found",
        silent: true,
        subscription: expect.objectContaining({
          plan: "pro",
          status: "active",
        }),
      }),
    ]);

    vi.unstubAllGlobals();
  });

  it("exchanges a projecto callback code for a desktop session token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: "desktop-session-token",
        user: {
          uid: "user-1",
          email: "adi@example.com",
          name: "Adi",
        },
        subscription: {
          plan: "pro",
          status: "active",
          expiresAt: "2026-05-01T00:00:00.000Z",
          lastVerifiedAt: "2026-04-25T10:00:00.000Z",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });

    await service.startGoogleSignIn();
    const loginUrl = new URL(openExternal.mock.calls.at(-1)![0]);
    const state = loginUrl.searchParams.get("desktopState")!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(loginUrl.searchParams.get("codeChallenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const handled = await service.handleProtocolUrl(
      `projecto://auth/callback?code=desktop-code&state=${state}`,
    );

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://projecto.adityakosuru.online/api/desktop/auth/exchange",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(persistence.saveRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionToken: "desktop-session-token",
        state: expect.objectContaining({
          userId: "user-1",
          plan: "pro",
          status: "active",
          email: "adi@example.com",
        }),
        deviceId: expect.any(String),
        deviceName: expect.any(String),
        devicePlatform: expect.any(String),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("rejects unsolicited callbacks without exchanging or replacing a session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new SubscriptionService({ persistence, openExternal });
    await service.handleProtocolUrl("projecto://auth/callback?code=attacker-code&state=attacker-state");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(persistence.saveRecord).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refreshes subscription state using the desktop session token and device id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plan: "pro",
        status: "active",
        email: "adi@example.com",
        expiresAt: "2026-05-10T00:00:00.000Z",
        lastVerifiedAt: "2026-04-25T11:00:00.000Z",
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    persistence.getRecord.mockResolvedValue({
      state: {
        plan: "pro",
        status: "active",
      },
      sessionToken: "desktop-session-token",
      deviceId: "device-1",
      deviceName: "Adi-PC",
      devicePlatform: "windows",
    });

    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });

    const subscription = await service.refreshSubscription();

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "pro",
        status: "active",
        email: "adi@example.com",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://projecto.adityakosuru.online/api/desktop/subscription/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          desktopSessionToken: "desktop-session-token",
          deviceId: "device-1",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("re-verifies the desktop session periodically while the app stays open", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        plan: "free",
        status: "active",
        email: "adi@example.com",
        lastVerifiedAt: "2026-04-29T09:00:00.000Z",
        entitlements: {
          maxProjects: 5,
          canChangeProjectDirectories: true,
          maxConcurrentLaunches: 1,
          canBulkImport: false,
          canBulkScan: false,
          projectStorage: "firestore",
          requiresOnline: true,
          projectDetectionLevel: "basic",
          defaultDirectoryLimit: 5,
          canChangeDefaultDirectories: true,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    persistence.getRecord.mockResolvedValue({
      state: {
        plan: "free",
        status: "active",
      },
      sessionToken: "desktop-session-token",
      deviceId: "device-1",
      deviceName: "Adi-PC",
      devicePlatform: "windows",
    });

    const service = new SubscriptionService({
      persistence,
      openExternal,
      billingUrl: "https://projecto.adityakosuru.online/pricing",
    });

    await service.initialize();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SUBSCRIPTION_VERIFY_INTERVAL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await service.dispose();
    vi.unstubAllGlobals();
  });
});
