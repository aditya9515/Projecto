import { EventEmitter } from "node:events";
import os from "node:os";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  BillingEventSchema,
  DesktopEntitlementsSchema,
  DEFAULT_SUBSCRIPTION_STATE,
  SubscriptionStateSchema,
  type BillingEvent,
  type SubscriptionState,
} from "../types/shared";
import type { SubscriptionRecord } from "./subscriptionStore";

const DEFAULT_BILLING_URL = "https://projecto.adityakosuru.online/pricing";
export const SUBSCRIPTION_VERIFY_INTERVAL_MS = 5 * 60_000;
const AUTO_REAUTH_COOLDOWN_MS = 30_000;

type DesktopDevicePlatform = "windows" | "macos" | "linux";

type RemoteSubscriptionSnapshot = {
  userId?: string;
  plan?: SubscriptionState["plan"];
  status?: SubscriptionState["status"];
  email?: string;
  name?: string;
  expiresAt?: string;
  currentPeriodEnd?: string | null;
  currentPeriodStart?: string | null;
  rawStatus?: string;
  cancelAtPeriodEnd?: boolean;
  billingCycle?: SubscriptionState["billingCycle"];
  lastVerifiedAt?: string;
  archivedProjectCount?: number;
  entitlements?: SubscriptionState["entitlements"];
};

const ExchangeResponseSchema = z.object({
  accessToken: z.string().min(1).optional(),
  desktopSessionToken: z.string().min(1).optional(),
  user: z.object({
    uid: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
  }),
  subscription: z
    .object({
      plan: SubscriptionStateSchema.shape.plan,
      status: SubscriptionStateSchema.shape.status,
      expiresAt: z.string().min(1).optional(),
      currentPeriodEnd: z.string().min(1).nullable().optional(),
      currentPeriodStart: z.string().min(1).nullable().optional(),
      rawStatus: z.string().min(1).optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
      billingCycle: SubscriptionStateSchema.shape.billingCycle.optional(),
      lastVerifiedAt: z.string().min(1).optional(),
      archivedProjectCount: z.number().int().nonnegative().optional(),
      entitlements: DesktopEntitlementsSchema.optional(),
    })
    .passthrough(),
});

const VerifyResponseSchema = z
  .object({
    userId: z.string().min(1).optional(),
    plan: SubscriptionStateSchema.shape.plan,
    status: SubscriptionStateSchema.shape.status,
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    expiresAt: z.string().min(1).optional(),
    currentPeriodEnd: z.string().min(1).nullable().optional(),
    currentPeriodStart: z.string().min(1).nullable().optional(),
    rawStatus: z.string().min(1).optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    billingCycle: SubscriptionStateSchema.shape.billingCycle.optional(),
    lastVerifiedAt: z.string().min(1).optional(),
    archivedProjectCount: z.number().int().nonnegative().optional(),
    entitlements: DesktopEntitlementsSchema.optional(),
  })
  .passthrough();

type SubscriptionPersistence = {
  getRecord: () => Promise<SubscriptionRecord>;
  saveRecord: (record: SubscriptionRecord) => Promise<void>;
};

type SubscriptionServiceOptions = {
  persistence: SubscriptionPersistence;
  openExternal: (url: string) => Promise<void>;
  billingUrl?: string;
};

type RefreshSubscriptionOptions = {
  broadcast?: "visible" | "silent" | "none";
  emitFailureEvent?: boolean;
  autoReauthenticate?: boolean;
};

function resolveBillingUrl(value?: string): string {
  const candidate =
    value?.trim() || process.env.BILLING_URL || DEFAULT_BILLING_URL;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const allowInsecureLocalhost =
      parsed.protocol === "http:" &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1");

    if (parsed.protocol !== "https:" && !allowInsecureLocalhost) {
      return DEFAULT_BILLING_URL;
    }

    return parsed.toString();
  } catch {
    return DEFAULT_BILLING_URL;
  }
}

function mergeSubscriptionState(
  current: SubscriptionState,
  incoming: RemoteSubscriptionSnapshot,
): SubscriptionState {
  const now = new Date().toISOString();
  return SubscriptionStateSchema.parse({
    ...current,
    ...incoming,
    lastVerifiedAt: incoming.lastVerifiedAt ?? current.lastVerifiedAt ?? now,
  });
}

function getCurrentDevicePlatform(): DesktopDevicePlatform {
  if (process.platform === "win32") {
    return "windows";
  }

  if (process.platform === "darwin") {
    return "macos";
  }

  return "linux";
}

function getDefaultDeviceName(): string {
  const host = os.hostname().trim();
  return host.length > 0 ? host : "Projecto Desktop";
}

function shouldResetDesktopSession(error: unknown): boolean {
  return error instanceof DesktopApiError && error.status === 401;
}

export class DesktopApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DesktopApiError";
  }
}

