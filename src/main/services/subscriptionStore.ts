import path from "node:path";

import { safeStorage } from "electron";
import { z } from "zod";

import {
  DEFAULT_SUBSCRIPTION_STATE,
  SubscriptionStateSchema,
  type SubscriptionState,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";

const StoredSubscriptionRecordSchema = z.object({
  state: SubscriptionStateSchema,
  encryptedSessionToken: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  deviceName: z.string().min(1).optional(),
  devicePlatform: z.enum(["windows", "macos", "linux"]).optional(),
  updatedAt: z.string().min(1).optional(),
});

type StoredSubscriptionRecord = z.infer<typeof StoredSubscriptionRecordSchema>;

export type SubscriptionRecord = {
  state: SubscriptionState;
  sessionToken?: string;
  deviceId?: string;
  deviceName?: string;
  devicePlatform?: "windows" | "macos" | "linux";
  updatedAt?: string;
};

export class SubscriptionStore {
  private readonly filePath: string;
  private memorySessionToken?: string;

  constructor(
    private readonly fileSystemService: FileSystemService,
    userDataPath: string,
  ) {
    this.filePath = path.join(userDataPath, "subscription.json");
  }

  async getRecord(): Promise<SubscriptionRecord> {
    const stored = await this.loadRecord();
    return {
      state: stored.state,
      sessionToken: (stored.encryptedSessionToken
        ? this.decrypt(stored.encryptedSessionToken)
        : undefined) ?? this.memorySessionToken,
      deviceId: stored.deviceId,
      deviceName: stored.deviceName,
      devicePlatform: stored.devicePlatform,
      updatedAt: stored.updatedAt,
    };
  }

  async getState(): Promise<SubscriptionState> {
    return (await this.getRecord()).state;
  }

  async saveRecord(record: SubscriptionRecord): Promise<void> {
    this.memorySessionToken = record.sessionToken;
    await this.persist({
      state: SubscriptionStateSchema.parse(record.state),
      encryptedSessionToken: record.sessionToken
        ? this.encrypt(record.sessionToken)
        : undefined,
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      devicePlatform: record.devicePlatform,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    });
  }

  private async loadRecord(): Promise<StoredSubscriptionRecord> {
    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.filePath,
      );
      return await this.repairRecord(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        const fresh = StoredSubscriptionRecordSchema.parse({
          state: DEFAULT_SUBSCRIPTION_STATE,
        });
        await this.persist(fresh);
        return fresh;
      }

      if (error instanceof SyntaxError) {
        await this.backupCorruptFile();
        const fresh = StoredSubscriptionRecordSchema.parse({
          state: DEFAULT_SUBSCRIPTION_STATE,
        });
        await this.persist(fresh);
        return fresh;
      }

      throw error;
    }
  }

  private async repairRecord(raw: unknown): Promise<StoredSubscriptionRecord> {
    const parsed = StoredSubscriptionRecordSchema.safeParse(raw);

    if (parsed.success) {
      return parsed.data;
    }

    const repaired = StoredSubscriptionRecordSchema.parse({
      state: DEFAULT_SUBSCRIPTION_STATE,
    });
    await this.persist(repaired);
    return repaired;
  }

  private async persist(record: StoredSubscriptionRecord): Promise<void> {
    await this.fileSystemService.writeJsonAtomic(this.filePath, record);
  }

  private async backupCorruptFile(): Promise<void> {
    if (!(await this.fileSystemService.exists(this.filePath))) {
      return;
    }

    const backupPath = `${this.filePath}.${Date.now()}.corrupt`;
    await this.fileSystemService.moveFile(this.filePath, backupPath);
  }

  private protectedStorageAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
  }

  private encrypt(value: string): string | undefined {
    if (this.protectedStorageAvailable()) {
      return safeStorage.encryptString(value).toString("base64");
    }

    // Keep the credential in memory only when OS-protected storage is unavailable.
    return undefined;
  }

  private decrypt(value: string): string | undefined {
    const buffer = Buffer.from(value, "base64");

    if (this.protectedStorageAvailable()) {
      try { return safeStorage.decryptString(buffer); } catch { return undefined; }
    }

    return undefined;
  }
}
