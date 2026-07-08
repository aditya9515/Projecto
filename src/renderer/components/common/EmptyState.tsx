import type { ReactNode } from "react";
import { Button } from "./Button";
type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
};
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-[28px] border border-line bg-panel p-10">
      {" "}
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        {" "}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-shell text-text">
          {" "}
          {icon}{" "}
        </div>{" "}
        <div className="space-y-2">
          {" "}
          <h2 className="text-2xl font-semibold tracking-tight text-text">
            {title}
          </h2>{" "}
          <p className="text-sm leading-6 text-muted">{description}</p>{" "}
        </div>{" "}
        {actionLabel && onAction ? (
          <Button className="mt-2" onClick={onAction} variant="primary">
            {" "}
            {actionLabel}{" "}
          </Button>
        ) : null}{" "}
      </div>{" "}
    </div>
  );
}
