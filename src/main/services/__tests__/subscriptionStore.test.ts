import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ safeStorage: {
  isEncryptionAvailable: () => false,
  getSelectedStorageBackend: () => "basic_text",
} }));
import { FileSystemService } from "../fileSystemService";
import { SubscriptionStore } from "../subscriptionStore";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

describe("subscription credential persistence", () => {
  it("keeps tokens only in memory when protected OS storage is unavailable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "projecto-credential-test-"));
    directories.push(dir);
    const store = new SubscriptionStore(new FileSystemService(), dir);
    await store.saveRecord({ state: { plan: "free", status: "none" }, sessionToken: "private-session-token" });
    const persisted = JSON.parse(await fs.readFile(path.join(dir, "subscription.json"), "utf8"));
    expect(persisted.encryptedSessionToken).toBeUndefined();
    expect(await store.getRecord()).toMatchObject({ sessionToken: "private-session-token" });
    expect((await new SubscriptionStore(new FileSystemService(), dir).getRecord()).sessionToken).toBeUndefined();
  });
});
