import path from "node:path";

import {
  AppSettingsSchema,
  AppSettingsUpdateSchema,
  DEFAULT_SETTINGS,
  type AppSettings,
  type AppSettingsUpdate,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";

export class SettingsStore {
  private readonly filePath: string;

  constructor(
    private readonly fileSystemService: FileSystemService,
    userDataPath: string,
  ) {
    this.filePath = path.join(userDataPath, "settings.json");
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.filePath,
      );
      return await this.repairSettings(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        await this.persist(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }

      if (error instanceof SyntaxError) {
        await this.backupCorruptFile();
        await this.persist(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }

      throw error;
    }
  }

  async updateSettings(patch: AppSettingsUpdate): Promise<AppSettings> {
    const payload = AppSettingsUpdateSchema.parse(patch);
    const current = await this.getSettings();
    const next = AppSettingsSchema.parse({
      ...current,
      ...payload,
    });

    await this.persist(next);
    return next;
  }

  private async repairSettings(raw: unknown): Promise<AppSettings> {
    const { value: normalized, changed } = this.normalizeLegacySettings(raw);
    const exact = AppSettingsSchema.safeParse(normalized);

    if (exact.success) {
      if (changed) {
        await this.persist(exact.data);
      }

      return exact.data;
    }

    const partial = AppSettingsUpdateSchema.safeParse(normalized);
    const repaired = partial.success
      ? AppSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...partial.data })
      : DEFAULT_SETTINGS;
    await this.persist(repaired);
    return repaired;
  }

  private normalizeLegacySettings(raw: unknown): {
    value: unknown;
    changed: boolean;
  } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { value: raw, changed: false };
    }

    const candidate = { ...raw } as Record<string, unknown>;
    let changed = false;

    if ("theme" in candidate) {
      delete candidate.theme;
      changed = true;
    }

    if ("appearancePreset" in candidate) {
      delete candidate.appearancePreset;
      changed = true;
    }

    if (candidate.defaultEditor !== "vscode") {
      candidate.defaultEditor = "vscode";
      changed = true;
    }

    if ("customEditorPath" in candidate) {
      delete candidate.customEditorPath;
      changed = true;
    }

    if (
      candidate.terminalStrategy === "system" ||
      candidate.terminalStrategy === "logs" ||
      candidate.terminalStrategy === "external"
    ) {
      candidate.terminalStrategy = "os-internal";
      changed = true;
    }

    if (candidate.terminalStrategy === "editor") {
      candidate.terminalStrategy = "vscode-internal";
      changed = true;
    }

    return { value: candidate, changed };
  }

  private async persist(settings: AppSettings): Promise<void> {
    await this.fileSystemService.writeJsonAtomic(this.filePath, settings);
  }

  private async backupCorruptFile(): Promise<void> {
    if (!(await this.fileSystemService.exists(this.filePath))) {
      return;
    }

    const backupPath = `${this.filePath}.${Date.now()}.corrupt`;
    await this.fileSystemService.moveFile(this.filePath, backupPath);
  }
}
