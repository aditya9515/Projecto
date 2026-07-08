import { describe, expect, it } from "vitest";

import {
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  RunEventSchema,
  editorValues,
  terminalStrategyValues,
} from "../shared";

describe("shared desktop schemas", () => {
  it("only accepts VS Code as the desktop editor", () => {
    expect(editorValues).toEqual(["vscode"]);

    expect(
      AppSettingsSchema.parse({
        ...DEFAULT_SETTINGS,
        defaultEditor: "vscode",
      }).defaultEditor,
    ).toBe("vscode");

    for (const legacyEditor of ["cursor", "windsurf", "custom"]) {
      expect(() =>
        AppSettingsSchema.parse({
          ...DEFAULT_SETTINGS,
          defaultEditor: legacyEditor,
        }),
      ).toThrow();
    }
  });

  it("accepts the combined OS and VS Code terminal modes", () => {
    expect(terminalStrategyValues).toEqual([
      "os-internal",
      "os-external",
      "vscode-internal",
      "vscode-external",
    ]);

    for (const terminalStrategy of terminalStrategyValues) {
      expect(
        AppSettingsSchema.parse({
          ...DEFAULT_SETTINGS,
          terminalStrategy,
        }).terminalStrategy,
      ).toBe(terminalStrategy);
    }

    for (const legacyStrategy of ["system", "logs", "external", "editor"]) {
      expect(() =>
        AppSettingsSchema.parse({
          ...DEFAULT_SETTINGS,
          terminalStrategy: legacyStrategy,
        }),
      ).toThrow();
    }
  });

  it("accepts structured launch-output run events without changing run statuses", () => {
    const portEvent = RunEventSchema.parse({
      runId: "run-1",
      projectId: "project-1",
      kind: "port-remapped",
      message: "Port 3000 moved to 3003.",
      timestamp: new Date().toISOString(),
      fromPort: "3000",
      toPort: "3003",
      processId: "34332",
      executionMode: "os-internal",
      managed: false,
    });

    expect(portEvent.kind).toBe("port-remapped");
    expect(portEvent.toPort).toBe("3003");

    const alreadyRunningEvent = RunEventSchema.parse({
      runId: "run-1",
      projectId: "project-1",
      kind: "already-running",
      message: "Another Next.js dev server is already running.",
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });

    expect(alreadyRunningEvent.kind).toBe("already-running");
  });
});
