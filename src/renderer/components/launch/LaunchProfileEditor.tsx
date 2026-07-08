import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LaunchCommand, LaunchProfile } from "../../../main/types/shared";
import { Button } from "../common/Button";
import { Input, Textarea } from "../common/Input";
type LaunchProfileEditorProps = {
  open: boolean;
  initialValue?: LaunchProfile;
  commands: LaunchCommand[];
  onOpenChange: (open: boolean) => void;
  onSave: (profile: LaunchProfile) => void;
};
export function LaunchProfileEditor({
  open,
  initialValue,
  commands,
  onOpenChange,
  onSave,
}: LaunchProfileEditorProps): JSX.Element {
  const [name, setName] = useState("");
  const [openEditor, setOpenEditor] = useState(true);
  const [openFolder, setOpenFolder] = useState(false);
  const [openBrowser, setOpenBrowser] = useState(false);
  const [browserUrls, setBrowserUrls] = useState("");
  const [selectedCommandIds, setSelectedCommandIds] = useState<string[]>([]);
  const [askBeforeRun, setAskBeforeRun] = useState(true);
  useEffect(() => {
    if (open) {
      setName(initialValue?.name ?? "");
      setOpenEditor(initialValue?.openEditor ?? true);
      setOpenFolder(initialValue?.openFolder ?? false);
      setOpenBrowser(initialValue?.openBrowser ?? false);
      setBrowserUrls(initialValue?.browserUrls.join("\n") ?? "");
      setSelectedCommandIds(
        initialValue?.commandIds ??
          commands
            .filter((command) => command.runOnLaunch)
            .map((command) => command.id),
      );
      setAskBeforeRun(initialValue?.askBeforeRun ?? true);
    }
  }, [commands, initialValue, open]);
  const normalizedUrls = browserUrls
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-overlay fixed inset-0 z-40 " />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4 outline-none">
            <div className="app-popup-surface w-[min(720px,calc(100vw-2rem))] rounded-[28px] border border-line p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-xl font-semibold tracking-tight text-text">
                    {initialValue
                      ? "Edit Launch Profile"
                      : "Create Launch Profile"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted">
                    Profiles combine commands, editor behavior, and browser URLs
                    into one click.
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
                    name: name.trim(),
                    openEditor,
                    openFolder,
                    openBrowser,
                    browserUrls: normalizedUrls,
                    commandIds: selectedCommandIds,
                    askBeforeRun,
                  });
                }}
              >
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="launch-profile-name"
                  >
                    Profile name
                  </label>
                  <Input
                    id="launch-profile-name"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Default Launch"
                    required
                    value={name}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ProfileToggle
                    checked={openEditor}
                    description="Open the preferred editor when this profile runs."
                    label="Open editor"
                    onCheckedChange={setOpenEditor}
                  />
                  <ProfileToggle
                    checked={openFolder}
                    description="Reveal the project folder in the system file explorer."
                    label="Open folder"
                    onCheckedChange={setOpenFolder}
                  />
                  <ProfileToggle
                    checked={openBrowser}
                    description="Open browser URLs after the profile starts."
                    label="Open browser URLs"
                    onCheckedChange={setOpenBrowser}
                  />
                  <ProfileToggle
                    checked={askBeforeRun}
                    description="Show an explicit confirmation before commands execute."
                    label="Ask before run"
                    onCheckedChange={setAskBeforeRun}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium text-text"
                    htmlFor="browser-urls"
                  >
                    Browser URLs
                  </label>
                  <Textarea
                    id="browser-urls"
                    onChange={(event) => setBrowserUrls(event.target.value)}
                    placeholder="http://localhost:3000&#10;http://127.0.0.1:8000/docs"
                    value={browserUrls}
                  />
                  <div className="text-xs text-muted">
                    One URL per line. These are only opened when &quot;Open
                    browser URLs&quot; is enabled.
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-text">
                      Included commands
                    </div>
                    <div className="text-xs text-muted">
                      Commands stay shared at the project level; profiles choose
                      which ones belong.
                    </div>
                  </div>
                  <div className="space-y-2">
                    {commands.length > 0 ? (
                      commands.map((command) => {
                        const checked = selectedCommandIds.includes(command.id);
                        return (
                          <label
                            className="flex items-center justify-between rounded-2xl border border-line bg-shell px-4 py-3"
                            key={command.id}
                          >
                            <div>
                              <div className="text-sm font-semibold text-text">
                                {command.label}
                              </div>
                              <div className="mt-1 font-mono text-xs text-text">
                                {command.command}
                              </div>
                              <div className="mt-1 text-xs text-muted">
                                {command.cwd}
                                {command.runOnLaunch
                                  ? "- runs on launch"
                                  : "- manual only"}
                              </div>
                            </div>
                            <input
                              checked={checked}
                              className="h-4 w-4 rounded border-line bg-panel text-text focus:ring-accent"
                              onChange={(event) => {
                                setSelectedCommandIds((current) =>
                                  event.target.checked
                                    ? [...current, command.id]
                                    : current.filter(
                                        (commandId) => commandId !== command.id,
                                      ),
                                );
                              }}
                              type="checkbox"
                            />
                          </label>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
                        Add project commands first, then assemble them into
                        launch profiles here.
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button onClick={() => onOpenChange(false)} variant="ghost">
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary">
                    Save Profile
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
type ProfileToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};
function ProfileToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: ProfileToggleProps): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-shell px-4 py-3">
      <div className="pr-4">
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
      <Switch.Root
        checked={checked}
        className="app-switch-track relative h-7 w-12 rounded-full transition"
        onCheckedChange={onCheckedChange}
      >
        <Switch.Thumb className="app-switch-thumb block h-5 w-5 translate-x-1 rounded-full transition data-[state=checked]:translate-x-6" />
      </Switch.Root>
    </div>
  );
}
