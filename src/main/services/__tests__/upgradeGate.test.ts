import { describe, expect, it } from "vitest";

import {
  getUpgradeReasonCopy,
  parseUpgradeReason,
} from "../../../billing/upgradeGate";

describe("upgradeGate", () => {
  it("parses upgrade reasons from Electron-wrapped IPC errors", () => {
    expect(
      parseUpgradeReason(
        new Error(
          "Error invoking remote method 'launcher:launchProfile': Error: UPGRADE_REQUIRED:concurrentLaunches",
        ),
      ),
    ).toBe("concurrentLaunches");
  });

  it("uses clear free-tier copy for concurrent launch limits", () => {
    expect(getUpgradeReasonCopy("concurrentLaunches")).toEqual(
      expect.objectContaining({
        title: "Launch Limit Is 1 On The Free Tier",
      }),
    );
  });
});
