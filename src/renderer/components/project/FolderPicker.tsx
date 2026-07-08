import { FolderSearch } from "lucide-react";
import { Button } from "../common/Button";
type FolderPickerProps = {
  selectedPath: string;
  onSelect: () => Promise<void> | void;
};
export function FolderPicker({
  selectedPath,
  onSelect,
}: FolderPickerProps): JSX.Element {
  return (
    <div className="rounded-[24px] border border-line bg-panel p-5">
      {" "}
      <div className="flex items-start gap-4">
        {" "}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-shell text-text">
          {" "}
          <FolderSearch className="h-5 w-5" />{" "}
        </div>{" "}
        <div className="min-w-0 flex-1 space-y-3">
          {" "}
          <div>
            {" "}
            <div className="text-lg font-semibold tracking-tight text-text">
              Choose a local project folder
            </div>{" "}
            <div className="mt-1 text-sm leading-6 text-muted">
              {" "}
              Projecto scans the selected directory locally and never uploads
              source code.{" "}
            </div>{" "}
          </div>{" "}
          <div className="app-code-surface rounded-2xl border border-line px-4 py-3 font-mono text-sm">
            {" "}
            {selectedPath || "No folder selected"}{" "}
          </div>{" "}
          <Button onClick={() => void onSelect()} variant="primary">
            {" "}
            Browse Folder{" "}
          </Button>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
