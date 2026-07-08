import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { DesktopBridgeService } from "../desktopBridgeService";

describe("DesktopBridgeService", () => {
  it("broadcasts reveal requests to the connected editor workspace", async () => {
    const projectPath = "D:/workspace";
    const service = new DesktopBridgeService(
      {} as never,
      {} as never,
      "D:/projecto-user-data",
    );
    const response = {
      write: vi.fn(),
    };

    (
      service as unknown as {
        state: ReturnType<DesktopBridgeService["getState"]>;
        registeredWorkspaces: Map<string, string>;
        sseClients: Map<string, { id: string; response: typeof response }>;
      }
    ).state = {
      ...service.getState(),
      extensionConnected: true,
      registeredWorkspaceCount: 1,
    };
    (
      service as unknown as { registeredWorkspaces: Map<string, string> }
    ).registeredWorkspaces.set(
      path.resolve(projectPath).toLowerCase(),
      projectPath,
    );
    (
      service as unknown as {
        sseClients: Map<string, { id: string; response: typeof response }>;
      }
    ).sseClients.set("client-1", {
      id: "client-1",
      response,
    });

    await expect(
      service.revealProjectTerminal({
        projectId: "project-1",
        projectPath,
        runId: "run-1",
      }),
    ).resolves.toBe(true);

    expect(response.write).toHaveBeenCalledWith(
      expect.stringContaining("event: REVEAL_EDITOR_TERMINAL"),
    );
    const payload = String(response.write.mock.calls[0]?.[0] ?? "");
    expect(payload).toContain('"projectId":"project-1"');
    expect(payload).toContain('"workspacePath":"D:/workspace"');
    expect(payload).toContain('"jobId":"run-1"');
  });
});
