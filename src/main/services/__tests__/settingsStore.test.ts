import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../../types/shared";
import { SettingsStore } from "../settingsStore";

describe("SettingsStore", () => {
  it("migrates legacy system terminal strategy to OS internal", async () => {
    const fileSystemService = {
      readJsonFile: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        terminalStrategy: "system",
      }),
      writeJsonAtomic: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn(),
      moveFile: vi.fn(),
    };
    const store = new SettingsStore(
      fileSystemService as never,
      "D:/tmp/projecto-test",
    );

    const settings = await store.getSettings();

    expect(settings.terminalStrategy).toBe("os-internal");
    expect(fileSystemService.writeJsonAtomic).toHaveBeenCalledWith(
      expect.stringContaining("settings.json"),
      expect.objectContaining({ terminalStrategy: "os-internal" }),
    );
  });

  it("migrates legacy integrated logs terminal strategy to OS internal", async () => {
    const fileSystemService = {
      readJsonFile: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        terminalStrategy: "logs",
      }),
      writeJsonAtomic: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn(),
      moveFile: vi.fn(),
    };
    const store = new SettingsStore(
      fileSystemService as never,
      "D:/tmp/projecto-test",
    );

    const settings = await store.getSettings();

    expect(settings.terminalStrategy).toBe("os-internal");
    expect(fileSystemService.writeJsonAtomic).toHaveBeenCalledWith(
      expect.stringContaining("settings.json"),
      expect.objectContaining({ terminalStrategy: "os-internal" }),
    );
  });

  it("migrates old two-mode terminal settings to combined terminal modes", async () => {
    for (const [legacy, migrated] of [
      ["external", "os-internal"],
      ["editor", "vscode-internal"],
    ] as const) {
      const fileSystemService = {
        readJsonFile: vi.fn().mockResolvedValue({
          ...DEFAULT_SETTINGS,
          terminalStrategy: legacy,
        }),
        writeJsonAtomic: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn(),
        moveFile: vi.fn(),
      };
      const store = new SettingsStore(
        fileSystemService as never,
        "D:/tmp/projecto-test",
      );

      const settings = await store.getSettings();

      expect(settings.terminalStrategy).toBe(migrated);
      expect(fileSystemService.writeJsonAtomic).toHaveBeenCalledWith(
        expect.stringContaining("settings.json"),
        expect.objectContaining({ terminalStrategy: migrated }),
      );
    }
  });

  it("removes legacy appearance settings from persisted settings", async () => {
    const fileSystemService = {
      readJsonFile: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        theme: "system",
        appearancePreset: "graphite",
      }),
      writeJsonAtomic: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn(),
      moveFile: vi.fn(),
    };
    const store = new SettingsStore(
      fileSystemService as never,
      "D:/tmp/projecto-test",
    );

    const settings = await store.getSettings();

    expect("theme" in settings).toBe(false);
    expect("appearancePreset" in settings).toBe(false);
    expect(fileSystemService.writeJsonAtomic).toHaveBeenCalledWith(
      expect.stringContaining("settings.json"),
      expect.not.objectContaining({
        theme: expect.anything(),
        appearancePreset: expect.anything(),
      }),
    );
  });

  it("migrates legacy editor settings to VS Code only", async () => {
    const fileSystemService = {
      readJsonFile: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        defaultEditor: "cursor",
        customEditorPath: "D:/Tools/editor.exe",
      }),
      writeJsonAtomic: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn(),
      moveFile: vi.fn(),
    };
    const store = new SettingsStore(
      fileSystemService as never,
      "D:/tmp/projecto-test",
    );

    const settings = await store.getSettings();

    expect(settings.defaultEditor).toBe("vscode");
    expect("customEditorPath" in settings).toBe(false);
    expect(fileSystemService.writeJsonAtomic).toHaveBeenCalledWith(
      expect.stringContaining("settings.json"),
      expect.not.objectContaining({
        defaultEditor: "cursor",
        customEditorPath: expect.anything(),
      }),
    );
  });
});