export class SubscriptionService {
  private readonly events = new EventEmitter();
  private readonly billingUrl: string;
  private readonly webOrigin: string;
  private verificationTimer: NodeJS.Timeout | null = null;
  private lastDesktopLoginOpenedAt = 0;
  private pendingLogin?: { state: string; verifier: string; expiresAt: number };

  constructor(private readonly options: SubscriptionServiceOptions) {
    this.billingUrl = resolveBillingUrl(options.billingUrl);
    this.webOrigin = new URL(this.billingUrl).origin;
  }

  onEvent(listener: (event: BillingEvent) => void): () => void {
    this.events.on("billing-event", listener);
    return () => {
      this.events.off("billing-event", listener);
    };
  }

  async initialize(): Promise<void> {
    const record = await this.options.persistence.getRecord();

    if (!record.sessionToken) {
      this.stopPeriodicVerification();
      return;
    }

    this.startPeriodicVerification();
    try {
      await this.refreshSubscription({
        broadcast: "silent",
        emitFailureEvent: false,
        autoReauthenticate: true,
      });
    } catch (error) {
      if (!shouldResetDesktopSession(error)) {
        this.emitEvent({
          type: "subscription-refresh-failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to refresh subscription status.",
          silent: true,
          subscription: record.state,
        });
      }
    }
  }

  async getSubscriptionState(): Promise<SubscriptionState> {
    const record = await this.options.persistence.getRecord();
    return record.state;
  }

  async getDesktopSessionContext(): Promise<
    Required<
      Pick<
        SubscriptionRecord,
        "sessionToken" | "deviceId" | "deviceName" | "devicePlatform"
      >
    > &
      SubscriptionRecord
  > {
    const record = await this.ensureDeviceContext();

    if (!record.sessionToken) {
      throw new Error(
        "Sign in with Projecto from Billing to connect this desktop app first.",
      );
    }

    return {
      ...record,
      sessionToken: record.sessionToken,
      deviceId: record.deviceId!,
      deviceName: record.deviceName!,
      devicePlatform: record.devicePlatform!,
    };
  }

  async applyRemoteSubscriptionSnapshot(
    snapshot: RemoteSubscriptionSnapshot,
  ): Promise<SubscriptionState> {
    const current = await this.options.persistence.getRecord();
    const subscription = mergeSubscriptionState(current.state, snapshot);

    await this.options.persistence.saveRecord({
      ...current,
      state: subscription,
      updatedAt: new Date().toISOString(),
    });

    return subscription;
  }

  async postAuthenticatedJson(
    pathname: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const record = await this.getDesktopSessionContext();

    try {
      return await this.postJson(
        pathname,
        {
          desktopSessionToken: record.sessionToken,
          deviceId: record.deviceId,
          ...body,
        },
        record,
      );
    } catch (error) {
      if (shouldResetDesktopSession(error)) {
        await this.handleUnauthorizedSession(
          record,
          error instanceof Error ? error.message : "Desktop session expired.",
          {
            reauthenticate: true,
          },
        );
      }

      throw error;
    }
  }

  async openUpgradePage(): Promise<void> {
    await this.options.openExternal(this.getUpgradeUrl());
    this.emitEvent({
      type: "upgrade-opened",
      message:
        "Opened secure web billing in your default browser. This may reuse an existing browser window or tab.",
    });
  }

  async startGoogleSignIn(): Promise<void> {
    await this.openDesktopLogin({
      emitEvent: true,
    });
  }

  async refreshSubscription(
    options?: RefreshSubscriptionOptions,
  ): Promise<SubscriptionState> {
    const current = await this.ensureDeviceContext();

    if (!current.sessionToken) {
      throw new Error(
        "Sign in with Projecto from Billing to connect this desktop app first.",
      );
    }

    try {
      const payload = await this.postJson(
        "/api/desktop/subscription/verify",
        {
          desktopSessionToken: current.sessionToken,
          deviceId: current.deviceId,
        },
        current,
      );
      const response = VerifyResponseSchema.parse(payload);
      const subscription = await this.applyRemoteSubscriptionSnapshot({
        userId: response.userId ?? current.state.userId,
        plan: response.plan,
        status: response.status,
        email: response.email ?? current.state.email,
        name: response.name ?? current.state.name,
        expiresAt: response.expiresAt,
        currentPeriodEnd: response.currentPeriodEnd,
        currentPeriodStart: response.currentPeriodStart,
        rawStatus: response.rawStatus,
        cancelAtPeriodEnd: response.cancelAtPeriodEnd,
        billingCycle: response.billingCycle,
        lastVerifiedAt: response.lastVerifiedAt,
        archivedProjectCount: response.archivedProjectCount,
        entitlements: response.entitlements,
      });

      this.startPeriodicVerification();

      const broadcast = options?.broadcast ?? "visible";

      if (broadcast !== "none") {
        this.emitEvent({
          type: "subscription-updated",
          message:
            broadcast === "visible"
              ? "Subscription status refreshed."
              : undefined,
          silent: broadcast === "silent",
          subscription,
        });
      }

      return subscription;
    } catch (error) {
      let nextSubscription = current.state;

      if (shouldResetDesktopSession(error)) {
        nextSubscription = await this.handleUnauthorizedSession(
          current,
          error instanceof Error ? error.message : "Desktop session expired.",
          {
            reauthenticate: options?.autoReauthenticate !== false,
          },
        );
      }

      if (options?.emitFailureEvent !== false) {
        this.emitEvent({
          type: "subscription-refresh-failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to refresh subscription status.",
          subscription: nextSubscription,
        });
      }

      throw error;
    }
  }

