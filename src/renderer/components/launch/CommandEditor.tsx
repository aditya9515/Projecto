import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LaunchCommand } from "../../../main/types/shared";
import { Button } from "../common/Button";
import { Input } from "../common/Input";
type CommandEditorProps = {
  open: boolean;
  initialValue?: LaunchCommand;
  defaultCwd: string;
  onOpenChange: (open: boolean) => void;
  onSave: (command: LaunchCommand) => void;
};
export function CommandEditor({
  open,
  initialValue,
  defaultCwd,
  onOpenChange,
  onSave,
}: CommandEditorProps): JSX.Element {
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [runOnLaunch, setRunOnLaunch] = useState(true);
  useEffect(() => {
    if (open) {
      setLabel(initialValue?.label ?? "");
      setCommand(initialValue?.command ?? "");
      setCwd(initialValue?.cwd ?? defaultCwd);
      setRunOnLaunch(initialValue?.runOnLaunch ?? true);
    }
  }, [defaultCwd, initialValue, open]);
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-overlay fixed inset-0 z-40 " />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4 outline-none">
            <div className="app-popup-surface w-[min(620px,calc(100vw-2rem))] rounded-[28px] border border-line p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-text">
                    {initialValue ? "Edit Command" : "Add Command"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted">
                    Commands are stored locally and can be reused across launch
                    profiles.
                  </Dialog.Description>
                </div>
                <Dialog.Close className="app-close-control rounded-xl p-2 transition">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
              <form
                className="mt-6 space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSave({
                    id: initialValue?.id ?? crypto.randomUUID(),
                    label: label.trim(),
                    command: command.trim(),
                    cwd: cwd.trim(),
                    runOnLaunch,
                  });
                }}
              >
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="command-label"
                  >
                    Label
                  </label>
                  <Input
                    id="command-label"
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Development server"
                    required
                    value={label}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="command-value"
                  >
                    Command
                  </label>
                  <Input
                    className="font-mono"
                    id="command-value"
                    onChange={(event) => setCommand(event.target.value)}
                    placeholder="npm run dev"
                    required
                    value={command}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="command-cwd"
                  >
                    Working directory
                  </label>
                  <Input
                    className="font-mono"
                    id="command-cwd"
                    onChange={(event) => setCwd(event.target.value)}
                    required
                    value={cwd}
                  />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-line bg-shell px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-text">
                      Run on profile launch
                    </div>
                    <div className="text-xs text-muted">
                      Only commands with this enabled are executed by launch
                      profiles.
                    </div>
                  </div>
                  <Switch.Root
                    checked={runOnLaunch}
                    className="app-switch-track relative h-7 w-12 rounded-full transition"
                    onCheckedChange={setRunOnLaunch}
                  >
                    <Switch.Thumb className="app-switch-thumb block h-5 w-5 translate-x-1 rounded-full transition data-[state=checked]:translate-x-6" />
                  </Switch.Root>
                </div>
                <div className="flex justify-end gap-3">
                  <Button onClick={() => onOpenChange(false)} variant="ghost">
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    Save Command
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
