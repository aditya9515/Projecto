import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleMappedLaunchError } from "../../../renderer/utils/launchErrorHandlers";

describe("handleMappedLaunchError", () => {
  const pushToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      launchStack: {
        launcher: {},
      },
    });
  });

  it("shows a clear toast for same-project duplicate launches", async () => {
    await expect(
      handleMappedLaunchError(
        new Error(
          "Error invoking remote method 'launcher:launchProfile': Error: PROJECT_ALREADY_RUNNING:project-1",
        ),
        pushToast,
      ),
    ).resolves.toBe(true);

    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Project is running",
        description:
          "Use Stop or Mapped Terminal before launching again.",
        tone: "info",
      }),
    );
  });

  it("shows a clear toast for Projecto-owned port conflicts", async () => {
    await expect(
      handleMappedLaunchError(
        new Error(
          "Error invoking remote method 'launcher:launchProfile': Error: PROJECT_PORT_OWNED:5173:project-2",
        ),
        pushToast,
      ),
    ).resolves.toBe(true);

    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Port 5173 is in use",
        description:
          "Another Projecto launch owns this port. Stop it or choose a different port.",
        tone: "error",
      }),
    );
  });
});