  async handleProtocolUrl(urlString: string): Promise<boolean> {
    let url: URL;

    try {
      url = new URL(urlString);
    } catch {
      return false;
    }

    if (url.protocol === "projecto:" && url.hostname === "auth" && url.pathname === "/start") {
      if (Date.now() - this.lastDesktopLoginOpenedAt >= AUTO_REAUTH_COOLDOWN_MS) await this.openDesktopLogin();
      return true;
    }
    if (
      url.protocol !== "projecto:" ||
      url.hostname !== "auth" ||
      url.pathname !== "/callback"
    ) {
      return false;
    }

    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim();
    const token = url.searchParams.get("token")?.trim();
    const callbackCredential = code ?? token;

    const pending = this.pendingLogin;
    if (!code || !state || !pending || pending.expiresAt < Date.now() ||
      Buffer.byteLength(state) !== Buffer.byteLength(pending.state) ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) {
      this.emitEvent({ type: "auth-failed", message: "This sign-in was not initiated by this Projecto window or has expired. Start sign-in from Projecto again." });
      return true;
    }
    this.pendingLogin = undefined;

    if (!callbackCredential) {
      this.emitEvent({
        type: "auth-failed",
        message: "Desktop login callback did not include a code.",
      });
      return true;
    }

    try {
      const current = await this.ensureDeviceContext();
      const payload = await this.postJson("/api/desktop/auth/exchange", {
        ...(code
          ? {
              code,
              state,
              codeVerifier: pending.verifier,
            }
          : {
              token: callbackCredential,
            }),
        deviceId: current.deviceId,
        deviceName: current.deviceName,
        platform: current.devicePlatform,
      });
      const response = ExchangeResponseSchema.parse(payload);
      const sessionToken = response.desktopSessionToken ?? response.accessToken;

      if (!sessionToken) {
        throw new Error(
          "Desktop login exchange did not return a session token.",
        );
      }

      const subscription = mergeSubscriptionState(current.state, {
        userId: response.user.uid,
        plan: response.subscription.plan,
        status: response.subscription.status,
        email: response.user.email ?? current.state.email,
        name: response.user.name ?? current.state.name,
        expiresAt: response.subscription.expiresAt,
        currentPeriodEnd: response.subscription.currentPeriodEnd,
        currentPeriodStart: response.subscription.currentPeriodStart,
        rawStatus: response.subscription.rawStatus,
        cancelAtPeriodEnd: response.subscription.cancelAtPeriodEnd,
        billingCycle: response.subscription.billingCycle,
        lastVerifiedAt: response.subscription.lastVerifiedAt,
        archivedProjectCount: response.subscription.archivedProjectCount,
        entitlements: response.subscription.entitlements,
      });

      await this.options.persistence.saveRecord({
        ...current,
        state: subscription,
        sessionToken,
        updatedAt: new Date().toISOString(),
      });
      this.startPeriodicVerification();

      this.emitEvent({
        type: "auth-completed",
        message: subscription.email
          ? `Signed in as ${subscription.email}.`
          : "Desktop sign-in completed successfully.",
        subscription,
      });
    } catch (error) {
      this.emitEvent({
        type: "auth-failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to verify the desktop login callback.",
      });
    }

    return true;
  }

  async dispose(): Promise<void> {
    this.stopPeriodicVerification();
    this.events.removeAllListeners();
  }

  getUpgradeUrl(): string {
    const url = new URL(this.billingUrl);
    url.searchParams.set("source", "desktop");
    return url.toString();
  }

  private getDesktopLoginUrl(): string {
    const url = new URL("/desktop-login", this.webOrigin);
    url.searchParams.set("source", "desktop");
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(24).toString("base64url");
    this.pendingLogin = { state, verifier, expiresAt: Date.now() + 5 * 60_000 };
    url.searchParams.set("desktopState", state);
    url.searchParams.set("codeChallenge", createHash("sha256").update(verifier).digest("base64url"));
    return url.toString();
  }

