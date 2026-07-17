import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FileSystemService } from "../fileSystemService";
import { TerminalSessionStore } from "../terminalSessionStore";

describe("TerminalSessionStore", () => {
  async function createStore(): Promise<TerminalSessionStore> {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "projecto-terminal-sessions-test-"),
    );
    return new TerminalSessionStore(new FileSystemService(), directory);
  }

  it("persists, updates, and clears project terminal mappings", async () => {
    const store = await createStore();
    const now = new Date().toISOString();

    expect(await store.getSessions()).toEqual([]);

    await store.upsertSession({
      projectId: "project-1",
      projectName: "Workspace",
      projectPath: "D:/workspace",
      launchId: "launch-1",
      activeRunId: "run-1",
      runIds: ["run-1"],
      terminalStrategy: "os-external",
      status: "running",
      detectedUrls: [],
      detectedPorts: [],
      terminalTitle: "Projecto: Workspace (run-1)",
      lastMessage: "Launching Default Launch",
      createdAt: now,
      updatedAt: now,
    });

    expect(await store.getSessions()).toEqual([
      expect.objectContaining({
        projectId: "project-1",
        activeRunId: "run-1",
        terminalStrategy: "os-external",
        status: "running",
      }),
    ]);

    const updated = await store.updateSession("project-1", {
      status: "ready",
      detectedUrls: ["http://localhost:5173/"],
      detectedPorts: [
        {
          projectId: "project-1",
          runId: "run-1",
          host: "localhost",
          port: 5173,
          url: "http://localhost:5173/",
          source: "local",
          detectedAt: now,
        },
      ],
      lastMessage: "Ready at http://localhost:5173/",
    });

    expect(updated).toEqual(
      expect.objectContaining({
        projectId: "project-1",
        status: "ready",
        detectedUrls: ["http://localhost:5173/"],
        detectedPorts: [
          expect.objectContaining({
            port: 5173,
            host: "localhost",
          }),
        ],
        lastMessage: "Ready at http://localhost:5173/",
      }),
    );

    await store.clearSession("project-1");
    expect(await store.getSessions()).toEqual([]);
  });
});
