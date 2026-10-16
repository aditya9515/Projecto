import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";

const trustedContents = new Set<number>();

export function trustMainWindow(contents: WebContents): void {
  trustedContents.add(contents.id);
  contents.once("destroyed", () => trustedContents.delete(contents.id));
}

export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!trustedContents.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("IPC request rejected: untrusted frame.");
  }
  const actual = new URL(event.senderFrame.url);
  const expected = new URL(MAIN_WINDOW_WEBPACK_ENTRY);
  if (actual.protocol !== expected.protocol || actual.host !== expected.host || actual.pathname !== expected.pathname) {
    throw new Error("IPC request rejected: unexpected document.");
  }
}

export function handleTrusted(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
}