  private emitEvent(event: BillingEvent): void {
    this.events.emit("billing-event", BillingEventSchema.parse(event));
  }

  private async openDesktopLogin(options?: {
    emitEvent?: boolean;
  }): Promise<void> {
    const previousOpenedAt = this.lastDesktopLoginOpenedAt;
    this.lastDesktopLoginOpenedAt = Date.now();

    try {
      await this.options.openExternal(this.getDesktopLoginUrl());
    } catch (error) {
      this.lastDesktopLoginOpenedAt = previousOpenedAt;
      throw error;
    }

    if (options?.emitEvent !== false) {
      this.emitEvent({
        type: "auth-started",
        message:
          "Opened Projecto sign-in in your default browser. This may reuse an existing browser window or tab.",
      });
    }
  }

  private async requestBrowserReauthentication(): Promise<boolean> {
    if (Date.now() - this.lastDesktopLoginOpenedAt < AUTO_REAUTH_COOLDOWN_MS) {
      return false;
    }

    await this.openDesktopLogin({
      emitEvent: false,
    });
    return true;
  }

  private async postJson(
    pathname: string,
    body: Record<string, unknown>,
    record?: SubscriptionRecord,
  ): Promise<unknown> {
    const response = await fetch(this.buildApiUrl(pathname), {
      method: "POST",
      headers: this.buildHeaders(record),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    return this.parseResponse(response);
  }

  private buildApiUrl(pathname: string): string {
    return new URL(pathname, this.webOrigin).toString();
  }

  private buildHeaders(record?: SubscriptionRecord): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Projecto-Client": "desktop",
    };

    if (record?.sessionToken) {
      headers.Authorization = `Bearer ${record.sessionToken}`;
      headers["X-Desktop-Session"] = record.sessionToken;
    }

    return headers;
  }

  private async ensureDeviceContext(): Promise<SubscriptionRecord> {
    const current = await this.options.persistence.getRecord();

    if (current.deviceId && current.deviceName && current.devicePlatform) {
      return current;
    }

    const next: SubscriptionRecord = {
      ...current,
      deviceId: current.deviceId ?? crypto.randomUUID(),
      deviceName: current.deviceName ?? getDefaultDeviceName(),
      devicePlatform: current.devicePlatform ?? getCurrentDevicePlatform(),
      updatedAt: current.updatedAt ?? new Date().toISOString(),
    };

    await this.options.persistence.saveRecord(next);
    return next;
  }

  private startPeriodicVerification(): void {
    this.stopPeriodicVerification();

    this.verificationTimer = setInterval(() => {
      void this.refreshSubscription({
        broadcast: "silent",
        emitFailureEvent: false,
        autoReauthenticate: true,
      }).catch(() => undefined);
    }, SUBSCRIPTION_VERIFY_INTERVAL_MS);

    this.verificationTimer.unref?.();
  }

  private stopPeriodicVerification(): void {
    if (!this.verificationTimer) {
      return;
    }

    clearInterval(this.verificationTimer);
    this.verificationTimer = null;
  }

  private async clearSessionState(
    record?: SubscriptionRecord,
  ): Promise<SubscriptionState> {
    const current = record ?? (await this.options.persistence.getRecord());
    this.stopPeriodicVerification();
    const nextState = SubscriptionStateSchema.parse(DEFAULT_SUBSCRIPTION_STATE);

    await this.options.persistence.saveRecord({
      ...current,
      state: nextState,
      sessionToken: undefined,
      updatedAt: new Date().toISOString(),
    });

    return nextState;
  }

  private async handleUnauthorizedSession(
    record: SubscriptionRecord,
    reason: string,
    options?: { reauthenticate?: boolean },
  ): Promise<SubscriptionState> {
    const subscription = await this.clearSessionState(record);
    let message = reason;

    if (options?.reauthenticate !== false) {
      try {
        const reopened = await this.requestBrowserReauthentication();

        if (reopened) {
          message = `${reason} Projecto reopened sign-in in your browser.`;
        }
      } catch (error) {
        message = `${reason} Projecto could not reopen sign-in automatically: ${error instanceof Error ? error.message : "Unknown browser error."}`;
      }
    }

    this.emitEvent({
      type: "auth-failed",
      message,
      subscription,
    });

    return subscription;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    if (!response.ok) {
      let message = "Subscription request failed.";
      let code: string | undefined;

      try {
        const payload = (await response.json()) as {
          message?: string;
          error?: string;
          code?: string;
        };
        message =
          payload.message ?? payload.error ?? response.statusText ?? message;
        code = payload.code;
      } catch {
        message = response.statusText || message;
      }

      throw new DesktopApiError(message, response.status, code);
    }

    if (response.status === 204) {
      return {
        subscription: DEFAULT_SUBSCRIPTION_STATE,
      };
    }

    return response.json();
  }
}
